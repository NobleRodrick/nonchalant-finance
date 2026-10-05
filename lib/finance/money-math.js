/**
 * Money arithmetic (pure; safe for client and server). One definition for every figure.
 *
 * Money in  = Sales (gross, all payment methods incl. credit) + Rent income + Other income
 * Money out = Discounts (on sales + standalone) + Purchases + Expenses + Other expenses
 * Result    = Money in − Money out
 *
 * Debt repayments move cash but are not income (the sale was already counted).
 * Venue booking payments and refunds move cash but are not income of the day: a booking is
 * revenue of its event date (lib/venue); until then the money is the client's advance.
 * Cash handed over to the Boss is a transfer, not an expense.
 * The cash drawer counts physical CASH only; MoMo and bank receipts are listed separately.
 */
import { roundMoney } from "@/lib/money";
import { CAPITAL_CATEGORIES } from "@/data/categories";

export const MONEY_IN_TYPES = ["SALE", "RENT_INCOME", "OTHER_INCOME"];
export const MONEY_OUT_TYPES = ["DISCOUNT", "PURCHASE", "EXPENSE", "OTHER_EXPENSE"];
export const PAYMENT_METHODS = ["CASH", "MOMO", "BANK_TRANSFER", "CREDIT"];
export const COUNTED_HANDOVER_STATUSES = ["RECORDED", "CONFIRMED"];

export const TYPE_LABELS = {
  SALE: "Sales",
  RENT_INCOME: "Rent income",
  OTHER_INCOME: "Other income",
  DISCOUNT: "Discounts",
  PURCHASE: "Purchases",
  EXPENSE: "Expenses",
  OTHER_EXPENSE: "Other expenses",
  DEBT_PAYMENT: "Debt repayment",
  CASH_HANDOVER: "Cash handed to Boss",
  BOOKING_PAYMENT: "Booking payments",
  BOOKING_REFUND: "Booking refunds",
};

export const METHOD_LABELS = {
  CASH: "Cash",
  MOMO: "Mobile Money",
  BANK_TRANSFER: "Bank",
  CREDIT: "On credit",
};

/** Canonical type of a transaction (legacy rows mapped), or null when voided. */
export function classify(t) {
  if (!t || t.status === "VOIDED") return null;
  switch (t.type) {
    case "INCOME":
      if (t.operationCategory === "DEBT_COLLECTION") return "DEBT_PAYMENT";
      if (t.operationCategory === "RENT_INCOME") return "RENT_INCOME";
      return "OTHER_INCOME";
    case "EXPENSE":
      if (t.operationCategory === "CASH_HANDOVER") return "CASH_HANDOVER";
      if (t.operationCategory === "OTHER_EXPENSE") return "OTHER_EXPENSE";
      if (typeof t.category === "string" && t.category.startsWith("purchase-")) return "PURCHASE";
      return "EXPENSE";
    case "SALE":
    case "RENT_INCOME":
    case "OTHER_INCOME":
    case "DEBT_PAYMENT":
    case "PURCHASE":
    case "OTHER_EXPENSE":
    case "CASH_HANDOVER":
    case "DISCOUNT":
    case "BOOKING_PAYMENT":
    case "BOOKING_REFUND":
      return t.type;
    default:
      return null;
  }
}

/** Signed effect of a transaction on the account (drawer) it is linked to. */
export function accountDelta(t) {
  const cls = classify({ ...t, status: "COMPLETED" });
  if (!cls || t.paymentMethod === "CREDIT") return 0;
  const amount = roundMoney(t.amount);
  if (["SALE", "RENT_INCOME", "OTHER_INCOME", "DEBT_PAYMENT", "BOOKING_PAYMENT"].includes(cls)) return amount;
  if (["PURCHASE", "EXPENSE", "OTHER_EXPENSE", "DISCOUNT", "CASH_HANDOVER", "BOOKING_REFUND"].includes(cls)) return -amount;
  return 0;
}

const byMethod = () => ({ CASH: 0, MOMO: 0, BANK_TRANSFER: 0, CREDIT: 0 });

