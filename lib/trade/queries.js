/**
 * Read side of shops, bars and other activities: the product list and the stock sheet, a product's
 * history, tabs, purchases, crates, the dashboard (with what needs attention), the report of any
 * period (sales, margins by product / category / cashier, purchases, losses, credit, the income
 * statement) and the search. Money figures come from the same records as the statements.
 */
import { db } from "@/lib/prisma";
import { addDaysToKey, formatTimeInZone, rangeBounds, toDateKey } from "@/lib/timezone";
import { buildStatements } from "@/lib/finance/statements";
import { debtStatus } from "@/lib/finance/money-math";
import { isLow, margin, packagingBalances, qty } from "./stock-math";
import { tradeWarnings } from "./alert-math";

export { tradeWarnings };

const int = (v) => Math.round(Number(v || 0));
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const like = (q) => ({ contains: q, mode: "insensitive" });

export const MOVEMENT_LABELS = { OPENING: "Opening count", PURCHASE: "Bought", SALE: "Sold", RETURN: "Back to stock", COUNT: "Count correction", LOSS: "Lost / broken", PURCHASE_VOID: "Purchase voided" };
export const METHOD_KEYS = ["CASH", "MOMO", "BANK_TRANSFER", "OTHER", "CREDIT"];

/** One product as the pages show it. */
export function shapeProduct(p) {
  const quantity = qty(p.quantity);
  return {
    id: p.id,
    code: p.code,
    barcode: p.barcode,
    name: p.name,
    category: p.category,
    unit: p.unit,
    kind: p.kind,
    salePrice: p.salePrice,
    costPrice: p.costPrice,
    quantity,
    lowStock: qty(p.lowStock),
    unitsPerPack: p.unitsPerPack,
    supplierName: p.supplierName,
    packagingId: p.packagingId,
    packaging: p.packaging?.name || null,
    isActive: p.isActive,
    value: p.kind === "SERVICE" ? 0 : Math.round(quantity * p.costPrice),
    retailValue: p.kind === "SERVICE" ? 0 : Math.round(quantity * p.salePrice),
    marginPct: p.salePrice ? Math.round(((p.salePrice - p.costPrice) / p.salePrice) * 1000) / 10 : null,
    low: isLow(p),
    empty: p.kind !== "SERVICE" && quantity <= 0,
  };
}

