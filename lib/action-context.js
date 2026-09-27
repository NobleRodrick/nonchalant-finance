import { db } from "@/lib/prisma";
import { requireOrgUser, resolveDepartment, orgTimezone } from "@/lib/access";
import { invalid } from "@/lib/errors";
import { instantForDateKey, isDateKey, toDateKey } from "@/lib/timezone";
import { postIdempotent, revalidateOperations } from "@/lib/transaction-runner";

/**
 * Signed-in user + authorized department for a server action.
 * `options`: { permission, write, restaurant, read } (see resolveDepartment).
 */
export async function departmentContext(departmentId, options = {}) {
  const user = await requireOrgUser();
  const { department, role } = await resolveDepartment(user, departmentId, options);
  return { user, department, role, timeZone: orgTimezone(user) };
}

/** The instant stored on a record for a business date (today = now; no future dates). */
export function recordDate(dateKey, timeZone) {
  if (!dateKey) return new Date();
  if (!isDateKey(dateKey)) throw invalid("Invalid date.");
  if (dateKey > toDateKey(new Date(), timeZone)) throw invalid("You cannot record anything on a future date.");
  return instantForDateKey(dateKey, timeZone);
}

/** Runs a money posting once per idempotency key, then refreshes every page. */
export async function postOnce(user, idempotencyKey, work) {
  const result = await postIdempotent({ organizationId: user.organizationId, idempotencyKey, work });
  revalidateOperations();
  return result;
}

/** Runs a non-money change in one transaction, then refreshes every page. */
export async function change(work) {
  const result = await db.$transaction(work, { timeout: 30000, maxWait: 10000 });
  revalidateOperations();
  return result;
}
