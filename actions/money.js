"use server";

import { runAction } from "@/lib/action";
import { operation } from "@/lib/action-context";

/** Rent income, other income, expense, other expense or a standalone discount. */
export async function recordMoney(input) {
  return runAction("recordMoney", () => operation("money.record", input));
}

/** A purchase (money out); may also add plates to dishes. */
export async function recordPurchase(input) {
  return runAction("recordPurchase", () => operation("purchase.record", input));
}

/** Voids a money record (sale, income, expense, purchase, repayment, handover) with a reason. */
export async function voidRecord(input) {
  return runAction("voidRecord", () => operation("record.void", input));
}
