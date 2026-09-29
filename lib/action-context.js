import { db } from "@/lib/prisma";
import { requireOrgUser, resolveDepartment, orgTimezone } from "@/lib/access";
import { revalidateOperations } from "@/lib/transaction-runner";
import { executeOperation } from "@/lib/operations/execute";

/**
 * Signed-in user + authorized department for a server action.
 * `options`: { permission, write, restaurant, read } (see resolveDepartment).
 */
export async function departmentContext(departmentId, options = {}) {
  const user = await requireOrgUser();
  const { department, role } = await resolveDepartment(user, departmentId, options);
  return { user, department, role, timeZone: orgTimezone(user) };
}

/** Runs a non-money change in one transaction, then refreshes every page. */
export async function change(work) {
  const result = await db.$transaction(work, { timeout: 30000, maxWait: 10000 });
  revalidateOperations();
  return result;
}

/**
 * Server-action body for a named operation (lib/operations/registry): runs it once per
 * idempotency key, refreshes the pages and returns its result (+ duplicate flag).
 */
export async function operation(kind, input) {
  const user = await requireOrgUser();
  const { idempotencyKey, occurredAt, ...rest } = input || {};
  const out = await executeOperation({ user, kind, input: rest, key: idempotencyKey, occurredAt });
  revalidateOperations();
  const result = out.result;
  return Array.isArray(result) ? result : { ...result, duplicate: out.duplicate };
}