/** Aggregates transactions (any period) into the money figures. */
export function summarizeMoney(transactions = []) {
  const m = {
    salesGross: 0,
    saleDiscounts: 0,
    standaloneDiscounts: 0,
    discounts: 0,
    netSales: 0,
    salesByMethod: byMethod(), // net amounts collected per method
    rentIncome: 0,
    otherIncome: 0,
    moneyIn: 0,
    purchases: 0,
    purchasesOnCredit: 0,
    expenses: 0,
    otherExpenses: 0,
    moneyOut: 0,
    result: 0,
    debtRepayments: 0,
    bookingPayments: 0, // venue: money received from clients for bookings
    bookingRefunds: 0, // venue: money given back to clients
    assetPurchases: 0, // furniture & equipment bought: an investment (cash out, not a cost)
    handoverTransactions: 0,
    expensesByCategory: {},
    otherExpensesByCategory: {},
    receivedByMethod: byMethod(), // all money received (sales + income + repayments)
    paidByMethod: byMethod(), // all money paid out
    cash: { in: 0, out: 0 }, // physical cash drawer (excludes handovers)
    count: 0,
    voided: 0,
  };
  for (const t of transactions) {
    const cls = classify(t);
    if (!cls) {
      if (t?.status === "VOIDED") m.voided += 1;
      continue;
    }
    m.count += 1;
    const amount = roundMoney(t.amount);
    const method = PAYMENT_METHODS.includes(t.paymentMethod) ? t.paymentMethod : "CASH";
    const isCash = method === "CASH";
    switch (cls) {
      case "SALE": {
        const gross = t.grossAmount !== null && t.grossAmount !== undefined ? roundMoney(t.grossAmount) : amount;
        const discount = roundMoney(t.discountAmount);
        m.salesGross += gross;
        m.saleDiscounts += discount;
        m.salesByMethod[method] += amount;
        if (method !== "CREDIT") m.receivedByMethod[method] += amount;
        if (isCash) m.cash.in += amount;
        break;
      }
      case "RENT_INCOME":
      case "OTHER_INCOME":
        if (cls === "RENT_INCOME") m.rentIncome += amount;
        else m.otherIncome += amount;
        m.receivedByMethod[method] += amount;
        if (isCash) m.cash.in += amount;
        break;
      case "DEBT_PAYMENT":
        m.debtRepayments += amount;
        m.receivedByMethod[method] += amount;
        if (isCash) m.cash.in += amount;
        break;
      case "DISCOUNT":
        m.standaloneDiscounts += amount;
        m.paidByMethod[method] += amount;
        if (isCash) m.cash.out += amount;
        break;
      case "PURCHASE":
        m.purchases += amount;
        if (method === "CREDIT") m.purchasesOnCredit += amount;
        else m.paidByMethod[method] += amount;
        if (isCash) m.cash.out += amount;
        break;
      case "EXPENSE":
      case "OTHER_EXPENSE": {
        if (CAPITAL_CATEGORIES.has(t.category)) {
          m.assetPurchases += amount;
          m.paidByMethod[method] += amount;
          if (isCash) m.cash.out += amount;
          break;
        }
        const target = cls === "EXPENSE" ? "expensesByCategory" : "otherExpensesByCategory";
        if (cls === "EXPENSE") m.expenses += amount;
        else m.otherExpenses += amount;
        const k = t.category || "other";
        m[target][k] = (m[target][k] || 0) + amount;
        m.paidByMethod[method] += amount;
        if (isCash) m.cash.out += amount;
        break;
      }
      case "BOOKING_PAYMENT":
        m.bookingPayments += amount;
        m.receivedByMethod[method] += amount;
        if (isCash) m.cash.in += amount;
        break;
      case "BOOKING_REFUND":
        m.bookingRefunds += amount;
        m.paidByMethod[method] += amount;
        if (isCash) m.cash.out += amount;
        break;
      case "CASH_HANDOVER":
        m.handoverTransactions += amount;
        break;
      default:
        break;
    }
  }
  m.discounts = m.saleDiscounts + m.standaloneDiscounts;
  m.netSales = m.salesGross - m.saleDiscounts;
  m.moneyIn = m.salesGross + m.rentIncome + m.otherIncome;
  m.moneyOut = m.discounts + m.purchases + m.expenses + m.otherExpenses;
  m.result = m.moneyIn - m.moneyOut;
  m.creditSales = m.salesByMethod.CREDIT;
  m.cashSales = m.salesByMethod.CASH;
  return m;
}

