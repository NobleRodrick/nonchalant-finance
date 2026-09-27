import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { findIdempotentTransaction, isUniqueViolationOnKey, normalizeIdempotencyKey } from "@/lib/idempotency";

/**
 * Runs a financial posting with idempotency protection.
 * - If a transaction with the same idempotency key exists, returns it (duplicate: true).
 * - Otherwise runs `work(tx, key)` inside one database transaction.
 * - A concurrent duplicate that loses the race on the unique key returns the winner.
 */
export async function postIdempotent({ organizationId, idempotencyKey, work, timeout = 20000 }) {
  const key = normalizeIdempotencyKey(idempotencyKey);
  const existing = await findIdempotentTransaction(db, organizationId, key);
  if (existing) return { duplicate: true, transaction: existing };
  try {
    const result = await db.$transaction((tx) => work(tx, key), { timeout, maxWait: 10000 });
    return { duplicate: false, ...result };
  } catch (error) {
    if (key && isUniqueViolationOnKey(error)) {
      const winner = await findIdempotentTransaction(db, organizationId, key);
      if (winner) return { duplicate: true, transaction: winner };
    }
    throw error;
  }
}

/** Refreshes every server-rendered page (all operational pages are dynamic). */
export function revalidateOperations() {
  revalidatePath("/", "layout");
}