/** Products of a department: `status` active | low | archived | all; `q` name, code, barcode, category. */
export async function productList({ departmentId, q, category, status = "active", client = db }) {
  const text = String(q || "").trim().slice(0, 60);
  const rows = await client.tradeProduct.findMany({
    where: {
      departmentId,
      ...(status === "archived" ? { isActive: false } : status === "all" ? {} : { isActive: true }),
      ...(category ? { category } : {}),
      ...(text ? { OR: [{ name: like(text) }, { code: like(text) }, { barcode: text }, { category: like(text) }, { supplierName: like(text) }] } : {}),
    },
    include: { packaging: { select: { name: true } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 2000,
  });
  const out = rows.map(shapeProduct);
  return status === "low" ? out.filter((p) => p.low || (p.empty && p.kind !== "SERVICE")) : out;
}

export function stockTotals(products) {
  const goods = products.filter((p) => p.kind !== "SERVICE" && p.isActive);
  return { products: goods.length, services: products.filter((p) => p.kind === "SERVICE").length, value: sum(goods, (p) => p.value), retailValue: sum(goods, (p) => p.retailValue), low: goods.filter((p) => p.low && !p.empty).length, empty: goods.filter((p) => p.empty).length };
}

export async function productCategories(departmentId, client = db) {
  const rows = await client.tradeProduct.findMany({ where: { departmentId, category: { not: null } }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } });
  return rows.map((r) => r.category);
}

/** A product with its last movements (the stock card). */
export async function productCard({ departmentId, productId, timeZone, client = db }) {
  const p = await client.tradeProduct.findFirst({ where: { id: productId, departmentId }, include: { packaging: { select: { name: true } } } });
  if (!p) return null;
  const moves = await client.tradeMovement.findMany({ where: { productId: p.id }, orderBy: { date: "desc" }, take: 200 });
  const users = await client.user.findMany({ where: { id: { in: [...new Set(moves.map((m) => m.createdById))] } }, select: { id: true, name: true } });
  return {
    product: shapeProduct(p),
    movements: moves.map((m) => ({ id: m.id, kind: m.kind, label: MOVEMENT_LABELS[m.kind], dateKey: toDateKey(m.date, timeZone), time: formatTimeInZone(m.date, timeZone), quantity: qty(m.quantity), unitCost: m.unitCost, value: m.value, note: m.note, by: users.find((u) => u.id === m.createdById)?.name || "" })),
  };
}

/** Open tabs (bar) with their lines and total. */
export async function openTabs({ departmentId, timeZone, client = db }) {
  const tabs = await client.tradeTab.findMany({ where: { departmentId, status: "OPEN" }, include: { lines: { where: { voidedAt: null }, orderBy: { addedAt: "asc" } } }, orderBy: { openedAt: "asc" } });
  return tabs.map((t) => ({ id: t.id, referenceNo: t.referenceNo, label: t.label, openedAt: t.openedAt.toISOString(), openedTime: formatTimeInZone(t.openedAt, timeZone), total: sum(t.lines, (l) => l.total), lines: t.lines.map((l) => ({ id: l.id, productId: l.productId, name: l.name, quantity: qty(l.quantity), unitPrice: l.unitPrice, total: l.total, time: formatTimeInZone(l.addedAt, timeZone) })) }));
}

/** Sales of a day (the Sell page's list). */
export async function salesOfDay({ departmentId, dateKey, timeZone, client = db }) {
  const { start, end } = rangeBounds(dateKey, dateKey, timeZone);
  const rows = await client.transaction.findMany({
    where: { departmentId, type: "SALE", date: { gte: start, lte: end } },
    include: { tradeLines: true, user: { select: { name: true } }, debt: { select: { id: true, referenceNo: true } }, tradeTab: { select: { label: true, referenceNo: true } } },
    orderBy: { date: "desc" },
    take: 300,
  });
  return rows.map((s) => ({
    id: s.id,
    referenceNo: s.referenceNo,
    time: formatTimeInZone(s.date, timeZone),
    lines: s.tradeLines.map((l) => ({ name: l.name, quantity: qty(l.quantity), unitPrice: l.unitPrice, total: l.total })),
    gross: int(s.grossAmount ?? s.amount),
    discount: int(s.discountAmount),
    net: int(s.amount),
    method: s.paymentMethod,
    reference: s.reference,
    customer: s.customerName,
    tab: s.tradeTab ? `${s.tradeTab.label} (${s.tradeTab.referenceNo})` : null,
    debtRef: s.debt?.referenceNo || null,
    by: s.user?.name,
    voided: s.status === "VOIDED",
    voidReason: s.voidReason,
  }));
}

/** Purchases of a period with their lines. */
export async function purchaseList({ departmentId, fromKey, toKey, timeZone, client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const rows = await client.tradePurchase.findMany({ where: { departmentId, date: { gte: start, lte: end } }, include: { lines: { include: { product: { select: { name: true, unit: true } } } }, records: { select: { referenceNo: true, type: true, status: true } } }, orderBy: { date: "desc" }, take: 1000 });
  const bills = await client.supplierBill.findMany({ where: { id: { in: rows.map((r) => r.supplierBillId).filter(Boolean) } }, select: { id: true, referenceNo: true, total: true, paid: true, status: true, dueDate: true } });
  const users = await client.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } });
  return rows.map((p) => {
    const bill = bills.find((b) => b.id === p.supplierBillId);
    return {
      id: p.id,
      referenceNo: p.referenceNo,
      dateKey: toDateKey(p.date, timeZone),
      supplier: p.supplierName,
      supplierRef: p.supplierRef,
      method: p.paymentMethod,
      total: p.goodsTotal,
      deposits: p.depositTotal,
      voided: p.status === "VOIDED",
      voidReason: p.voidReason,
      by: users.find((u) => u.id === p.createdById)?.name || "",
      record: p.records.find((r) => r.type === "PURCHASE")?.referenceNo || null,
      bill: bill ? { id: bill.id, referenceNo: bill.referenceNo, total: bill.total, paid: bill.paid, balance: bill.total - bill.paid, status: bill.status, dueKey: bill.dueDate ? toDateKey(bill.dueDate, timeZone) : null } : null,
      lines: p.lines.map((l) => ({ productId: l.productId, name: l.product.name, unit: l.product.unit, quantity: qty(l.quantity), unitCost: l.unitCost, total: l.total })),
    };
  });
}

