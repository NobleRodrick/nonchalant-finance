/**
 * Builders of the operations the forms record (kind, input sent to the server, meta shown on
 * this device until the server's figures include it). One place, so every form describes its
 * records the way lib/offline/overlay expects. Pure functions.
 */
import { formatMoney } from "@/lib/format";
import { METHOD_LABELS, TYPE_LABELS } from "@/lib/finance/money-math";
import { roundMoney } from "@/lib/money";

const methodLabel = (m) => METHOD_LABELS[m] || m;

/** A sale from the point of sale. `lines`: [{ dishId, name, price, quantity }]. */
export function saleSpec({ departmentId, dateKey, lines, method, discount = 0, discountReason = "", debtorId = null, debtor = null, customer = null }) {
  const gross = lines.reduce((s, l) => s + l.quantity * l.price, 0);
  const net = gross - discount;
  return {
    kind: "sale.record",
    label: "Sale",
    departmentId,
    dateKey: dateKey || undefined,
    input: {
      departmentId,
      dateKey: dateKey || null,
      lines: lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity })),
      paymentMethod: method,
      discountAmount: discount,
      discountReason,
      debtorId: method === "CREDIT" ? debtorId : null,
      debtor: method === "CREDIT" && !debtorId ? debtor : null,
    },
    meta: {
      lines: lines.map((l) => ({ dishId: l.dishId, name: l.name, price: l.price, quantity: l.quantity })),
      gross,
      discount,
      net,
      method,
      customer: method === "CREDIT" ? customer : null,
      phone: method === "CREDIT" ? debtor?.phone || null : null,
      summary: `${lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")} · ${methodLabel(method)} · ${formatMoney(net)}`,
    },
  };
}

/**
 * Undo (void) of a money record shown on screen. `row`: the sale / record as listed (server
 * row or one waiting to be sent), with its money figures. The reason is required.
 */
export function voidSpec({ departmentId, dateKey, row, type, reason }) {
  const t = type || row.type || "SALE";
  const target =
    t === "SALE"
      ? {
          type: "SALE",
          money: { type: "SALE", amount: roundMoney(row.net), grossAmount: roundMoney(row.gross ?? row.net), discountAmount: roundMoney(row.discount || 0), paymentMethod: row.method, category: "sale-food", status: "COMPLETED" },
          lines: (row.lines || []).filter((l) => l.dishId).map((l) => ({ dishId: l.dishId, quantity: l.quantity, unitPrice: l.unitPrice ?? l.price, total: l.total ?? l.quantity * (l.unitPrice ?? l.price) })),
          debtId: row.debtId || null,
        }
      : {
          type: t,
          money: { type: t, amount: roundMoney(row.amount), paymentMethod: row.methodCode || row.paymentMethod || "CASH", category: row.categoryId || row.category, status: "COMPLETED" },
          stockAdds: row.stockAdds || [],
          debtId: row.debtId || null,
        };
  return {
    kind: "record.void",
    label: t === "SALE" ? "Undo sale" : "Void",
    departmentId,
    dateKey: dateKey || undefined,
    input: { transactionId: row.transactionId || row.id, reason },
    meta: { targetId: row.transactionId || row.id, target, reason, summary: `${row.referenceNo || "Record"} · ${reason}` },
  };
}

/** Rent, other income, expense, other expense or a standalone discount. */
export function moneySpec({ departmentId, dateKey, type, amount, category, categoryLabel, paymentMethod = "CASH", counterparty, reference, description, bookingId = null, bookingRef = null }) {
  return {
    kind: "money.record",
    label: TYPE_LABELS[type] ? TYPE_LABELS[type].replace(/s$/, "") : "Money record",
    departmentId,
    dateKey: dateKey || undefined,
    input: { departmentId, dateKey: dateKey || null, type, amount: Number(amount), category, paymentMethod, counterparty, reference, description, ...(bookingId ? { bookingId } : {}) },
    meta: { type, amount: Number(amount), bookingRef, summary: `${categoryLabel || category}${bookingRef ? ` · ${bookingRef}` : ""} · ${methodLabel(paymentMethod)} · ${formatMoney(amount)}` },
  };
}

