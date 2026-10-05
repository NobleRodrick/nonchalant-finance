/** Small helpers shared by the operation definitions (lib/operations/*). */
import { db } from "@/lib/prisma";
import { invalid, notFound } from "@/lib/errors";

/** Trimmed text, null when empty, at most `max` characters. */
export const text = (v, max = 2000) => String(v ?? "").trim().slice(0, max) || null;

/** The value when it is an array, otherwise an empty one. */
export const list = (v) => (Array.isArray(v) ? v : []);

/** A whole number of FCFA (0 or more), or an error naming the field. */
export function wholeFrancs(value, label, { min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min) throw invalid(`${label} must be a whole number of francs${min > 0 ? ` (at least ${min})` : " (0 or more)"}.`);
  return n;
}

/** Access rules of a write in a department of one type ("RESTAURANT", "EVENT_VENUE"…). */
export function writeIn(domain, permission) {
  return { write: true, domain, ...(permission ? { permission } : {}) };
}

/** An operation of the Boss, across his organization. */
export const BOSS = { scope: "organization", boss: true };

/** Department of the money record an operation addresses by id (voids). */
export async function departmentOfTransaction(input, user) {
  if (!input?.transactionId) throw invalid("Choose the record.");
  const t = await db.transaction.findFirst({ where: { id: input.transactionId, organizationId: user.organizationId }, select: { departmentId: true } });
  if (!t) throw notFound("Record not found.");
  return t.departmentId;
}
