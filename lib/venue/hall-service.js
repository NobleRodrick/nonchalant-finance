/**
 * The hall of an event venue department and its price rules: reading them for pages, and the
 * changes the operations make (lib/operations/venue.js). Every query is scoped to the
 * department (and so to its organization).
 */
import { db } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { isDateKey } from "@/lib/timezone";
import { dbDate, dateKeyOf } from "./dates";

const RULE_KINDS = ["WEEKDAY", "SEASON", "SPECIAL_DATE"];

/** A rule as pages and the pricing function use it (dates as keys). */
export function ruleView(r) {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    weekday: r.weekday,
    startKey: dateKeyOf(r.startDate),
    endKey: dateKeyOf(r.endDate),
    price: r.price,
    isActive: r.isActive,
    updatedAt: r.updatedAt?.toISOString?.() || r.updatedAt,
  };
}

/** The department's hall (the first active one) with its price rules, or null before set-up. */
export async function hallOf(departmentId, client = db) {
  const venue = await client.venue.findFirst({
    where: { departmentId, isActive: true },
    orderBy: { createdAt: "asc" },
    include: { priceRules: { orderBy: [{ kind: "asc" }, { weekday: "asc" }, { startDate: "asc" }] } },
  });
  if (!venue) return null;
  const { priceRules, ...hall } = venue;
  return { ...hall, rules: priceRules.map(ruleView) };
}

function hallFields(input) {
  const name = String(input?.name ?? "").trim();
  if (name.length < 2) throw invalid("Enter the hall's name.");
  const intOrNull = (v, label, { min = 0, max = 1e9 } = {}) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${label} must be a whole number between ${min} and ${max}.`);
    return n;
  };
  const basePrice = intOrNull(input.basePrice, "The base price") ?? 0;
  const hold = intOrNull(input.reservationHoldDays, "The reservation hold", { min: 1, max: 90 }) ?? 7;
  return {
    name: name.slice(0, 120),
    description: String(input.description ?? "").trim().slice(0, 1000) || null,
    capacity: intOrNull(input.capacity, "The capacity", { min: 1, max: 100000 }),
    basePrice,
    reservationHoldDays: hold,
  };
}

/** Creates the department's hall, or updates it. */
export async function saveHall(tx, { user, department }, input) {
  const data = hallFields(input);
  const existing = await tx.venue.findFirst({ where: { departmentId: department.id, isActive: true }, orderBy: { createdAt: "asc" } });
  try {
    const venue = existing
      ? await tx.venue.update({ where: { id: existing.id }, data })
      : await tx.venue.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id } });
    await recordAudit(tx, {
      user,
      departmentId: department.id,
      action: existing ? "VENUE_UPDATED" : "VENUE_CREATED",
      entityType: "Venue",
      entityId: venue.id,
      before: existing ? hallFields(existing) : undefined,
      after: data,
    });
    return { venueId: venue.id, name: venue.name };
  } catch (error) {
    if (error?.code === "P2002") throw conflict(`A hall named "${data.name}" already exists in this department.`);
    throw error;
  }
}

/** Validated fields of a price rule. */
function ruleFields(input) {
  const kind = input?.kind;
  if (!RULE_KINDS.includes(kind)) throw invalid("Choose the kind of price: a day of the week, a season or a special date.");
  const price = Number(input.price);
  if (!Number.isInteger(price) || price < 0 || price > 1e10) throw invalid("The price must be a whole number of francs (0 or more).");
  const label = String(input.label ?? "").trim().slice(0, 80) || null;
  if (kind === "WEEKDAY") {
    const weekday = Number(input.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw invalid("Choose the day of the week.");
    return { kind, price, label, weekday, startDate: null, endDate: null };
  }
  if (!isDateKey(input.startKey)) throw invalid(kind === "SEASON" ? "Choose the first day of the season." : "Choose the date.");
  if (kind === "SPECIAL_DATE") return { kind, price, label, weekday: null, startDate: dbDate(input.startKey), endDate: null };
  if (!isDateKey(input.endKey)) throw invalid("Choose the last day of the season.");
  if (input.endKey < input.startKey) throw invalid("The season must end on or after its first day.");
  if (!label) throw invalid("Name the season (e.g. December holidays).");
  return { kind, price, label, weekday: null, startDate: dbDate(input.startKey), endDate: dbDate(input.endKey) };
}

/**
 * Adds or changes a price rule of the hall. One price per day of the week and per special date:
 * another rule for the same day is refused (change the existing one).
 */
export async function savePriceRule(tx, { user, department }, input) {
  const venue = await tx.venue.findFirst({ where: { id: input?.venueId || "-", departmentId: department.id } });
  if (!venue) throw notFound("Set up the hall first.");
  const data = ruleFields(input);
  const existing = input.id ? await tx.venuePriceRule.findFirst({ where: { id: input.id, venueId: venue.id } }) : null;
  if (input.id && !existing) throw notFound("Price not found.");

  const sameDay =
    data.kind === "WEEKDAY"
      ? { kind: "WEEKDAY", weekday: data.weekday }
      : data.kind === "SPECIAL_DATE"
        ? { kind: "SPECIAL_DATE", startDate: data.startDate }
        : null;
  if (sameDay) {
    const clash = await tx.venuePriceRule.findFirst({ where: { venueId: venue.id, isActive: true, ...sameDay, ...(existing ? { id: { not: existing.id } } : {}) } });
    if (clash) throw conflict(data.kind === "WEEKDAY" ? "This day of the week already has a price: change that one." : "This date already has a special price: change that one.");
  }
  const rule = existing
    ? await tx.venuePriceRule.update({ where: { id: existing.id }, data: { ...data, isActive: true } })
    : await tx.venuePriceRule.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id, venueId: venue.id } });
  await recordAudit(tx, {
    user,
    departmentId: department.id,
    action: existing ? "VENUE_PRICE_UPDATED" : "VENUE_PRICE_CREATED",
    entityType: "VenuePriceRule",
    entityId: rule.id,
    before: existing ? ruleView(existing) : undefined,
    after: ruleView(rule),
  });
  return { ruleId: rule.id };
}

/** Removes a price rule (bookings already made keep their price). */
export async function removePriceRule(tx, { user, department }, input) {
  const rule = await tx.venuePriceRule.findFirst({ where: { id: input?.ruleId || "-", departmentId: department.id } });
  if (!rule) throw notFound("Price not found.");
  await tx.venuePriceRule.delete({ where: { id: rule.id } });
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_PRICE_REMOVED", entityType: "VenuePriceRule", entityId: rule.id, before: ruleView(rule) });
  return { ruleId: rule.id };
}