/** A purchase; `stockAdds`: [{ dishId, plates, name }]. */
export function purchaseSpec({ departmentId, dateKey, supplier, lines = [], amount, category, paymentMethod = "CASH", reference, notes, stockAdds = [] }) {
  const total = lines.length ? lines.reduce((s, l) => s + Number(l.totalCost || 0), 0) : Number(amount);
  const adds = stockAdds.filter((s) => s.dishId && Number(s.plates));
  return {
    kind: "purchase.record",
    label: "Purchase",
    departmentId,
    dateKey: dateKey || undefined,
    input: { departmentId, dateKey: dateKey || null, supplier, lines, amount: lines.length ? null : Number(amount), category, paymentMethod, reference, notes, stockAdds: adds.map((s) => ({ dishId: s.dishId, plates: Number(s.plates) })) },
    meta: {
      amount: total,
      description: lines.map((l) => l.description).filter(Boolean).join(", ") || notes || null,
      platesAdded: adds.map((s) => `${s.plates} × ${s.name || "dish"}`),
      summary: `${supplier ? `${supplier} · ` : ""}${methodLabel(paymentMethod)} · ${formatMoney(total)}`,
    },
  };
}

/** Plates added to a dish (optionally a new dish, optionally bought). */
export function stockAddSpec({ departmentId, dateKey, dishId, dishName, newDish, plates, bought, amountPaid, supplier, paymentMethod = "CASH", reference, note }) {
  return {
    kind: "stock.add",
    label: bought ? "Stock bought" : "Stock added",
    departmentId,
    dateKey: dateKey || undefined,
    input: { departmentId, dateKey: dateKey || null, dishId: dishId || null, newDish: dishId ? null : newDish, plates: Number(plates), bought: Boolean(bought), amountPaid: bought ? Number(amountPaid) : null, supplier, paymentMethod, reference, note },
    meta: { dishName: dishName || newDish?.name, summary: `${plates} × ${dishName || newDish?.name}${bought ? ` · paid ${formatMoney(amountPaid)}` : ""}` },
  };
}

export function dishCreateSpec({ departmentId, name, unitPrice, openingPlates = 0, costPrice, lowStockLevel, description, section }) {
  return {
    kind: "dish.create",
    label: "New dish",
    departmentId,
    input: { departmentId, name, unitPrice: Number(unitPrice), openingPlates: Number(openingPlates || 0), costPrice, lowStockLevel, description, section },
    meta: { summary: `${name} · ${formatMoney(unitPrice)}${Number(openingPlates) ? ` · ${openingPlates} plates` : ""}` },
  };
}

export function dishUpdateSpec({ departmentId, id, name, patch }) {
  return { kind: "dish.update", label: "Dish changed", departmentId, input: { departmentId, id, ...patch }, meta: { patch, summary: name } };
}

export function dishActiveSpec({ departmentId, dishId, name, active }) {
  return { kind: active ? "dish.restore" : "dish.remove", label: active ? "Dish restored" : "Dish removed", departmentId, input: { departmentId, dishId }, meta: { summary: name } };
}

/** Count correction: `current` is the plates shown now (to show the change before it is sent). */
export function correctSpec({ departmentId, dateKey, dishId, name, counted, current, reasonType, reasonText }) {
  return {
    kind: "stock.correct",
    label: reasonType === "SPOILED" ? "Spoiled plates" : "Count corrected",
    departmentId,
    dateKey: dateKey || undefined,
    input: { departmentId, dateKey: dateKey || null, dishId, counted: Number(counted), reasonType, reasonText },
    meta: { delta: Number(counted) - Number(current), summary: `${name}: ${current} → ${counted}` },
  };
}

