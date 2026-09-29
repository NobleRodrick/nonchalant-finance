"use server";

import { runAction } from "@/lib/action";
import { operation } from "@/lib/action-context";

/**
 * Records a debt: a customer took food on credit outside the POS. With dishes, plates leave
 * stock like a sale; without dishes, an amount of "unlisted items" is recorded. Either way
 * the day's sales include it and the customer owes it.
 */
export async function recordDebt(input) {
  return runAction("recordDebt", () => operation("debt.record", input));
}

/** A debt that existed before the app (no sale today, no cash). */
export async function recordOldDebt(input) {
  return runAction("recordOldDebt", () => operation("debt.old", input));
}

/** A customer pays back all or part of a debt. */
export async function recordRepayment(input) {
  return runAction("recordRepayment", () => operation("debt.repay", input));
}

/** Cancels an old debt recorded by mistake (debts from sales are cancelled by voiding the sale). */
export async function cancelOldDebt(input) {
  return runAction("cancelOldDebt", () => operation("debt.cancel", input));
}

/** Adds or updates a customer in the department's directory. */
export async function saveDebtor(input) {
  return runAction("saveDebtor", () => operation("debtor.save", input));
}
