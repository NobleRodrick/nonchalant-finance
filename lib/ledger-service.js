/**
 * Centralized Ledger and Calculation Engine for Springer Finance.
 * Implements the calculation contracts defined in Section 9 of the implementation plan.
 */

export function toSafeNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && typeof val.toNumber === "function") {
    return val.toNumber();
  }
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Calculates sale totals for itemized lines with discount allocation.
 */
export function calculateSaleTotals(lines = [], discountAmount = 0) {
  const safeDiscount = Math.max(0, toSafeNumber(discountAmount));
  let grossAmount = 0;

  const processedLines = lines.map((line) => {
    const quantity = Math.max(0, toSafeNumber(line.quantity));
    const unitPrice = Math.max(0, toSafeNumber(line.unitPrice));
    const lineTotal = quantity * unitPrice;
    grossAmount += lineTotal;
    return {
      ...line,
      quantity,
      unitPrice,
      totalAmount: lineTotal,
    };
  });

  const validDiscount = Math.min(safeDiscount, grossAmount);
  const netAmount = Math.max(0, grossAmount - validDiscount);

  // Allocate discount proportionally across lines
  const finalLines = processedLines.map((line) => {
    const lineDiscount =
      grossAmount > 0 ? (line.totalAmount / grossAmount) * validDiscount : 0;
    return {
      ...line,
      discountAmount: Math.round(lineDiscount),
      netAmount: Math.max(0, line.totalAmount - lineDiscount),
    };
  });

  return {
    grossAmount,
    discountAmount: validDiscount,
    netAmount,
    lines: finalLines,
  };
}

/**
 * Recalculates weighted-average cost when new inventory is purchased.
 * Formula: (existingQty * existingCost + purchasedQty * purchaseCost) / (existingQty + purchasedQty)
 */
export function calculateWeightedAverageCost({
  currentQuantity = 0,
  currentValuationCost = 0,
  purchaseQuantity = 0,
  purchaseUnitCost = 0,
}) {
  const curQty = Math.max(0, toSafeNumber(currentQuantity));
  const curCost = Math.max(0, toSafeNumber(currentValuationCost));
  const newQty = Math.max(0, toSafeNumber(purchaseQuantity));
  const newCost = Math.max(0, toSafeNumber(purchaseUnitCost));

  const totalQuantity = curQty + newQty;
  if (totalQuantity <= 0) return newCost > 0 ? newCost : curCost;

  const totalValue = curQty * curCost + newQty * newCost;
  return Math.round((totalValue / totalQuantity) * 100) / 100;
}

/**
 * Calculates expected cash and reconciles with actual CEO cash handovers.
 */
export function calculateCashReconciliation({
  cashSales = 0,
  rentIncome = 0,
  otherIncome = 0,
  debtPaymentsReceived = 0,
  cashPurchases = 0,
  cashExpenses = 0,
  otherExpenses = 0,
  actualHandover = 0,
  countedCash = null,
}) {
  const safeCashSales = Math.max(0, toSafeNumber(cashSales));
  const safeRentIncome = Math.max(0, toSafeNumber(rentIncome));
  const safeOtherIncome = Math.max(0, toSafeNumber(otherIncome));
  const safeDebtPayments = Math.max(0, toSafeNumber(debtPaymentsReceived));

  const safeCashPurchases = Math.max(0, toSafeNumber(cashPurchases));
  const safeCashExpenses = Math.max(0, toSafeNumber(cashExpenses));
  const safeOtherExpenses = Math.max(0, toSafeNumber(otherExpenses));
  const safeActualHandover = Math.max(0, toSafeNumber(actualHandover));

  const totalCashIn =
    safeCashSales + safeRentIncome + safeOtherIncome + safeDebtPayments;
  const totalCashOut =
    safeCashPurchases + safeCashExpenses + safeOtherExpenses;

  const expectedCashAvailable = Math.max(0, totalCashIn - totalCashOut);
  const cashRemaining = expectedCashAvailable - safeActualHandover;

  let variance = 0;
  if (countedCash !== null && countedCash !== undefined) {
    const safeCounted = toSafeNumber(countedCash);
    variance = safeCounted - cashRemaining;
  }

  return {
    totalCashIn,
    totalCashOut,
    expectedCashAvailable,
    actualHandover: safeActualHandover,
    cashRemaining,
    variance,
  };
}

/**
 * Derives debt status and outstanding balance from payments.
 */
export function deriveDebtDetails(amountOwed = 0, amountPaid = 0) {
  const owed = Math.max(0, toSafeNumber(amountOwed));
  const paid = Math.max(0, toSafeNumber(amountPaid));
  const balance = Math.max(0, owed - paid);

  let status = "UNPAID";
  if (balance <= 0 && owed > 0) {
    status = "PAID";
  } else if (paid > 0 && balance > 0) {
    status = "PARTIALLY_PAID";
  }

  return {
    amountOwed: owed,
    amountPaid: paid,
    outstandingBalance: balance,
    status,
  };
}

/**
 * Computes closing quantities and valuation for inventory items.
 */
export function calculateInventoryClosing({
  openingQuantity = 0,
  purchasedQuantity = 0,
  soldQuantity = 0,
  wastedQuantity = 0,
  unitCost = 0,
}) {
  const opening = Math.max(0, toSafeNumber(openingQuantity));
  const purchased = Math.max(0, toSafeNumber(purchasedQuantity));
  const sold = Math.max(0, toSafeNumber(soldQuantity));
  const wasted = Math.max(0, toSafeNumber(wastedQuantity));
  const cost = Math.max(0, toSafeNumber(unitCost));

  const closingQuantity = Math.max(0, opening + purchased - sold - wasted);
  const closingValue = closingQuantity * cost;

  return {
    openingQuantity: opening,
    purchasedQuantity: purchased,
    soldQuantity: sold,
    wastedQuantity: wasted,
    closingQuantity,
    unitCost: cost,
    closingValue,
  };
}
