"use server";

import { runAction } from "@/lib/action";
import { orgTimezone, requireAdmin } from "@/lib/access";
import { change } from "@/lib/action-context";
import { cancelCashRequest, createCashRequests } from "@/lib/finance/cash-requests";
import { toDateKey } from "@/lib/timezone";

/**
 * The Boss asks one or more departments to hand over the cash of a period (default: today).
 * `departmentIds` empty = every restaurant department. The heads are notified.
 */
export async function requestCash(input) {
  return runAction("requestCash", async () => {
    const user = await requireAdmin();
    const todayKey = toDateKey(new Date(), orgTimezone(user));
    const fromKey = input?.fromKey || todayKey;
    const toKey = input?.toKey || fromKey;
    return change((tx) => createCashRequests(tx, { user, departmentIds: input?.departmentIds || [], fromKey, toKey, note: input?.note, todayKey }));
  });
}

/** The Boss withdraws a request that is still waiting. */
export async function cancelCashRequestAction(input) {
  return runAction("cancelCashRequest", async () => {
    const user = await requireAdmin();
    const res = await change((tx) => cancelCashRequest(tx, { user, requestId: input?.requestId }));
    return { id: res.id, status: res.status };
  });
}