/** Supplier bills of this department not fully paid (bought on credit). */
export async function billsDue({ departmentId, timeZone, client = db }) {
  const rows = await client.supplierBill.findMany({ where: { departmentId, status: { in: ["OPEN", "PARTIAL"] } }, include: { supplier: { select: { name: true } } }, orderBy: [{ dueDate: "asc" }, { date: "asc" }] });
  return rows.map((b) => ({ id: b.id, referenceNo: b.referenceNo, supplier: b.supplier.name, supplierRef: b.supplierRef, dateKey: toDateKey(b.date, timeZone), dueKey: b.dueDate ? toDateKey(b.dueDate, timeZone) : null, total: b.total, paid: b.paid, balance: b.total - b.paid }));
}

/** Crates of a bar with their balances, and the last movements. */
export async function crateBoard({ departmentId, timeZone, client = db }) {
  const [packs, moves] = await Promise.all([
    client.tradePackaging.findMany({ where: { departmentId }, include: { movements: { where: { voidedAt: null }, select: { kind: true, quantity: true, amount: true } }, products: { where: { isActive: true }, select: { name: true } } }, orderBy: { name: "asc" } }),
    client.packagingMovement.findMany({ where: { departmentId, voidedAt: null }, include: { packaging: { select: { name: true } } }, orderBy: { date: "desc" }, take: 150 }),
  ]);
  const crates = packs.map((p) => ({ id: p.id, name: p.name, supplierName: p.supplierName, deposit: p.deposit, bottleDeposit: p.bottleDeposit, isActive: p.isActive, products: p.products.map((x) => x.name), ...packagingBalances(p.movements) }));
  return {
    crates,
    totals: { owedToSuppliers: sum(crates, (c) => c.owedToSuppliers), onHand: sum(crates, (c) => c.onHand), bottlesWithCustomers: sum(crates, (c) => c.bottlesWithCustomers), depositsWithSuppliers: sum(crates, (c) => c.depositsWithSuppliers), depositsHeldForCustomers: sum(crates, (c) => c.depositsHeldForCustomers), depositLost: sum(crates, (c) => c.depositLost) },
    movements: moves.map((m) => ({ id: m.id, kind: m.kind, crate: m.packaging.name, quantity: m.quantity, amount: m.amount, party: m.partyName, note: m.note, dateKey: toDateKey(m.date, timeZone), time: formatTimeInZone(m.date, timeZone) })),
  };
}

/** Debts of the department still owed (credit sales, old debts). */
async function debtsOwed(client, departmentId, todayKey, timeZone) {
  const debts = await client.debt.findMany({ where: { departmentId, status: { in: ["UNPAID", "PARTIALLY_PAID"] } }, select: { id: true, referenceNo: true, debtorName: true, amountOwed: true, amountPaid: true, dueDate: true, date: true } });
  return debts.map((d) => {
    const balance = debtStatus(d.amountOwed, d.amountPaid).balance;
    const dueKey = d.dueDate ? toDateKey(d.dueDate, timeZone) : null;
    return { id: d.id, referenceNo: d.referenceNo, debtor: d.debtorName, balance, dueKey, overdue: Boolean(dueKey && dueKey < todayKey), dateKey: toDateKey(d.date, timeZone) };
  });
}

