/**
 * Every money record of a department is written here (sales, money in / out, purchases,
 * debts, repayments, cash handovers, voids). Each function runs inside the caller's
 * database transaction and:
 *   1. refuses a locked day (report sent) or a closed accounting period;
 *   2. allocates a reference number (S-0001, P-0001 …);
 *   3. writes the record and its details, moves plates when food is involved;
 *   4. updates the cash drawer balance;
 *   5. writes an audit event.
 */
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { assertCanPost } from "@/lib/posting-guard";
import { applyAccountEffect } from "@/lib/finance/account-effect";
import { nextReference, DOC_TYPES } from "@/lib/documents/sequence";
import { calculateSaleTotals, debtStatus, cashDrawer, summarizeMoney } from "@/lib/finance/money-math";
import { roundMoney } from "@/lib/money";
import { findCategory } from "@/data/categories";
import { roleHasPermission, PERMISSIONS } from "@/lib/permissions";
import { moveDish, requirePlates, addStock } from "@/lib/restaurant/stock-service";
import { dayBounds, toDateKey, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { notifyBosses } from "@/lib/notifications";
import { requestForHandover, periodLabel } from "@/lib/finance/cash-requests";

export const SALE_METHODS = ["CASH", "MOMO", "BANK_TRANSFER", "CREDIT"];
export const PAID_METHODS = ["CASH", "MOMO", "BANK_TRANSFER"];

/** Whole, positive FCFA amount or a validation error. */
export function requireAmount(value, label = "Amount", { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw invalid(`${label} must be a whole number of francs.`);
  if (allowZero ? n < 0 : n <= 0) throw invalid(`${label} must be more than 0.`);
  if (n > 10_000_000_000) throw invalid(`${label} is too large.`);
  return n;
}

const text = (v, max = 200) => {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
};

/** The department's cash drawer (created on first use). */
export async function departmentDrawer(tx, { user, departmentId, accountId = null }) {
  if (accountId) {
    const account = await tx.account.findFirst({ where: { id: accountId, organizationId: user.organizationId } });
    if (!account) throw notFound("Cash drawer not found.");
    if (account.departmentId && account.departmentId !== departmentId) throw forbidden("This cash drawer belongs to another department.");
    return account;
  }
  const existing = await tx.account.findFirst({
    where: { organizationId: user.organizationId, departmentId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (existing) return existing;
  return tx.account.create({
    data: { name: "Cash drawer", type: "CURRENT", balance: 0, isDefault: true, organizationId: user.organizationId, departmentId, userId: user.id },
  });
}

async function createTransaction(tx, { user, department, docType, data }) {
  const referenceNo = await nextReference(tx, department.id, docType);
  const transaction = await tx.transaction.create({
    data: {
      ...data,
      referenceNo,
      organizationId: user.organizationId,
      departmentId: department.id,
      userId: user.id,
    },
  });
  await applyAccountEffect(tx, transaction);
  return transaction;
}

// ─── Debtors ─────────────────────────────────────────────────────────────────

export async function resolveDebtor(tx, { user, department, debtorId, debtor }) {
  if (debtorId) {
    const found = await tx.debtor.findFirst({ where: { id: debtorId, departmentId: department.id } });
    if (!found) throw notFound("Customer not found in this department.");
    return found;
  }
  const name = text(debtor?.name, 80);
  if (!name || name.length < 2) throw invalid("Enter the customer's name.");
  const phone = text(debtor?.phone, 30);
  const existing = await tx.debtor.findFirst({ where: { departmentId: department.id, name: { equals: name, mode: "insensitive" } } });
  if (existing) {
    if (phone && !existing.phone) return tx.debtor.update({ where: { id: existing.id }, data: { phone } });
    return existing;
  }
  return tx.debtor.create({
    data: { name, phone, organizationId: user.organizationId, departmentId: department.id },
  });
}

// ─── Sales ───────────────────────────────────────────────────────────────────

/**
 * Records a sale: lines of dishes (plates leave stock atomically; a sale can never exceed
 * the plates available) or, for a manual debt without dishes, an amount of "unlisted items".
 * CREDIT creates a debt for the customer.
 */
export async function postSale(tx, {
  user, role, department, lines = [], unlisted = null, paymentMethod = "CASH", discountAmount = 0,
  discountReason = "", debtorId = null, debtor = null, reference = null, date, idempotencyKey = null,
  debtSource = "CREDIT_SALE", dueDate = null, timeZone = DEFAULT_TIMEZONE,
}) {
  if (!SALE_METHODS.includes(paymentMethod)) throw invalid("Choose how the customer paid.");
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });

  // Merge repeated dishes, validate plates.
  const merged = new Map();
  for (const l of lines) {
    if (!l?.dishId) continue;
    merged.set(l.dishId, (merged.get(l.dishId) || 0) + requirePlates(l.quantity, "Plates"));
  }
  let saleLines = [];
  if (merged.size) {
    const dishes = await tx.menuItem.findMany({
      where: { id: { in: [...merged.keys()] }, departmentId: department.id, organizationId: user.organizationId },
    });
    const byId = new Map(dishes.map((d) => [d.id, d]));
    saleLines = [...merged.entries()].map(([dishId, quantity]) => {
      const dish = byId.get(dishId);
      if (!dish) throw invalid("One of the dishes is not on this department's menu.");
      if (!dish.isActive) throw invalid(`"${dish.name}" was removed from the menu.`);
      return { dishId, dish, quantity, unitPrice: roundMoney(dish.sellingPrice) };
    });
  } else if (unlisted) {
    requireAmount(unlisted.amount, "Amount");
    if (!text(unlisted.description)) throw invalid("Describe what the customer took.");
  } else {
    throw invalid("Add at least one dish to the sale.");
  }

  const discount = roundMoney(discountAmount || 0);
  if (discount < 0) throw invalid("The discount cannot be negative.");
  const totals = saleLines.length
    ? calculateSaleTotals(saleLines, discount)
    : { grossAmount: roundMoney(unlisted.amount), discountAmount: discount, netAmount: roundMoney(unlisted.amount) - discount, lines: [] };
  if (discount > totals.grossAmount) throw invalid("The discount cannot be more than the sale total.");
  if (discount > 0) {
    if (!text(discountReason)) throw invalid("Give a reason for the discount.");
    const full = roleHasPermission(role, PERMISSIONS.SALES_DISCOUNT);
    const limited = roleHasPermission(role, PERMISSIONS.SALES_DISCOUNT_LIMITED);
    const limit = Number(department.cashierDiscountLimit || 0);
    if (!full && !(limited && discount <= limit)) {
      throw forbidden(limit > 0 ? `You can give at most ${limit} FCFA of discount per sale.` : "Only the department head can give discounts.");
    }
  }

  let debtorRow = null;
  if (paymentMethod === "CREDIT") debtorRow = await resolveDebtor(tx, { user, department, debtorId, debtor });

  const account = paymentMethod === "CREDIT" ? null : await departmentDrawer(tx, { user, departmentId: department.id });
  const description = saleLines.length
    ? totals.lines.map((l) => `${l.quantity} × ${l.dish.name}`).join(", ")
    : `Unlisted items: ${text(unlisted.description)}`;

  const transaction = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.SALE,
    data: {
      type: "SALE",
      amount: totals.netAmount,
      grossAmount: totals.grossAmount,
      discountAmount: totals.discountAmount,
      netAmount: totals.netAmount,
      paymentMethod,
      customerName: debtorRow?.name || null,
      reference: text(reference, 80),
      operationCategory: "SALE_FOOD",
      category: "sale-food",
      description: discount ? `${description} (discount: ${text(discountReason)})` : description,
      date,
      accountId: account?.id || null,
      idempotencyKey,
    },
  });

  for (const line of totals.lines) {
    await moveDish(tx, { dish: line.dish, type: "SOLD", quantity: line.quantity, date, transactionId: transaction.id, user, notes: `Sale ${transaction.referenceNo}` });
    await tx.saleLine.create({
      data: {
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalAmount: line.totalAmount,
        discountAmount: line.discountAmount,
        netAmount: line.netAmount,
        unitCost: line.dish.costPrice ?? 0,
        transactionId: transaction.id,
        menuItemId: line.dishId,
        organizationId: user.organizationId,
        departmentId: department.id,
        userId: user.id,
      },
    });
  }

  let debt = null;
  if (paymentMethod === "CREDIT") {
    const st = debtStatus(totals.netAmount, 0);
    debt = await tx.debt.create({
      data: {
        source: debtSource,
        referenceNo: await nextReference(tx, department.id, DOC_TYPES.DEBT),
        debtorId: debtorRow.id,
        debtorName: debtorRow.name,
        debtorContact: debtorRow.phone,
        foodDescription: description,
        amountOwed: totals.netAmount,
        amountPaid: 0,
        status: st.status,
        dueDate: dueDate ? new Date(dueDate) : null,
        date,
        transactionId: transaction.id,
        organizationId: user.organizationId,
        departmentId: department.id,
        userId: user.id,
      },
    });
  }

  await recordAudit(tx, {
    user, departmentId: department.id, action: "SALE_RECORDED", entityType: "Transaction", entityId: transaction.id,
    after: {
      referenceNo: transaction.referenceNo, gross: totals.grossAmount, discount: totals.discountAmount, net: totals.netAmount,
      paymentMethod, lines: totals.lines.map((l) => ({ dish: l.dish.name, plates: l.quantity, unitPrice: l.unitPrice })),
      unlisted: unlisted ? text(unlisted.description) : undefined, debt: debt?.referenceNo,
    },
  });
  return { transaction, debt, totals: { grossAmount: totals.grossAmount, discountAmount: totals.discountAmount, netAmount: totals.netAmount } };
}

// ─── Money in / out (rent, other income, expenses, other expenses, standalone discount) ──

export const SIMPLE_MONEY_TYPES = {
  RENT_INCOME: { doc: DOC_TYPES.RENT_INCOME, permission: PERMISSIONS.MONEY_IN_CREATE, direction: "in" },
  OTHER_INCOME: { doc: DOC_TYPES.OTHER_INCOME, permission: PERMISSIONS.MONEY_IN_CREATE, direction: "in" },
  EXPENSE: { doc: DOC_TYPES.EXPENSE, permission: PERMISSIONS.EXPENSES_CREATE, direction: "out" },
  OTHER_EXPENSE: { doc: DOC_TYPES.OTHER_EXPENSE, permission: PERMISSIONS.EXPENSES_CREATE, direction: "out" },
  DISCOUNT: { doc: DOC_TYPES.DISCOUNT, permission: PERMISSIONS.DISCOUNTS_CREATE, direction: "out" },
};

export async function postMoneyEntry(tx, {
  user, department, type, amount, category, paymentMethod = "CASH", counterparty, reference, description, date,
  idempotencyKey = null, timeZone = DEFAULT_TIMEZONE,
}) {
  const cfg = SIMPLE_MONEY_TYPES[type];
  if (!cfg) throw invalid("Unknown kind of record.");
  const value = requireAmount(amount);
  const cat = findCategory(type, category);
  if (!cat) throw invalid("Choose a category.");
  if (!PAID_METHODS.includes(paymentMethod)) throw invalid("Choose how the money was paid or received.");
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const account = await departmentDrawer(tx, { user, departmentId: department.id });
  const transaction = await createTransaction(tx, {
    user,
    department,
    docType: cfg.doc,
    data: {
      type,
      amount: value,
      paymentMethod,
      counterparty: text(counterparty, 120),
      reference: text(reference, 80),
      description: text(description, 300) || cat.label,
      category: cat.id,
      operationCategory: cat.operationCategory,
      date,
      accountId: account.id,
      idempotencyKey,
    },
  });
  await recordAudit(tx, {
    user, departmentId: department.id, action: `${type}_RECORDED`, entityType: "Transaction", entityId: transaction.id,
    after: { referenceNo: transaction.referenceNo, amount: value, category: cat.label, paymentMethod },
  });
  return { transaction };
}

// ─── Purchases ───────────────────────────────────────────────────────────────

/**
 * A purchase is money out (what was paid, to whom, for what). It may also add plates to
 * dishes (`stockAdds`), e.g. ready-made dishes bought or food cooked the same day.
 * paymentMethod CREDIT = bought on supplier credit (no cash leaves the drawer).
 */
export async function postPurchase(tx, {
  user, department, supplier, lines = [], amount = null, category = "purchase-food", paymentMethod = "CASH",
  reference, notes, date, stockAdds = [], idempotencyKey = null, timeZone = DEFAULT_TIMEZONE,
}) {
  if (!SALE_METHODS.includes(paymentMethod)) throw invalid("Choose how the purchase was paid.");
  const cat = findCategory("PURCHASE", category) || findCategory("PURCHASE", "purchase-food");
  const cleanLines = lines
    .filter((l) => text(l?.description) || l?.totalCost)
    .map((l) => {
      const desc = text(l.description, 120);
      if (!desc) throw invalid("Describe each item bought.");
      const quantity = Number(l.quantity || 1);
      if (!(quantity > 0)) throw invalid(`Quantity of "${desc}" must be more than 0.`);
      const totalCost = requireAmount(l.totalCost ?? roundMoney(quantity * Number(l.unitCost || 0)), `Cost of "${desc}"`);
      return { description: desc, quantity, unitCost: roundMoney(totalCost / quantity), totalCost };
    });
  const total = cleanLines.length ? cleanLines.reduce((s, l) => s + l.totalCost, 0) : requireAmount(amount, "Amount paid");
  if (amount !== null && amount !== undefined && amount !== "" && cleanLines.length && roundMoney(amount) !== total) {
    throw invalid(`The items add up to ${total} FCFA but the amount is ${roundMoney(amount)} FCFA.`);
  }
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const account = paymentMethod === "CREDIT" ? null : await departmentDrawer(tx, { user, departmentId: department.id });
  const description = cleanLines.length ? cleanLines.map((l) => l.description).join(", ") : text(notes, 300) || cat.label;
  const transaction = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.PURCHASE,
    data: {
      type: "PURCHASE",
      amount: total,
      paymentMethod,
      counterparty: text(supplier, 120),
      reference: text(reference, 80),
      description,
      category: cat.id,
      operationCategory: cat.operationCategory,
      date,
      accountId: account?.id || null,
      idempotencyKey,
    },
  });
  const purchase = await tx.purchase.create({
    data: {
      organizationId: user.organizationId,
      departmentId: department.id,
      userId: user.id,
      supplierName: text(supplier, 120),
      reference: text(reference, 80),
      paymentMethod,
      totalAmount: total,
      date,
      notes: text(notes, 300),
      transactionId: transaction.id,
      lines: { create: cleanLines.map((l) => ({ description: l.description, quantity: l.quantity, unitCost: l.unitCost, totalCost: l.totalCost })) },
    },
  });
  const added = [];
  for (const s of stockAdds || []) {
    if (!s?.dishId || !Number(s.plates)) continue;
    const res = await addStock(tx, { user, department, dishId: s.dishId, platesAdded: s.plates, date, note: `Purchase ${transaction.referenceNo}`, purchaseId: purchase.id, timeZone });
    added.push(res.movement);
  }
  await recordAudit(tx, {
    user, departmentId: department.id, action: "PURCHASE_RECORDED", entityType: "Transaction", entityId: transaction.id,
    after: { referenceNo: transaction.referenceNo, amount: total, supplier: text(supplier), paymentMethod, platesAdded: added.map((m) => m.referenceNo) },
  });
  return { transaction, purchase, stockAdds: added };
}

