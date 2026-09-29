/**
 * What the screen shows = the server's figures + what this device recorded that those figures
 * do not include yet ("in effect"). Pure functions (no browser APIs), shared by every board and
 * unit-tested: the server stays the only authority, the device only adds its unsent records on top.
 *
 * An operation is in effect for figures rendered at `renderedAt` (server clock, ms) when it is
 *   - still waiting or being sent, or
 *   - applied by the server after those figures were rendered (the page will refresh).
 * Refused operations ("needs attention") are never counted.
 *
 * Every operation is first described as effects (describe): synthetic money records for the
 * shared money arithmetic (a void is the same record with negative amounts), plate movements,
 * dishes, debts, handovers, report status. Each board then applies the effects it shows.
 */
import { summarizeMoney, debtStatus, TYPE_LABELS, METHOD_LABELS } from "@/lib/finance/money-math";
import { valuePositions } from "@/lib/restaurant/stock-math";
import { roundMoney } from "@/lib/money";
import { categoryLabel } from "@/data/categories";
import { localId } from "./local-ids";
import { STATUS } from "./status";

export const WAITING = "Waiting to be sent";

/** Operations whose effect is not in figures rendered at `renderedAt`. */
export function opsInEffect(ops, { departmentId, renderedAt } = {}) {
  return (ops || []).filter((op) => {
    if (departmentId && op.departmentId !== departmentId) return false;
    if (op.status === STATUS.PENDING || op.status === STATUS.SENDING) return true;
    return op.status === STATUS.APPLIED && Boolean(renderedAt) && Number(op.appliedAt) > Number(renderedAt);
  });
}

const neg = (t) => ({ ...t, amount: -roundMoney(t.amount), grossAmount: t.grossAmount === null || t.grossAmount === undefined ? null : -roundMoney(t.grossAmount), discountAmount: -roundMoney(t.discountAmount || 0) });
const money = (type, amount, paymentMethod = "CASH", extra = {}) => ({ type, amount: roundMoney(amount), paymentMethod, status: "COMPLETED", grossAmount: null, discountAmount: 0, ...extra });

/** Reference shown for a record until the server numbers it. */
export function pendingReference(op) {
  if (op.status === STATUS.APPLIED && op.result?.referenceNo) return op.result.referenceNo;
  return "Not sent yet";
}

