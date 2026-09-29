"use server";

import { runAction } from "@/lib/action";
import { operation } from "@/lib/action-context";

/**
 * The Boss asks one or more departments to hand over the cash of a period (default: today).
 * `departmentIds` empty = every restaurant department. The heads are notified.
 */
export async function requestCash(input) {
  return runAction("requestCash", () => operation("cash.request", input));
}

/** The Boss withdraws a request that is still waiting. */
export async function cancelCashRequestAction(input) {
  return runAction("cancelCashRequest", () => operation("cash.request.cancel", input));
}
