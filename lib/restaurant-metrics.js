export function calculateSaleBreakdown({
  grossSales = 0,
  discounts = 0,
  cashSales = 0,
  creditSales = 0,
  otherIncome = 0,
} = {}) {
  const safeGross = Number(grossSales) || 0;
  const safeDiscounts = Number(discounts) || 0;
  const safeCashSales = Number(cashSales) || 0;
  const safeCreditSales = Number(creditSales) || 0;
  const safeOtherIncome = Number(otherIncome) || 0;

  const netSales = Math.max(0, safeGross - safeDiscounts);

  const validCashSales = safeCashSales > 0 ? Math.min(safeCashSales, netSales) : 0;
  const validCreditSales = safeCreditSales > 0 ? Math.min(safeCreditSales, Math.max(0, netSales - validCashSales)) : 0;

  const finalCashSales =
    validCashSales > 0 || (safeGross > 0 && safeCreditSales === 0)
      ? validCashSales > 0
        ? validCashSales
        : netSales
      : 0;

  const finalCreditSales =
    validCreditSales > 0 ? validCreditSales : safeCreditSales > 0 ? Math.max(0, netSales - finalCashSales) : 0;

  return {
    grossSales: safeGross,
    discounts: safeDiscounts,
    netSales,
    cashSales: finalCashSales,
    creditSales: finalCreditSales,
    otherIncome: safeOtherIncome,
    cashToHandOver: Math.max(0, finalCashSales + safeOtherIncome),
  };
}

export function calculateStockClosing({
  openingStock = 0,
  newPurchases = 0,
  stockUsed = 0,
  damagedStock = 0,
} = {}) {
  const safeOpening = Number(openingStock) || 0;
  const safePurchases = Number(newPurchases) || 0;
  const safeUsed = Number(stockUsed) || 0;
  const safeDamaged = Number(damagedStock) || 0;

  return {
    openingStock: safeOpening,
    newPurchases: safePurchases,
    stockUsed: safeUsed,
    damagedStock: safeDamaged,
    availableStock: safeOpening + safePurchases,
    closingStock: Math.max(0, safeOpening + safePurchases - safeUsed - safeDamaged),
  };
}

export function calculateCashToHandOver({ cashSales = 0, otherIncome = 0, purchases = 0, expenses = 0 } = {}) {
  const safeCashSales = Number(cashSales) || 0;
  const safeOtherIncome = Number(otherIncome) || 0;
  const safePurchases = Number(purchases) || 0;
  const safeExpenses = Number(expenses) || 0;

  return Math.max(0, safeCashSales + safeOtherIncome - safePurchases - safeExpenses);
}