/** Effects of one operation (see module comment). */
export function describe(op) {
  const m = op.meta || {};
  const input = op.input || {};
  const e = { key: op.key, dateKey: op.dateKey, op, money: [], stock: [], dishes: [], debts: [], repayments: [], handovers: [], voids: [], report: null, sale: null, record: null, debtors: [] };
  const applied = op.status === STATUS.APPLIED;
  switch (op.kind) {
    case "sale.record":
    case "debt.record": {
      const credit = op.kind === "debt.record" || m.method === "CREDIT";
      const gross = roundMoney(m.gross ?? m.net ?? 0);
      const discount = roundMoney(m.discount || 0);
      const net = gross - discount;
      e.money.push(money("SALE", net, credit ? "CREDIT" : m.method || "CASH", { grossAmount: gross, discountAmount: discount, category: "sale-food", operationCategory: "SALE_FOOD" }));
      for (const l of m.lines || []) e.stock.push({ dishId: l.dishId, column: "sold", quantity: Number(l.quantity) || 0 });
      const transactionId = applied ? op.result?.transactionId : localId("transactionId", op.key);
      e.sale = {
        id: transactionId,
        localKey: op.key,
        referenceNo: pendingReference(op),
        time: m.time || "",
        lines: (m.lines || []).map((l) => ({ dishId: l.dishId, name: l.name, quantity: Number(l.quantity), unitPrice: roundMoney(l.price), total: roundMoney(l.price) * Number(l.quantity) })),
        gross,
        discount,
        net,
        method: credit ? "CREDIT" : m.method || "CASH",
        customer: m.customer || null,
        debtRef: credit ? (applied ? op.result?.debtReference || op.result?.referenceNo : "Not sent yet") : null,
        by: m.by || null,
        voided: false,
        pending: !applied,
        unlisted: m.unlisted || null,
      };
      if (credit) {
        const debtId = applied ? op.result?.debtId : localId("debtId", op.key);
        e.debts.push({
          id: debtId,
          localKey: op.key,
          referenceNo: applied ? op.result?.debtReference || op.result?.referenceNo : "Not sent yet",
          saleReference: applied ? op.result?.referenceNo || op.result?.saleReference : null,
          source: op.kind === "debt.record" ? "MANUAL" : "CREDIT_SALE",
          dateKey: op.dateKey,
          debtorId: input.debtorId || (applied ? op.result?.debtorId : null) || null,
          debtor: m.customer,
          phone: m.phone || null,
          description: m.description || (m.lines || []).map((l) => `${l.quantity} × ${l.name}`).join(", "),
          owed: net,
          paid: 0,
          dueDate: input.dueDate || null,
          pending: !applied,
        });
        if (!input.debtorId && m.customer) e.debtors.push({ id: localId("debtorId", op.key), name: m.customer, phone: m.phone || null });
      }
      break;
    }
    case "record.void": {
      const t = m.target || {};
      if (t.money) e.money.push(neg(t.money));
      for (const l of t.lines || []) e.stock.push({ dishId: l.dishId, column: "sold", quantity: -(Number(l.quantity) || 0) });
      for (const s of t.stockAdds || []) e.stock.push({ dishId: s.dishId, column: "added", quantity: -(Number(s.plates) || 0) });
      e.voids.push({ id: m.targetId, reason: input.reason || m.reason || "", debtId: t.debtId || null, handoverAmount: t.type === "CASH_HANDOVER" ? roundMoney(t.money?.amount || 0) : 0, repayment: t.type === "DEBT_PAYMENT" ? { debtId: t.debtId, amount: roundMoney(t.money?.amount || 0) } : null });
      break;
    }
    case "money.record": {
      e.money.push(money(m.type || input.type, m.amount ?? input.amount, input.paymentMethod || "CASH", { category: input.category }));
      e.record = { type: m.type || input.type, amount: roundMoney(m.amount ?? input.amount), method: input.paymentMethod || "CASH", category: input.category, description: input.description || null, counterparty: input.counterparty || null };
      break;
    }
    case "purchase.record": {
      e.money.push(money("PURCHASE", m.amount ?? input.amount, input.paymentMethod || "CASH", { category: input.category || "purchase-food" }));
      for (const s of input.stockAdds || []) if (s?.dishId && Number(s.plates)) e.stock.push({ dishId: s.dishId, column: "added", quantity: Number(s.plates) });
      e.record = { type: "PURCHASE", amount: roundMoney(m.amount ?? input.amount), method: input.paymentMethod || "CASH", category: input.category || "purchase-food", description: m.description || input.notes || null, counterparty: input.supplier || null, platesAdded: m.platesAdded || [] };
      break;
    }
    case "stock.add": {
      const dishId = input.dishId || (applied ? op.result?.dishId : localId("dishId", op.key));
      if (!input.dishId && input.newDish) e.dishes.push({ create: { id: dishId, name: input.newDish.name, price: roundMoney(input.newDish.unitPrice), costPrice: 0, lowStockLevel: 0, description: null } });
      e.stock.push({ dishId, column: "added", quantity: Number(input.plates) || 0 });
      if (input.bought && Number(input.amountPaid)) {
        e.money.push(money("PURCHASE", input.amountPaid, input.paymentMethod || "CASH", { category: "purchase-ready" }));
        e.record = { type: "PURCHASE", amount: roundMoney(input.amountPaid), method: input.paymentMethod || "CASH", category: "purchase-ready", description: input.note || null, counterparty: input.supplier || null, platesAdded: [`${input.plates} × ${m.dishName || input.newDish?.name || "dish"}`] };
      }
      break;
    }
    case "dish.create": {
      const id = applied ? op.result?.dishId : localId("dishId", op.key);
      e.dishes.push({ create: { id, name: input.name, price: roundMoney(input.unitPrice), costPrice: roundMoney(input.costPrice || 0), lowStockLevel: Number(input.lowStockLevel || 0), description: input.description || null } });
      if (Number(input.openingPlates)) e.stock.push({ dishId: id, column: "added", quantity: Number(input.openingPlates) });
      break;
    }
    case "dish.update":
      e.dishes.push({ update: { id: input.id, patch: m.patch || {} } });
      break;
    case "dish.remove":
      e.dishes.push({ active: { id: input.dishId, isActive: false } });
      break;
    case "dish.restore":
      e.dishes.push({ active: { id: input.dishId, isActive: true } });
      break;
    case "stock.correct":
      if (m.delta) e.stock.push({ dishId: input.dishId, column: input.reasonType === "SPOILED" ? "spoiled" : "corrected", quantity: input.reasonType === "SPOILED" ? -m.delta : m.delta });
      break;
    case "stock.opening":
      for (const c of m.changes || []) if (c.delta) e.stock.push({ dishId: c.dishId, column: "openingCorrection", quantity: c.delta });
      break;
    case "stock.void":
      if (m.dishId && m.column) e.stock.push({ dishId: m.dishId, column: m.column, quantity: -Number(m.quantity || 0) });
      break;
    case "debt.old": {
      const id = applied ? op.result?.debtId : localId("debtId", op.key);
      e.debts.push({
        id,
        localKey: op.key,
        referenceNo: applied ? op.result?.referenceNo : "Not sent yet",
        saleReference: null,
        source: "OPENING_BALANCE",
        dateKey: op.dateKey,
        debtorId: input.debtorId || null,
        debtor: m.customer,
        phone: m.phone || null,
        description: input.description || "Debt from before the app",
        owed: roundMoney(input.amount),
        paid: 0,
        dueDate: input.dueDate || null,
        pending: !applied,
      });
      if (!input.debtorId && m.customer) e.debtors.push({ id: localId("debtorId", op.key), name: m.customer, phone: m.phone || null });
      break;
    }
    case "debt.repay":
      e.money.push(money("DEBT_PAYMENT", input.amount, input.paymentMethod || "CASH"));
      e.repayments.push({ debtId: m.debtId || input.debtId, amount: roundMoney(input.amount), method: input.paymentMethod || "CASH", referenceNo: pendingReference(op), dateKey: op.dateKey, debtor: m.customer || null, debtReference: m.debtReference || null });
      break;
    case "debt.cancel":
      e.voids.push({ id: null, debtId: input.debtId, reason: input.reason });
      break;
    case "debtor.save":
      if (!input.id) e.debtors.push({ id: localId("debtorId", op.key), name: input.name, phone: input.phone || null });
      break;
    case "handover.record":
      e.money.push(money("CASH_HANDOVER", input.amount, "CASH"));
      e.handovers.push({ id: localId("handoverId", op.key), localKey: op.key, referenceNo: pendingReference(op), amount: roundMoney(input.amount), recipient: input.recipientName || "Boss", reference: input.reference || null, status: "RECORDED", cashRequestId: input.cashRequestId || null, dateKey: op.dateKey, pending: !applied });
      break;
    case "report.save":
    case "report.send":
      e.report = { dateKey: input.dateKey || op.dateKey, status: op.kind === "report.send" ? "SUBMITTED" : "DRAFT", countedCash: input.countedCash === "" || input.countedCash === undefined || input.countedCash === null ? null : roundMoney(input.countedCash), notes: input.notes || "" };
      break;
    default:
      break;
  }
  return e;
}