/** Sales figures of [fromKey, toKey]: totals, by method, by product / category / cashier / day. */
async function salesFigures(client, departmentId, fromKey, toKey, timeZone) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const sales = await client.transaction.findMany({ where: { departmentId, type: "SALE", status: { not: "VOIDED" }, date: { gte: start, lte: end } }, select: { id: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, date: true, user: { select: { name: true } }, tradeLines: { select: { productId: true, name: true, quantity: true, total: true, discount: true, unitCost: true, product: { select: { category: true, unit: true, kind: true } } } } } });
  const byMethod = Object.fromEntries(METHOD_KEYS.map((k) => [k, 0]));
  const byDay = {};
  const products = new Map();
  const categories = new Map();
  const cashiers = new Map();
  const lines = [];
  for (const s of sales) {
    byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + int(s.amount);
    const k = toDateKey(s.date, timeZone);
    byDay[k] = (byDay[k] || 0) + int(s.amount);
    const who = s.user?.name || "—";
    const c = cashiers.get(who) || { name: who, sales: 0, amount: 0, discounts: 0 };
    c.sales += 1;
    c.amount += int(s.amount);
    c.discounts += int(s.discountAmount);
    cashiers.set(who, c);
    for (const l of s.tradeLines) {
      lines.push(l);
      const p = products.get(l.productId) || { id: l.productId, name: l.name, category: l.product?.category || "Other", unit: l.product?.unit, lines: [] };
      p.lines.push(l);
      products.set(l.productId, p);
      const cat = l.product?.category || "Other";
      const g = categories.get(cat) || { name: cat, lines: [] };
      g.lines.push(l);
      categories.set(cat, g);
    }
  }
  const withMargin = (x) => ({ ...x, quantity: qty(sum(x.lines, (l) => l.quantity)), ...margin(x.lines), lines: undefined });
  const total = margin(lines);
  return {
    count: sales.length,
    gross: sum(sales, (s) => int(s.grossAmount ?? s.amount)),
    discounts: sum(sales, (s) => int(s.discountAmount)),
    net: sum(sales, (s) => int(s.amount)),
    basket: sales.length ? Math.round(sum(sales, (s) => int(s.amount)) / sales.length) : 0,
    cost: total.cost,
    margin: total.margin,
    marginPct: total.pct,
    byMethod,
    byDay: Object.entries(byDay).sort().map(([dateKey, amount]) => ({ dateKey, amount })),
    byProduct: [...products.values()].map(withMargin).sort((a, b) => b.revenue - a.revenue),
    byCategory: [...categories.values()].map(withMargin).sort((a, b) => b.revenue - a.revenue),
    byCashier: [...cashiers.values()].sort((a, b) => b.amount - a.amount),
  };
}