// ─── Debts ───────────────────────────────────────────────────────────────────

/** An old debt that existed before the app (no revenue today, no cash). */
export async function postOpeningDebt(tx, { user, department, debtorId, debtor, amount, description, date, dueDate = null, timeZone = DEFAULT_TIMEZONE }) {
  const value = requireAmount(amount);
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const d = await resolveDebtor(tx, { user, department, debtorId, debtor });
  const debt = await tx.debt.create({
    data: {
      source: "OPENING_BALANCE",
      referenceNo: await nextReference(tx, department.id, DOC_TYPES.DEBT),
      debtorId: d.id,
      debtorName: d.name,
      debtorContact: d.phone,
      foodDescription: text(description, 300) || "Debt from before the app",
      amountOwed: value,
      amountPaid: 0,
      status: "UNPAID",
      dueDate: dueDate ? new Date(dueDate) : null,
      date,
      organizationId: user.organizationId,
      departmentId: department.id,
      userId: user.id,
    },
  });
  await recordAudit(tx, { user, departmentId: department.id, action: "OLD_DEBT_RECORDED", entityType: "Debt", entityId: debt.id, after: { referenceNo: debt.referenceNo, debtor: d.name, amount: value } });
  return { debt };
}

export async function postRepayment(tx, { user, department, debtId, amount, paymentMethod = "CASH", reference, date, idempotencyKey = null, timeZone = DEFAULT_TIMEZONE }) {
  const value = requireAmount(amount);
  if (!PAID_METHODS.includes(paymentMethod)) throw invalid("Choose how the customer paid.");
  const debt = await tx.debt.findFirst({ where: { id: debtId, departmentId: department.id, organizationId: user.organizationId } });
  if (!debt) throw notFound("Debt not found in this department.");
  if (debt.status === "CANCELLED") throw conflict("This debt was cancelled.");
  const current = debtStatus(debt.amountOwed, debt.amountPaid);
  if (current.balance <= 0) throw conflict("This debt is already fully paid.");
  if (value > current.balance) throw invalid(`The customer owes ${current.balance} FCFA. The repayment cannot be more.`);
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });

  // Atomic: only succeeds if the balance did not change meanwhile.
  const next = debtStatus(debt.amountOwed, roundMoney(debt.amountPaid) + value);
  const upd = await tx.debt.updateMany({
    where: { id: debt.id, amountPaid: debt.amountPaid },
    data: { amountPaid: next.amountPaid, status: next.status },
  });
  if (upd.count !== 1) throw conflict("This debt changed at the same time. Please try again.");

  const account = await departmentDrawer(tx, { user, departmentId: department.id });
  const transaction = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.DEBT_PAYMENT,
    data: {
      type: "DEBT_PAYMENT",
      amount: value,
      paymentMethod,
      customerName: debt.debtorName,
      reference: text(reference, 80),
      description: `Repayment of ${debt.referenceNo || "debt"} by ${debt.debtorName}`,
      category: "debt-repayment",
      operationCategory: "DEBT_COLLECTION",
      date,
      accountId: account.id,
      idempotencyKey,
    },
  });
  const payment = await tx.debtPayment.create({
    data: {
      amount: value,
      paymentMethod,
      reference: text(reference, 80),
      date,
      debtId: debt.id,
      transactionId: transaction.id,
      organizationId: user.organizationId,
      departmentId: department.id,
      userId: user.id,
    },
  });
  await recordAudit(tx, {
    user, departmentId: department.id, action: "DEBT_REPAID", entityType: "Debt", entityId: debt.id,
    before: { amountPaid: debt.amountPaid, status: debt.status }, after: { amountPaid: next.amountPaid, status: next.status, repayment: transaction.referenceNo },
  });
  return { transaction, payment, debt: { ...debt, ...next } };
}