const onDay = (dateKey) => (e) => !dateKey || !e.dateKey || e.dateKey === dateKey;

// ─── Money ──────────────────────────────────────────────────────────────────

const SUMMARY_FIELDS = ["salesGross", "saleDiscounts", "standaloneDiscounts", "discounts", "netSales", "rentIncome", "otherIncome", "moneyIn", "purchases", "purchasesOnCredit", "expenses", "otherExpenses", "moneyOut", "result", "debtRepayments"];

/** Money figures of one day plus the effects on that day. */
export function overlayMoneySummary(summary, effects, { dateKey } = {}) {
  const list = effects.filter(onDay(dateKey)).flatMap((e) => e.money);
  if (!list.length) return summary;
  const d = summarizeMoney(list);
  const out = { ...summary };
  for (const f of SUMMARY_FIELDS) if (typeof summary?.[f] === "number") out[f] = roundMoney(summary[f] + (d[f] || 0));
  if (summary?.salesByMethod) out.salesByMethod = Object.fromEntries(Object.entries(summary.salesByMethod).map(([k, v]) => [k, roundMoney(v + (d.salesByMethod[k] || 0))]));
  if (typeof summary?.salesCount === "number") out.salesCount = summary.salesCount + effects.filter(onDay(dateKey)).reduce((s, e) => s + (e.sale ? 1 : 0) - (e.voids.length && e.op.meta?.target?.type === "SALE" ? 1 : 0), 0);
  return out;
}

