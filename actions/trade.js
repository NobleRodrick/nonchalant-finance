"use server";

import { runAction } from "@/lib/action";
import { operation } from "@/lib/action-context";
import { invalid } from "@/lib/errors";
import { TRADE_OPERATIONS } from "@/lib/operations/trade";

/**
 * Shops, bars, pressings, car washes, other activities: runs one of their operations
 * (lib/operations/trade.js) online, with the same checks as when the offline outbox sends it. The
 * forms record through the outbox; this is for direct calls and tests.
 */
export async function tradeOperation(kind, input) {
  return runAction(`trade:${kind}`, () => {
    if (!TRADE_OPERATIONS[kind]) throw invalid("Unknown operation.");
    return operation(kind, input);
  });
}