/** Cancels an old (opening-balance) debt. Debts from sales are cancelled by voiding the sale. */
export async function cancelOpeningDebt(tx, { user, department, debtId, reason, timeZone = DEFAULT_TIMEZONE }) {
  const cleanReason = text(reason);
  if (!cleanReason || cleanReason.length < 3) throw invalid("Give a reason (at least 3 characters).");
  const debt = await tx.debt.findFirst({ where: { id: debtId, departmentId: department.id, organizationId: user.organizationId }, include: { payments: { where: { voidedAt: null } } } });
  if (!debt) throw notFound("Debt not found.");
  if (debt.transactionId) throw invalid("This debt comes from a sale. Void the sale instead.");
  if (debt.status === "CANCELLED") throw conflict("This debt is already cancelled.");
  if (debt.payments.length) throw conflict("This debt has repayments. Void them first.");
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date: debt.date, timeZone });
  const updated = await tx.debt.update({ where: { id: debt.id }, data: { status: "CANCELLED", voidedAt: new Date(), voidReason: cleanReason } });
  await recordAudit(tx, { user, departmentId: department.id, action: "DEBT_CANCELLED", entityType: "Debt", entityId: debt.id, before: { status: debt.status }, after: { status: "CANCELLED", reason: cleanReason } });
  return updated;
}