/** Money records of the day (Money in / out list) with the waiting ones on top, voids marked. */
export function overlayMoneyRecords(records, effects, { dateKey } = {}) {
  const day = effects.filter(onDay(dateKey));
  const voided = new Map(day.flatMap((e) => e.voids.filter((v) => v.id).map((v) => [v.id, v.reason])));
  const added = day
    .filter((e) => e.record)
    .map((e) => ({
      id: e.op.status === STATUS.APPLIED ? e.op.result?.transactionId || localId("transactionId", e.key) : localId("transactionId", e.key),
      localKey: e.key,
      referenceNo: pendingReference(e.op),
      type: e.record.type,
      typeLabel: TYPE_LABELS[e.record.type] || e.record.type,
      direction: ["RENT_INCOME", "OTHER_INCOME"].includes(e.record.type) ? "in" : "out",
      time: e.op.meta?.time || "",
      category: categoryLabel(e.record.category),
      categoryId: e.record.category,
      methodCode: e.record.method,
      stockAdds: e.stock.filter((x) => x.column === "added").map((x) => ({ dishId: x.dishId, plates: x.quantity })),
      description: e.record.description || categoryLabel(e.record.category),
      counterparty: e.record.counterparty,
      method: METHOD_LABELS[e.record.method] || e.record.method,
      amount: e.record.amount,
      by: e.op.meta?.by || null,
      voided: false,
      purchaseLines: [],
      platesAdded: e.record.platesAdded || [],
      pending: e.op.status !== STATUS.APPLIED,
    }));
  const seen = new Set(records.map((r) => r.id));
  const rows = [...added.filter((r) => !seen.has(r.id)).reverse(), ...records];
  return rows.map((r) => (voided.has(r.id) ? { ...r, voided: true, voidReason: voided.get(r.id), pending: true } : r));
}

// ─── Sales (point of sale) ──────────────────────────────────────────────────

export function overlaySales(sales, effects, { dateKey } = {}) {
  const day = effects.filter(onDay(dateKey));
  const voided = new Map(effects.flatMap((e) => e.voids.filter((v) => v.id).map((v) => [v.id, v.reason])));
  const seen = new Set(sales.map((s) => s.id));
  const added = day.filter((e) => e.sale && !seen.has(e.sale.id)).map((e) => e.sale).reverse();
  return [...added, ...sales].map((s) => (voided.has(s.id) ? { ...s, voided: true, voidReason: voided.get(s.id), undoPending: true } : s));
}

// ─── Dishes and plates ──────────────────────────────────────────────────────

/** Net effect on the plates available now, per dish. */
export function plateDeltas(effects) {
  const d = new Map();
  for (const e of effects) {
    for (const s of e.stock) {
      const sign = s.column === "sold" || s.column === "spoiled" ? -1 : 1;
      d.set(s.dishId, (d.get(s.dishId) || 0) + sign * s.quantity);
    }
  }
  return d;
}

