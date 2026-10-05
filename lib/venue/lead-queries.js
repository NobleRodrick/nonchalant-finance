/** Reading the leads of an event venue department (lists, follow-ups, conversion). */
import { db } from "@/lib/prisma";
import { dbDate } from "./dates";

export const LEAD_SELECT = {
  id: true,
  clientName: true,
  phone: true,
  email: true,
  enquiryDate: true,
  proposedDate: true,
  eventType: true,
  guests: true,
  priceDiscussed: true,
  source: true,
  followUpDate: true,
  status: true,
  closedReason: true,
  notes: true,
  packageId: true,
  package: { select: { name: true } },
  handledBy: { select: { id: true, name: true } },
  booking: { select: { id: true, referenceNo: true, status: true } },
};

/** Leads with an enquiry in [fromKey, toKey] (or all when no range), newest first. */
export async function listLeads({ departmentId, fromKey, toKey, status, q, take = 300, client = db }) {
  const where = { departmentId };
  if (fromKey || toKey) where.enquiryDate = { ...(fromKey ? { gte: dbDate(fromKey) } : {}), ...(toKey ? { lte: dbDate(toKey) } : {}) };
  if (status === "OPEN") where.status = { in: ["NEW", "CONTACTED", "FOLLOW_UP", "NEGOTIATING"] };
  else if (status) where.status = status;
  const term = String(q || "").trim();
  if (term) where.OR = [{ clientName: { contains: term, mode: "insensitive" } }, { phone: { contains: term } }, { eventType: { contains: term, mode: "insensitive" } }];
  return client.venueLead.findMany({ where, select: LEAD_SELECT, orderBy: [{ enquiryDate: "desc" }, { createdAt: "desc" }], take });
}