// ─── Cash drawer & handover ──────────────────────────────────────────────────

/** Physical cash the department should hold right now (or at the end of `dateKey`). */
export async function drawerNow(client, { organizationId, departmentId, timeZone = DEFAULT_TIMEZONE, at = new Date() }) {
  const { start, end } = dayBounds(at, timeZone);
  const [opening, dayTx, handovers] = await Promise.all([
    openingCashBefore(client, departmentId, start),
    client.transaction.findMany({ where: { organizationId, departmentId, date: { gte: start, lte: end } } }),
    client.cashHandover.findMany({ where: { organizationId, departmentId, date: { gte: start, lte: end } } }),
  ]);
  return cashDrawer({ openingCash: opening, money: summarizeMoney(dayTx), handovers });
}

/** Cash in the drawer before an instant: opening float + all cash in − cash out − handovers before it. */
export async function openingCashBefore(client, departmentId, before) {
  const [department, groups, handovers] = await Promise.all([
    client.department.findUnique({ where: { id: departmentId }, select: { openingCashFloat: true } }),
    client.transaction.groupBy({
      by: ["type", "paymentMethod", "operationCategory", "category"],
      where: { departmentId, date: { lt: before }, status: { not: "VOIDED" } },
      _sum: { amount: true },
    }),
    client.cashHandover.aggregate({
      where: { departmentId, date: { lt: before }, status: { in: ["RECORDED", "CONFIRMED"] } },
      _sum: { amount: true },
    }),
  ]);
  const m = summarizeMoney(groups.map((g) => ({ ...g, amount: g._sum.amount || 0, grossAmount: null, status: "COMPLETED" })));
  return roundMoney((department?.openingCashFloat || 0) + m.cash.in - m.cash.out - roundMoney(handovers._sum.amount || 0));
}