function dishChanges(effects) {
  const created = [];
  const patch = new Map();
  const active = new Map();
  for (const e of effects) {
    for (const x of e.dishes) {
      if (x.create) created.push({ ...x.create, pending: e.op.status !== STATUS.APPLIED });
      if (x.update) patch.set(x.update.id, { ...(patch.get(x.update.id) || {}), ...x.update.patch });
      if (x.active) active.set(x.active.id, x.active.isActive);
    }
  }
  return { created, patch, active };
}

/** Dishes of the point of sale / debt forms: { id, name, price, available } with changes applied. */
export function overlayDishes(dishes, effects) {
  const deltas = plateDeltas(effects);
  const { created, patch, active } = dishChanges(effects);
  const known = new Set(dishes.map((d) => d.id));
  const all = [...dishes, ...created.filter((c) => !known.has(c.id)).map((c) => ({ id: c.id, name: c.name, price: c.price, available: 0, description: c.description, pending: true }))];
  return all
    .filter((d) => active.get(d.id) !== false)
    .map((d) => {
      const p = patch.get(d.id) || {};
      return {
        ...d,
        name: p.name ?? d.name,
        price: p.unitPrice !== undefined ? roundMoney(p.unitPrice) : d.price,
        available: Math.max(0, Math.round((Number(d.available) + (deltas.get(d.id) || 0)) * 1000) / 1000),
      };
    });
}

/** Menu & Stock rows of `dateKey` with the day's movements and dish changes applied. */
export function overlayStock(stock, effects, { dateKey, isToday = true } = {}) {
  if (!effects.length) return stock;
  const day = effects.filter(onDay(dateKey));
  const { created, patch, active } = dishChanges(effects);
  const known = new Set(stock.rows.map((r) => r.dishId));
  const blank = (c) => ({ dishId: c.id, name: c.name, section: null, unitPrice: c.price, costPrice: c.costPrice || 0, isActive: true, lowStockLevel: c.lowStockLevel || 0, opening: 0, openingCorrection: 0, added: 0, sold: 0, spoiled: 0, corrected: 0, closing: 0, description: c.description, available: 0, pending: true });
  let rows = [...stock.rows, ...(isToday ? created.filter((c) => !known.has(c.id)).map(blank) : [])].map((r) => ({ ...r }));
  const byId = new Map(rows.map((r) => [r.dishId, r]));
  for (const e of day) {
    for (const s of e.stock) {
      const r = byId.get(s.dishId);
      if (!r) continue;
      if (s.column === "openingCorrection") {
        r.opening += s.quantity;
        r.openingCorrection = (r.openingCorrection || 0) + s.quantity;
      } else r[s.column] += s.quantity;
      r.pending = true;
    }
  }
  const deltas = plateDeltas(effects);
  rows = rows.map((r) => {
    const p = patch.get(r.dishId) || {};
    const isActive = active.has(r.dishId) ? active.get(r.dishId) : r.isActive;
    const closing = Math.round((r.opening + r.added - r.sold - r.spoiled + r.corrected) * 1000) / 1000;
    return {
      ...r,
      name: p.name ?? r.name,
      unitPrice: p.unitPrice !== undefined ? roundMoney(p.unitPrice) : r.unitPrice,
      costPrice: p.costPrice !== undefined ? roundMoney(p.costPrice || 0) : r.costPrice,
      lowStockLevel: p.lowStockLevel !== undefined ? Number(p.lowStockLevel || 0) : r.lowStockLevel,
      description: p.description !== undefined ? p.description : r.description,
      isActive,
      closing,
      available: Math.max(0, (Number(r.available) || 0) + (deltas.get(r.dishId) || 0)),
    };
  });
  const valued = valuePositions(rows);
  return { ...stock, ...valued, rows: valued.rows };
}

// ─── Debts ──────────────────────────────────────────────────────────────────

