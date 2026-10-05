/**
 * Leads of an event venue: enquiries recorded and followed up until they are booked (a booking
 * made from the lead: lib/venue/booking-service), lost or cancelled. Run by the operations.
 */
import { recordAudit } from "@/lib/audit";
import { invalid, notFound } from "@/lib/errors";
import { isDateKey, toDateKey } from "@/lib/timezone";
import { dbDate } from "./dates";
import { CLOSED_LEAD_STATUSES, LEAD_STATUS_LABELS } from "./lead-math";

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

function dateOrNull(value, label) {
  if (!value) return null;
  if (!isDateKey(value)) throw invalid(`${label} is not a date.`);
  return dbDate(value);
}

function intOrNull(value, label) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw invalid(`${label} must be a whole number (0 or more).`);
  return n;
}

async function handlerOf(tx, department, id) {
  if (!id) return null;
  const m = await tx.userDepartment.findFirst({ where: { userId: id, departmentId: department.id, isActive: true }, select: { userId: true } });
  if (!m) throw invalid("The person handling the lead must be a head of this department.");
  return m.userId;
}

/** Records an enquiry, or changes it. A new lead is handled by the person recording it. */
export async function saveLead(tx, ctx, input) {
  const { user, department } = ctx;
  const clientName = text(input?.clientName, 120);
  if (!clientName) throw invalid("Enter the name of the person who enquired.");
  const status = input.status && LEAD_STATUS_LABELS[input.status] && input.status !== "BOOKED" ? input.status : undefined;
  const data = {
    clientName,
    phone: text(input.phone, 40),
    email: text(input.email, 160),
    proposedDate: dateOrNull(input.proposedDateKey, "The proposed date"),
    eventType: text(input.eventType, 80),
    guests: intOrNull(input.guests, "The number of guests"),
    priceDiscussed: intOrNull(input.priceDiscussed, "The price discussed"),
    source: text(input.source, 60),
    followUpDate: dateOrNull(input.followUpKey, "The follow-up date"),
    notes: text(input.notes, 2000),
  };
  if (input.packageId) {
    const pkg = await tx.venuePackage.findFirst({ where: { id: input.packageId, departmentId: department.id } });
    if (!pkg) throw notFound("Package not found.");
    data.packageId = pkg.id;
  } else data.packageId = null;
  if (input.handledById !== undefined) data.handledById = await handlerOf(tx, department, input.handledById);
  if (input.id) {
    const existing = await tx.venueLead.findFirst({ where: { id: input.id, departmentId: department.id } });
    if (!existing) throw notFound("Lead not found.");
    if (status && status !== existing.status) Object.assign(data, statusFields(existing, status, input.closedReason, ctx));
    const lead = await tx.venueLead.update({ where: { id: existing.id }, data });
    await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_LEAD_UPDATED", entityType: "VenueLead", entityId: lead.id, before: { status: existing.status }, after: { status: lead.status } });
    return { leadId: lead.id, status: lead.status };
  }
  const enquiry = isDateKey(input.enquiryDateKey) ? input.enquiryDateKey : toDateKey(ctx.date || ctx.now, ctx.timeZone);
  const lead = await tx.venueLead.create({
    data: {
      ...data,
      enquiryDate: dbDate(enquiry),
      status: status || "NEW",
      handledById: data.handledById === undefined ? (user.role === "ADMIN" ? null : user.id) : data.handledById,
      organizationId: user.organizationId,
      departmentId: department.id,
    },
  });
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_LEAD_CREATED", entityType: "VenueLead", entityId: lead.id, after: { clientName, source: data.source, status: lead.status } });
  return { leadId: lead.id, status: lead.status };
}

function statusFields(existing, status, reason, ctx) {
  if (existing.status === "BOOKED") throw invalid("This lead is booked: cancel its booking to change it.");
  const why = text(reason, 300);
  if ((status === "LOST" || status === "CANCELLED") && !why) throw invalid(`Say why the lead is ${status === "LOST" ? "lost (e.g. price, date taken, chose another venue)" : "cancelled"}.`);
  return { status, closedReason: CLOSED_LEAD_STATUSES.includes(status) ? why : null, closedAt: CLOSED_LEAD_STATUSES.includes(status) ? ctx.now : null };
}

/** Moves a lead to another status (Booked only by making its booking). */
export async function setLeadStatus(tx, ctx, input) {
  const lead = await tx.venueLead.findFirst({ where: { id: input?.leadId || "-", departmentId: ctx.department.id } });
  if (!lead) throw notFound("Lead not found.");
  const status = input.status;
  if (!LEAD_STATUS_LABELS[status] || status === "BOOKED") throw invalid("Choose the new status (a lead is booked by making its booking).");
  const data = statusFields(lead, status, input.reason, ctx);
  if (input.followUpKey !== undefined) data.followUpDate = dateOrNull(input.followUpKey, "The follow-up date");
  await tx.venueLead.update({ where: { id: lead.id }, data });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "VENUE_LEAD_STATUS", entityType: "VenueLead", entityId: lead.id, before: { status: lead.status }, after: { status, reason: data.closedReason } });
  return { leadId: lead.id, status };
}