export async function postHandover(tx, { user, role, department, amount, recipientName, reference, note, date, cashRequestId = null, idempotencyKey = null, timeZone = DEFAULT_TIMEZONE }) {
  if (user.role === "ADMIN" || (role && role !== "HEAD")) throw forbidden("Only the department head hands cash over to the Boss.");
  const value = requireAmount(amount);
  const request = await requestForHandover(tx, { organizationId: user.organizationId, departmentId: department.id, requestId: cashRequestId });
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const drawer = await drawerNow(tx, { organizationId: user.organizationId, departmentId: department.id, timeZone, at: date });
  if (value > drawer.shouldRemain) {
    throw invalid(`The drawer should hold ${Math.max(0, drawer.shouldRemain)} FCFA in cash. You cannot hand over more than that.`);
  }
  const account = await departmentDrawer(tx, { user, departmentId: department.id });
  const recipient = text(recipientName, 80) || "Boss";
  const transaction = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.CASH_HANDOVER,
    data: {
      type: "CASH_HANDOVER",
      amount: value,
      paymentMethod: "CASH",
      counterparty: recipient,
      reference: text(reference, 80),
      description: text(note, 300) || `Cash handed to ${recipient}`,
      category: "cash-handover",
      operationCategory: "CASH_HANDOVER",
      date,
      accountId: account.id,
      idempotencyKey,
    },
  });
  const handover = await tx.cashHandover.create({
    data: {
      amount: value,
      recipientName: recipient,
      referenceNo: transaction.referenceNo,
      reference: text(reference, 80),
      status: "RECORDED",
      date,
      organizationId: user.organizationId,
      departmentId: department.id,
      userId: user.id,
      accountId: account.id,
      transactionId: transaction.id,
      cashRequestId: request?.id || null,
    },
  });
  if (request && request.status === "OPEN") {
    await tx.cashRequest.update({ where: { id: request.id }, data: { status: "ANSWERED", answeredAt: new Date() } });
  }
  await notifyBosses(tx, {
    organizationId: user.organizationId,
    departmentId: department.id,
    kind: "HANDOVER_RECORDED",
    title: `${department.name}: ${value.toLocaleString("fr-FR")} FCFA handed over (${transaction.referenceNo})`,
    body: `By ${user.name}${request ? `, for your request of ${periodLabel(request.fromKey, request.toKey)}` : ""}. Confirm when you have received it.`,
    href: "/boss/cash",
  });
  await recordAudit(tx, { user, departmentId: department.id, action: "CASH_HANDED_OVER", entityType: "CashHandover", entityId: handover.id, after: { referenceNo: transaction.referenceNo, amount: value, recipient, cashRequestId: request?.id || null } });
  return { transaction, handover, request };
}

