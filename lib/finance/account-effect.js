import { accountDelta } from "@/lib/finance/money-math";

/**
 * Applies a transaction's effect (or its reversal) to its linked account balance.
 * Uses an atomic increment so concurrent postings never overwrite each other.
 */
export async function applyAccountEffect(tx, transaction, { reverse = false } = {}) {
  if (!transaction.accountId) return 0;
  const delta = accountDelta({ ...transaction, status: "COMPLETED" });
  if (!delta) return 0;
  const signed = reverse ? -delta : delta;
  await tx.account.update({
    where: { id: transaction.accountId },
    data: { balance: { increment: signed } },
  });
  return signed;
}