/** Customers (grouped debts) and the page's figures, from debt rows. Shared with the server page. */
export function summarizeDebts(rows, { todayKey, repaidToday = 0 } = {}) {
  const open = rows.filter((r) => ["UNPAID", "PARTIALLY_PAID"].includes(r.status));
  const givenToday = rows.filter((r) => r.dateKey === todayKey && r.status !== "CANCELLED" && r.source !== "OPENING_BALANCE").reduce((s, r) => s + r.owed, 0);
  const customers = new Map();
  for (const r of rows.filter((x) => x.status !== "CANCELLED")) {
    const k = r.debtorId || r.debtor;
    const c = customers.get(k) || { key: k, name: r.debtor, phone: r.phone, owed: 0, paid: 0, balance: 0, debts: 0 };
    c.owed += r.owed;
    c.paid += r.paid;
    c.balance += r.balance;
    c.debts += 1;
    customers.set(k, c);
  }
  const list = [...customers.values()].sort((a, b) => b.balance - a.balance);
  return {
    customers: list,
    stats: { outstanding: open.reduce((s, r) => s + r.balance, 0), givenToday, repaidToday, customersOwing: list.filter((c) => c.balance > 0).length },
  };
}

/** Debt rows (all days) with new debts, repayments and cancellations applied. */
export function overlayDebts(rows, effects, { todayKey, repaidToday = 0, formatDate = (k) => k } = {}) {
  let out = rows.map((r) => ({ ...r, payments: [...(r.payments || [])] }));
  const known = new Set(out.map((r) => r.id));
  for (const e of effects) {
    for (const d of e.debts) {
      if (known.has(d.id)) continue;
      const st = debtStatus(d.owed, d.paid);
      out.unshift({ ...d, dateLabel: formatDate(d.dateKey), balance: st.balance, status: st.status, payments: [] });
    }
  }
  const byId = new Map(out.map((r) => [r.id, r]));
  let repaid = repaidToday;
  for (const e of effects) {
    for (const p of e.repayments) {
      const r = byId.get(p.debtId);
      if (p.dateKey === todayKey) repaid += p.amount;
      if (!r) continue;
      r.paid = roundMoney(r.paid + p.amount);
      Object.assign(r, { balance: debtStatus(r.owed, r.paid).balance, status: debtStatus(r.owed, r.paid).status, pending: true });
      r.payments.push({ id: `pending-${e.key}`, referenceNo: p.referenceNo, dateLabel: formatDate(p.dateKey), amount: p.amount, method: p.method, pending: true });
    }
    for (const v of e.voids) {
      if (v.debtId && byId.has(v.debtId) && !v.repayment) Object.assign(byId.get(v.debtId), { status: "CANCELLED", balance: 0, voidReason: v.reason, pending: true });
      if (v.repayment && byId.has(v.repayment.debtId)) {
        const r = byId.get(v.repayment.debtId);
        r.paid = Math.max(0, roundMoney(r.paid - v.repayment.amount));
        Object.assign(r, { balance: debtStatus(r.owed, r.paid).balance, status: debtStatus(r.owed, r.paid).status, pending: true });
      }
    }
  }
  out = out.map((r) => r);
  return { debts: out, ...summarizeDebts(out, { todayKey, repaidToday: repaid }) };
}

/** Customers known on this device (server directory + customers created offline). */
export function overlayDebtors(debtors, effects) {
  const names = new Set(debtors.map((d) => d.name.toLowerCase()));
  const added = [];
  for (const e of effects) for (const d of e.debtors) if (!names.has(String(d.name).toLowerCase())) {
    names.add(String(d.name).toLowerCase());
    added.push(d);
  }
  return [...debtors, ...added];
}

// ─── Cash drawer ────────────────────────────────────────────────────────────