// ─── Voids ───────────────────────────────────────────────────────────────────

/**
 * Voids a money record. Nothing is deleted: the record is marked VOIDED (excluded from all
 * figures), plates of a sale go back to stock, a credit sale's debt is cancelled, a
 * repayment is taken off its debt, a handover is cancelled, and the drawer is corrected.
 * Voids are done by the department (heads), never by the Boss: a sent report locks its day, and
 * the Boss returns it when something must be corrected.
 */
export async function voidTransaction(tx, { user, role, transactionId, reason, timeZone = DEFAULT_TIMEZONE }) {
  const cleanReason = text(reason);
  if (!cleanReason || cleanReason.length < 3) throw invalid("Give a reason for voiding (at least 3 characters).");
  const t = await tx.transaction.findFirst({
    where: { id: transactionId, organizationId: user.organizationId },
    include: {
      stockMovements: true,
      debt: { include: { payments: { where: { voidedAt: null } } } },
      debtPayment: true,
      purchase: { include: { stockAdds: true } },
      cashHandovers: true,
    },
  });
  if (!t) throw notFound("Record not found.");
  if (t.status === "VOIDED") throw conflict("This record is already voided.");
  // Any day that is not locked: today, a past day whose report was not sent yet, or one the Boss returned.
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: t.departmentId, date: t.date, timeZone });

  if (t.type === "SALE" && t.debt) {
    if (t.debt.payments.length) throw conflict(`The customer already repaid part of ${t.debt.referenceNo}. Void the repayments first.`);
    await tx.debt.update({ where: { id: t.debt.id }, data: { status: "CANCELLED", voidedAt: new Date(), voidReason: cleanReason } });
  }
  // Plates of a sale go back to stock (SOLD with the opposite sign, dated like the sale).
  for (const mv of t.stockMovements.filter((m) => m.type === "SOLD")) {
    const dish = await tx.menuItem.findUnique({ where: { id: mv.menuItemId } });
    await moveDish(tx, { dish, type: "SOLD", quantity: -Number(mv.quantity), date: mv.date, transactionId: t.id, reason: `Void of ${t.referenceNo}: ${cleanReason}`, user });
  }
  // Legacy sales (USAGE movements) are restored with a signed reversal.
  for (const mv of t.stockMovements.filter((m) => m.type === "USAGE" && m.menuItemId)) {
    const dish = await tx.menuItem.findUnique({ where: { id: mv.menuItemId } });
    await moveDish(tx, { dish, type: "REVERSAL", quantity: Math.abs(Number(mv.quantity)), date: mv.date, transactionId: t.id, reason: `Void of ${t.referenceNo}: ${cleanReason}`, user });
  }
  if (t.type === "PURCHASE" && t.purchase) {
    for (const mv of t.purchase.stockAdds.filter((m) => m.type === "STOCK_ADDED" && !m.voidedAt)) {
      const dish = await tx.menuItem.findUnique({ where: { id: mv.menuItemId } });
      await moveDish(tx, { dish, type: "STOCK_ADDED", quantity: -Number(mv.quantity), date: mv.date, reason: `Void of ${t.referenceNo}: ${cleanReason}`, referenceNo: mv.referenceNo, purchaseId: t.purchase.id, user });
      await tx.stockMovement.update({ where: { id: mv.id }, data: { voidedAt: new Date() } });
    }
    await tx.purchase.update({ where: { id: t.purchase.id }, data: { status: "VOIDED" } });
  }
  if (t.type === "DEBT_PAYMENT" && t.debtPayment) {
    const debt = await tx.debt.findUnique({ where: { id: t.debtPayment.debtId } });
    const next = debtStatus(debt.amountOwed, Math.max(0, roundMoney(debt.amountPaid) - roundMoney(t.debtPayment.amount)), { cancelled: debt.status === "CANCELLED" });
    await tx.debt.update({ where: { id: debt.id }, data: { amountPaid: next.amountPaid, status: next.status } });
    await tx.debtPayment.update({ where: { id: t.debtPayment.id }, data: { voidedAt: new Date() } });
  }
  if (t.type === "CASH_HANDOVER") {
    await tx.cashHandover.updateMany({ where: { transactionId: t.id }, data: { status: "VOIDED" } });
    // A request answered only by voided handovers is waiting again.
    for (const requestId of [...new Set(t.cashHandovers.map((h) => h.cashRequestId).filter(Boolean))]) {
      const live = await tx.cashHandover.count({ where: { cashRequestId: requestId, status: { in: ["RECORDED", "CONFIRMED"] } } });
      if (!live) await tx.cashRequest.updateMany({ where: { id: requestId, status: "ANSWERED" }, data: { status: "OPEN", answeredAt: null } });
    }
  }
  await applyAccountEffect(tx, t, { reverse: true });
  const updated = await tx.transaction.update({
    where: { id: t.id },
    data: { status: "VOIDED", voidedAt: new Date(), voidedById: user.id, voidReason: cleanReason },
  });
  await recordAudit(tx, {
    user, departmentId: t.departmentId, action: "RECORD_VOIDED", entityType: "Transaction", entityId: t.id,
    before: { referenceNo: t.referenceNo, type: t.type, amount: t.amount, status: t.status }, after: { status: "VOIDED", reason: cleanReason },
  });
  return updated;
}