/** The dashboard of a shop / bar / other activity. */
export async function tradeDashboard({ department, todayKey, timeZone, now = new Date(), client = db }) {
  const monthFrom = `${todayKey.slice(0, 7)}-01`;
  const [products, tabs, debts, bills, today, month, crates, week] = await Promise.all([
    productList({ departmentId: department.id, client }),
    department.domain === "BAR" ? openTabs({ departmentId: department.id, timeZone, client }) : [],
    debtsOwed(client, department.id, todayKey, timeZone),
    billsDue({ departmentId: department.id, timeZone, client }),
    salesFigures(client, department.id, todayKey, todayKey, timeZone),
    salesFigures(client, department.id, monthFrom, todayKey, timeZone),
    department.domain === "BAR" ? crateBoard({ departmentId: department.id, timeZone, client }) : null,
    salesFigures(client, department.id, addDaysToKey(todayKey, -13), todayKey, timeZone),
  ]);
  const days = Array.from({ length: 14 }, (_, i) => addDaysToKey(todayKey, i - 13)).map((k) => ({ dateKey: k, amount: week.byDay.find((d) => d.dateKey === k)?.amount || 0 }));
  return {
    today,
    month,
    days,
    stock: stockTotals(products),
    tabs,
    debts: { count: debts.length, owed: sum(debts, (d) => d.balance), overdue: sum(debts.filter((d) => d.overdue), (d) => d.balance) },
    bills: { count: bills.length, owed: sum(bills, (b) => b.balance), rows: bills.slice(0, 8) },
    crates: crates?.totals || null,
    lowProducts: products.filter((p) => p.kind !== "SERVICE" && (p.low || p.empty)).slice(0, 10),
    warnings: tradeWarnings({ products, tabs, debts, bills, crates, todayKey, nowIso: now.toISOString() }),
  };
}