/** Opening stock of a day; `entries`: [{ dishId, name, actual, opening }]. */
export function openingSpec({ departmentId, dateKey, entries, reason }) {
  return {
    kind: "stock.opening",
    label: "Opening stock",
    departmentId,
    dateKey,
    input: { departmentId, dateKey, reason, entries: entries.map((e) => ({ dishId: e.dishId, actual: Number(e.actual) })) },
    meta: { changes: entries.map((e) => ({ dishId: e.dishId, delta: Number(e.actual) - Number(e.opening) })), summary: entries.map((e) => `${e.name}: ${e.opening} → ${e.actual}`).join(", ") },
  };
}

/** Void of a stock addition or correction; `column` and `quantity` as shown (signed plates). */
export function stockVoidSpec({ departmentId, dateKey, movementId, dishId, column, quantity, reason, label }) {
  return { kind: "stock.void", label: "Stock record voided", departmentId, dateKey: dateKey || undefined, input: { departmentId, movementId, reason }, meta: { dishId, column, quantity, summary: `${label || "Stock record"} · ${reason}` } };
}

/** A debt recorded outside the till (dishes or an amount), or an old debt (`old: true`). */
export function debtSpec({ departmentId, dateKey, old = false, debtorId, debtor, customer, phone, lines = [], amount, description, dueDate }) {
  const total = lines.length ? lines.reduce((s, l) => s + l.quantity * l.price, 0) : Number(amount);
  if (old) {
    return {
      kind: "debt.old",
      label: "Old debt",
      departmentId,
      dateKey: dateKey || undefined,
      input: { departmentId, dateKey: dateKey || null, debtorId: debtorId || null, debtor: debtorId ? null : debtor, amount: Number(amount), description, dueDate: dueDate || null },
      meta: { customer, phone, summary: `${customer} · ${formatMoney(amount)}` },
    };
  }
  return {
    kind: "debt.record",
    label: "Debt",
    departmentId,
    dateKey: dateKey || undefined,
    input: {
      departmentId,
      dateKey: dateKey || null,
      debtorId: debtorId || null,
      debtor: debtorId ? null : debtor,
      dueDate: dueDate || null,
      ...(lines.length ? { lines: lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity })) } : { amount: Number(amount), description }),
    },
    meta: {
      method: "CREDIT",
      customer,
      phone,
      gross: total,
      discount: 0,
      net: total,
      lines: lines.map((l) => ({ dishId: l.dishId, name: l.name, price: l.price, quantity: l.quantity })),
      description: lines.length ? null : description,
      unlisted: lines.length ? null : description,
      summary: `${customer} · ${formatMoney(total)}`,
    },
  };
}

export function repaySpec({ departmentId, debt, amount, paymentMethod = "CASH", reference }) {
  return {
    kind: "debt.repay",
    label: "Repayment",
    departmentId,
    input: { departmentId, debtId: debt.id, amount: Number(amount), paymentMethod, reference },
    meta: { debtId: debt.id, customer: debt.debtor, debtReference: debt.referenceNo, summary: `${debt.debtor} · ${methodLabel(paymentMethod)} · ${formatMoney(amount)}` },
  };
}

export function cancelDebtSpec({ departmentId, debt, reason }) {
  return { kind: "debt.cancel", label: "Old debt cancelled", departmentId, input: { departmentId, debtId: debt.id, reason }, meta: { summary: `${debt.referenceNo} · ${debt.debtor}` } };
}

export function handoverSpec({ departmentId, amount, recipientName, reference, note, cashRequestId }) {
  return {
    kind: "handover.record",
    label: "Cash to Boss",
    departmentId,
    input: { departmentId, amount: Number(amount), recipientName, reference, note, cashRequestId: cashRequestId || null },
    meta: { summary: `${formatMoney(amount)} to ${recipientName || "the Boss"}` },
  };
}

export function reportSpec({ departmentId, dateKey, countedCash, notes, send }) {
  return {
    kind: send ? "report.send" : "report.save",
    label: send ? "Report sent to the Boss" : "Report saved",
    departmentId,
    dateKey,
    input: { departmentId, dateKey, countedCash: countedCash === "" ? null : countedCash, notes },
    meta: { summary: `Counted cash ${countedCash === "" || countedCash === null ? "—" : formatMoney(countedCash)}` },
  };
}