/** The drawer of today with today's cash in / out and handovers applied. */
export function overlayDrawer(drawer, effects, { dateKey } = {}) {
  const day = effects.filter(onDay(dateKey));
  if (!day.length || !drawer) return drawer;
  const d = summarizeMoney(day.flatMap((e) => e.money));
  const handed = day.reduce((s, e) => s + e.handovers.reduce((a, h) => a + h.amount, 0) - e.voids.reduce((a, v) => a + (v.handoverAmount || 0), 0), 0);
  const cashIn = roundMoney(drawer.cashIn + d.cash.in);
  const cashOut = roundMoney(drawer.cashOut + d.cash.out);
  const expected = roundMoney(drawer.opening + cashIn - cashOut);
  const handedOver = roundMoney(drawer.handedOver + handed);
  const shouldRemain = expected - handedOver;
  const report = [...day].reverse().find((e) => e.report)?.report;
  const counted = report && report.countedCash !== null ? report.countedCash : drawer.counted;
  return {
    ...drawer,
    cashIn,
    cashOut,
    expected,
    handedOver,
    handoverPending: roundMoney((drawer.handoverPending || 0) + handed),
    shouldRemain,
    counted,
    variance: counted === null || counted === undefined ? null : counted - shouldRemain,
    electronic: drawer.electronic ? { MOMO: roundMoney(drawer.electronic.MOMO + d.receivedByMethod.MOMO), BANK_TRANSFER: roundMoney(drawer.electronic.BANK_TRANSFER + d.receivedByMethod.BANK_TRANSFER) } : drawer.electronic,
  };
}

/** Handovers list (newest first) with waiting ones on top and voids marked. */
export function overlayHandovers(handovers, effects, { todayKey, formatDate = (k) => k } = {}) {
  const voided = new Map(effects.flatMap((e) => e.voids.filter((v) => v.id).map((v) => [v.id, v.reason])));
  const seen = new Set(handovers.map((h) => h.transactionId));
  const added = effects
    .flatMap((e) => e.handovers.map((h) => ({ ...h, e })))
    .filter((h) => !(h.e.op.status === STATUS.APPLIED && seen.has(h.e.op.result?.transactionId)))
    .map(({ e, ...h }) => ({ ...h, transactionId: e.op.status === STATUS.APPLIED ? e.op.result?.transactionId : localId("transactionId", e.key), dateLabel: `${formatDate(h.dateKey)} ${e.op.meta?.time || ""}`.trim(), by: e.op.meta?.by || null, isToday: h.dateKey === todayKey }))
    .reverse();
  return [...added, ...handovers].map((h) => (voided.has(h.transactionId) ? { ...h, status: "VOIDED", pending: true } : h));
}

/** Cash requests answered by a handover that is waiting to be sent. */
export function overlayCashRequests(requests, effects) {
  const answered = new Map();
  for (const e of effects) for (const h of e.handovers) if (h.cashRequestId) answered.set(h.cashRequestId, (answered.get(h.cashRequestId) || 0) + h.amount);
  if (!answered.size) return requests;
  return requests.map((r) => {
    if (!answered.has(r.id) || r.status !== "OPEN") return r;
    const amount = answered.get(r.id);
    const f = r.figures || {};
    return {
      ...r,
      status: "ANSWERED",
      pending: true,
      handovers: [...(r.handovers || []), { referenceNo: "not sent yet", amount, status: "RECORDED" }],
      figures: { ...f, handedOver: roundMoney((f.handedOver || 0) + amount), againstRequest: roundMoney((f.againstRequest || 0) + amount), outstanding: Math.max(0, roundMoney((f.outstanding || 0) - amount)) },
    };
  });
}

// ─── Day status and the daily report ────────────────────────────────────────

/** The day's report status once waiting report operations are sent. */
export function overlayDayStatus(status, effects, { dateKey } = {}) {
  const report = [...effects].reverse().find((e) => e.report && e.report.dateKey === dateKey)?.report;
  if (!report || report.status !== "SUBMITTED") return status;
  return { ...status, status: "SUBMITTED", locked: true, pending: true };
}

