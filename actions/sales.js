"use server";

import { runAction } from "@/lib/action";
import { operation } from "@/lib/action-context";

/**
 * Records a sale from the POS. Plates leave stock atomically (a sale can never be larger
 * than the plates available); a sale on credit opens a debt for the customer.
 */
export async function recordSale(input) {
  return runAction("recordSale", () => operation("sale.record", input));
}