/** Sum of handovers that count as handed over (RECORDED awaiting the Boss, or CONFIRMED). */
export function sumHandovers(handovers = []) {
  return roundMoney(
    handovers
      .filter((h) => COUNTED_HANDOVER_STATUSES.includes(h.status || "RECORDED"))
      .reduce((s, h) => s + roundMoney(h.amount), 0)
  );
}

/**
 * Physical cash drawer for a day.
 * expected = opening + cash in − cash out; shouldRemain = expected − handed over;
 * variance = counted − shouldRemain (negative = shortage).
 */
export function cashDrawer({ openingCash = 0, money, handovers = [], countedCash = null }) {
  const opening = roundMoney(openingCash);
  const cashIn = roundMoney(money.cash.in);
  const cashOut = roundMoney(money.cash.out);
  const expected = opening + cashIn - cashOut;
  const handedOver = sumHandovers(handovers);
  const pending = roundMoney(handovers.filter((h) => h.status === "RECORDED").reduce((s, h) => s + roundMoney(h.amount), 0));
  const shouldRemain = expected - handedOver;
  const counted = countedCash === null || countedCash === undefined || countedCash === "" ? null : roundMoney(countedCash);
  return {
    opening,
    cashIn,
    cashOut,
    expected,
    handedOver,
    handoverPending: pending,
    shouldRemain,
    counted,
    variance: counted === null ? null : counted - shouldRemain,
    electronic: { MOMO: money.receivedByMethod.MOMO, BANK_TRANSFER: money.receivedByMethod.BANK_TRANSFER },
  };
}

/** Debts movement for a period. */
export function debtMovement({ opening = 0, given = 0, oldAdded = 0, repaid = 0, cancelled = 0 }) {
  const o = roundMoney(opening);
  return {
    opening: o,
    given: roundMoney(given),
    oldAdded: roundMoney(oldAdded),
    repaid: roundMoney(repaid),
    cancelled: roundMoney(cancelled),
    closing: o + roundMoney(given) + roundMoney(oldAdded) - roundMoney(repaid) - roundMoney(cancelled),
  };
}

/** Percentage change, null when there is no base. */
export function pctChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/**
 * Sale totals: line gross = plates × unit price; gross = Σ lines; net = gross − discount.
 * The discount is spread across lines in whole francs (parts sum exactly to the discount).
 */
export function calculateSaleTotals(lines = [], discountAmount = 0) {
  const processed = lines.map((line) => {
    const quantity = Math.max(0, Math.round(Number(line.quantity) || 0));
    const unitPrice = Math.max(0, roundMoney(line.unitPrice));
    return { ...line, quantity, unitPrice, totalAmount: quantity * unitPrice };
  });
  const grossAmount = processed.reduce((sum, l) => sum + l.totalAmount, 0);
  const discount = Math.min(Math.max(0, roundMoney(discountAmount)), grossAmount);
  const weights = processed.map((l) => l.totalAmount);
  const allocations = allocate(discount, weights);
  return {
    grossAmount,
    discountAmount: discount,
    netAmount: grossAmount - discount,
    lines: processed.map((line, i) => ({ ...line, discountAmount: allocations[i], netAmount: line.totalAmount - allocations[i] })),
  };
}

function allocate(total, weights) {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (!total || !sumW) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sumW) * total);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; remainder > 0 && k < order.length; k += 1, remainder -= 1) floors[order[k].i] += 1;
  return floors;
}

/** Debt status and balance from what is owed and what was paid. */
export function debtStatus(amountOwed = 0, amountPaid = 0, { cancelled = false } = {}) {
  const owed = Math.max(0, roundMoney(amountOwed));
  const paid = Math.max(0, roundMoney(amountPaid));
  const balance = cancelled ? 0 : Math.max(0, owed - paid);
  let status = "UNPAID";
  if (cancelled) status = "CANCELLED";
  else if (owed > 0 && balance === 0) status = "PAID";
  else if (paid > 0) status = "PARTIALLY_PAID";
  return { amountOwed: owed, amountPaid: paid, balance, status };
}