/** The live daily report (model of lib/reports/daily-report) with the day's waiting records. */
export function overlayReport(model, effects, { dateKey } = {}) {
  const day = effects.filter(onDay(dateKey));
  if (!day.length || !model || model.locked) return model;
  const moneyOut = overlayMoneySummary(model.money, day, { dateKey });
  const stock = overlayStock(model.stock, day, { dateKey });
  const cash = overlayDrawer(model.cash, day, { dateKey });
  // Sales by dish.
  const byDish = new Map((model.sales?.byDish || []).map((d) => [d.dishId, { ...d }]));
  const voided = new Set(day.flatMap((e) => e.voids.map((v) => v.id)));
  for (const e of day) {
    const sign = e.sale ? 1 : 0;
    for (const l of e.sale?.lines || []) {
      const row = byDish.get(l.dishId) || { dishId: l.dishId, name: l.name, plates: 0, gross: 0, unitPrice: l.unitPrice };
      row.plates += sign * l.quantity;
      row.gross += sign * l.total;
      byDish.set(l.dishId, row);
    }
    if (e.op.kind === "record.void" && e.op.meta?.target?.type === "SALE") {
      for (const l of e.op.meta.target.lines || []) {
        const row = byDish.get(l.dishId);
        if (row) {
          row.plates -= Number(l.quantity) || 0;
          row.gross -= roundMoney(l.total ?? (Number(l.quantity) || 0) * (l.unitPrice || 0));
        }
      }
    }
  }
  const salesByDish = [...byDish.values()].filter((d) => d.plates > 0 || d.gross > 0).sort((a, b) => b.gross - a.gross);
  // Debts of the day.
  const given = day.reduce((s, e) => s + e.debts.filter((d) => d.source !== "OPENING_BALANCE").reduce((a, d) => a + d.owed, 0), 0);
  const oldAdded = day.reduce((s, e) => s + e.debts.filter((d) => d.source === "OPENING_BALANCE").reduce((a, d) => a + d.owed, 0), 0);
  const repaid = day.reduce((s, e) => s + e.repayments.reduce((a, p) => a + p.amount, 0), 0);
  const debts = model.debts ? { ...model.debts, given: model.debts.given + given, oldAdded: model.debts.oldAdded + oldAdded, repaid: model.debts.repaid + repaid, closing: model.debts.closing + given + oldAdded - repaid } : model.debts;
  // Every record of the day: waiting ones listed with the others.
  const waiting = day
    .filter((e) => e.sale || e.record || e.handovers.length || e.repayments.length || e.op.kind.startsWith("stock.") || e.op.kind === "dish.create")
    .map((e) => ({
      id: `pending-${e.key}`,
      kind: e.sale || e.record || e.handovers.length || e.repayments.length ? "money" : "stock",
      at: e.op.occurredAt,
      time: e.op.meta?.time || "",
      referenceNo: pendingReference(e.op),
      type: e.sale ? "SALE" : e.record?.type || (e.handovers.length ? "CASH_HANDOVER" : e.repayments.length ? "DEBT_PAYMENT" : e.op.kind),
      typeLabel: e.op.label || "",
      description: e.op.meta?.summary || e.op.label || "",
      method: e.sale ? METHOD_LABELS[e.sale.method] : e.record ? METHOD_LABELS[e.record.method] : null,
      amount: e.sale ? e.sale.net : e.record ? e.record.amount : e.handovers[0]?.amount ?? e.repayments[0]?.amount ?? null,
      by: e.op.meta?.by || null,
      status: e.op.status === STATUS.APPLIED ? "COMPLETED" : "PENDING",
      pending: e.op.status !== STATUS.APPLIED,
    }));
  const records = [...(model.records || []).map((r) => (voided.has(r.id) ? { ...r, status: "VOIDED", pending: true } : r)), ...waiting];
  const status = overlayDayStatus({ status: model.status, locked: model.locked }, day, { dateKey });
  return {
    ...model,
    money: moneyOut,
    sales: { ...model.sales, byDish: salesByDish, plates: salesByDish.reduce((s, d) => s + d.plates, 0) },
    stock,
    cash,
    debts,
    records,
    status: status.status,
    locked: status.locked,
    pendingCount: day.filter((e) => e.op.status !== STATUS.APPLIED).length,
  };
}