/** The report of any period. */
export async function tradeReport({ department, organizationId, fromKey, toKey, timeZone, todayKey, client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [sales, purchases, moves, products, statements, given, repaid, debts, crates] = await Promise.all([
    salesFigures(client, department.id, fromKey, toKey, timeZone),
    client.tradePurchase.findMany({ where: { departmentId: department.id, status: "RECORDED", date: { gte: start, lte: end } }, select: { supplierName: true, goodsTotal: true, paymentMethod: true } }),
    client.tradeMovement.findMany({ where: { departmentId: department.id, kind: { in: ["LOSS", "COUNT"] }, date: { gte: start, lte: end } }, include: { product: { select: { name: true, unit: true } } }, orderBy: { date: "asc" } }),
    productList({ departmentId: department.id, client }),
    buildStatements({ organizationId, departments: [department], fromKey, toKey, timeZone, compare: true, client }),
    client.debt.aggregate({ where: { departmentId: department.id, source: "CREDIT_SALE", date: { gte: start, lte: end }, transaction: { status: { not: "VOIDED" } } }, _sum: { amountOwed: true } }),
    client.debtPayment.aggregate({ where: { departmentId: department.id, voidedAt: null, date: { gte: start, lte: end } }, _sum: { amount: true } }),
    debtsOwed(client, department.id, todayKey || toKey, timeZone),
    department.domain === "BAR" ? crateBoard({ departmentId: department.id, timeZone, client }) : null,
  ]);
  const suppliers = new Map();
  for (const p of purchases) {
    const s = suppliers.get(p.supplierName) || { name: p.supplierName, purchases: 0, amount: 0, onCredit: 0 };
    s.purchases += 1;
    s.amount += p.goodsTotal;
    if (p.paymentMethod === "CREDIT") s.onCredit += p.goodsTotal;
    suppliers.set(p.supplierName, s);
  }
  const losses = moves.map((m) => ({ id: m.id, kind: m.kind, product: m.product.name, quantity: qty(m.quantity), unit: m.product.unit, value: m.value, note: m.note, dateKey: toDateKey(m.date, timeZone) }));
  const stock = stockTotals(products);
  return {
    fromKey,
    toKey,
    sales,
    purchases: { count: purchases.length, amount: sum(purchases, (p) => p.goodsTotal), onCredit: sum(purchases.filter((p) => p.paymentMethod === "CREDIT"), (p) => p.goodsTotal), bySupplier: [...suppliers.values()].sort((a, b) => b.amount - a.amount) },
    losses: { rows: losses, lost: -sum(losses.filter((l) => l.value < 0), (l) => l.value), found: sum(losses.filter((l) => l.value > 0), (l) => l.value) },
    stock: { ...stock, rows: products.filter((p) => p.kind !== "SERVICE" && p.isActive) },
    credit: { given: int(given._sum.amountOwed), repaid: int(repaid._sum.amount), owed: sum(debts, (d) => d.balance), overdue: sum(debts.filter((d) => d.overdue), (d) => d.balance), rows: debts.sort((a, b) => b.balance - a.balance) },
    crates: crates?.totals || null,
    statements,
    income: statements.income,
  };
}

/** One search across products, sales, purchases, tabs, customers on credit. */
export async function tradeSearch({ departmentId, q, timeZone, client = db }) {
  const text = String(q || "").trim().slice(0, 60);
  if (text.length < 2) return null;
  const [products, sales, purchases, debts, tabs] = await Promise.all([
    client.tradeProduct.findMany({ where: { departmentId, OR: [{ name: like(text) }, { code: like(text) }, { barcode: text }, { category: like(text) }] }, take: 20, orderBy: { name: "asc" } }),
    client.transaction.findMany({ where: { departmentId, type: { in: ["SALE", "OTHER_INCOME", "EXPENSE", "OTHER_EXPENSE", "PURCHASE"] }, OR: [{ referenceNo: like(text) }, { customerName: like(text) }, { description: like(text) }, { counterparty: like(text) }, { reference: like(text) }] }, orderBy: { date: "desc" }, take: 20 }),
    client.tradePurchase.findMany({ where: { departmentId, OR: [{ referenceNo: like(text) }, { supplierName: like(text) }, { supplierRef: like(text) }] }, orderBy: { date: "desc" }, take: 20 }),
    client.debt.findMany({ where: { departmentId, OR: [{ referenceNo: like(text) }, { debtorName: like(text) }, { debtorContact: like(text) }] }, orderBy: { date: "desc" }, take: 20 }),
    client.tradeTab.findMany({ where: { departmentId, OR: [{ referenceNo: like(text) }, { label: like(text) }] }, orderBy: { openedAt: "desc" }, take: 20 }),
  ]);
  const groups = {
    products: products.map((p) => ({ id: p.id, title: `${p.name} · ${p.code}`, detail: [p.category, p.barcode, p.kind === "SERVICE" ? "service" : `${qty(p.quantity)} ${p.unit} in stock`, p.isActive ? null : "archived"].filter(Boolean).join(" · "), amount: p.salePrice, href: `/products/${p.id}` })),
    money: sales.map((t) => ({ id: t.id, title: `${t.referenceNo} · ${t.customerName || t.counterparty || t.type.toLowerCase().replace("_", " ")}`, detail: `${toDateKey(t.date, timeZone)} · ${(t.description || "").slice(0, 80)}${t.status === "VOIDED" ? " · voided" : ""}`, amount: int(t.amount), href: t.type === "SALE" ? `/sell?date=${toDateKey(t.date, timeZone)}` : `/money?ref=${t.referenceNo}` })),
    purchases: purchases.map((p) => ({ id: p.id, title: `${p.referenceNo} · ${p.supplierName}`, detail: `${toDateKey(p.date, timeZone)}${p.supplierRef ? ` · invoice ${p.supplierRef}` : ""}${p.status === "VOIDED" ? " · voided" : ""}`, amount: p.goodsTotal, href: `/purchases?period=custom&from=${toDateKey(p.date, timeZone)}&to=${toDateKey(p.date, timeZone)}` })),
    debts: debts.map((d) => ({ id: d.id, title: `${d.debtorName} · ${d.referenceNo}`, detail: `${toDateKey(d.date, timeZone)} · ${d.status.toLowerCase().replace("_", " ")}`, amount: debtStatus(d.amountOwed, d.amountPaid).balance, href: "/debts" })),
    tabs: tabs.map((t) => ({ id: t.id, title: `${t.label} · ${t.referenceNo}`, detail: `${toDateKey(t.openedAt, timeZone)} · ${t.status.toLowerCase()}`, href: "/sell" })),
  };
  return { q: text, groups, total: Object.values(groups).reduce((s, g) => s + g.length, 0) };
}
