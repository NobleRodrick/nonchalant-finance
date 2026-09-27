/**
 * History: every record of a department in one list (money records and stock records),
 * searchable by reference, filterable by date, type, person and status. Each record can be
 * opened to see its lines, links (sale ↔ debt ↔ repayments, purchase ↔ stock added) and its
 * audit trail — every transaction is traceable.
 */
import { db } from "@/lib/prisma";
import { rangeBounds, formatTimeInZone, toDateKey, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { TYPE_LABELS, METHOD_LABELS } from "@/lib/finance/money-math";
import { roundMoney } from "@/lib/money";
import { categoryLabel } from "@/data/categories";

export const HISTORY_TYPES = [
  { id: "ALL", label: "All records" },
  { id: "SALE", label: "Sales" },
  { id: "RENT_INCOME", label: "Rent income" },
  { id: "OTHER_INCOME", label: "Other income" },
  { id: "DISCOUNT", label: "Discounts" },
  { id: "PURCHASE", label: "Purchases" },
  { id: "EXPENSE", label: "Expenses" },
  { id: "OTHER_EXPENSE", label: "Other expenses" },
  { id: "DEBT_PAYMENT", label: "Debt repayments" },
  { id: "CASH_HANDOVER", label: "Cash to Boss" },
  { id: "STOCK", label: "Stock added / corrected" },
];

const STOCK_TYPES = ["OPENING", "STOCK_ADDED", "CORRECTION", "SPOILED", "OPENING_CORRECTION", "PREPARATION", "WASTE", "DAMAGE", "ADJUSTMENT"];
const STOCK_LABELS = { OPENING: "New dish", STOCK_ADDED: "Stock added", PREPARATION: "Stock added", CORRECTION: "Count corrected", ADJUSTMENT: "Count corrected", SPOILED: "Spoiled", WASTE: "Spoiled", DAMAGE: "Spoiled", OPENING_CORRECTION: "Opening stock set" };

export async function listHistory({ organizationId, departmentId, fromKey, toKey, type = "ALL", status = "ALL", userId = null, q = "", timeZone = DEFAULT_TIMEZONE, take = 500, client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const search = String(q || "").trim();
  const wantMoney = type !== "STOCK";
  const wantStock = type === "ALL" || type === "STOCK";
  const moneyWhere = {
    organizationId,
    departmentId,
    date: { gte: start, lte: end },
    ...(type !== "ALL" && type !== "STOCK" ? { type } : {}),
    ...(status === "VOIDED" ? { status: "VOIDED" } : status === "VALID" ? { status: { not: "VOIDED" } } : {}),
    ...(userId ? { userId } : {}),
    ...(search ? { OR: [{ referenceNo: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }, { customerName: { contains: search, mode: "insensitive" } }, { counterparty: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const stockWhere = {
    organizationId,
    departmentId,
    date: { gte: start, lte: end },
    transactionId: null,
    menuItemId: { not: null },
    type: { in: STOCK_TYPES },
    ...(status === "VOIDED" ? { voidedAt: { not: null } } : status === "VALID" ? { voidedAt: null } : {}),
    ...(userId ? { userId } : {}),
    ...(search ? { OR: [{ referenceNo: { contains: search, mode: "insensitive" } }, { menuItem: { name: { contains: search, mode: "insensitive" } } }, { reason: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [money, stock] = await Promise.all([
    wantMoney ? client.transaction.findMany({ where: moneyWhere, include: { user: { select: { name: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take }) : [],
    wantStock ? client.stockMovement.findMany({ where: stockWhere, include: { user: { select: { name: true } }, menuItem: { select: { name: true, sellingPrice: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take }) : [],
  ]);
  const rows = [
    ...money.map((t) => ({
      id: t.id,
      kind: "money",
      date: t.date,
      dateKey: toDateKey(t.date, timeZone),
      time: formatTimeInZone(t.date, timeZone),
      referenceNo: t.referenceNo,
      type: t.type,
      typeLabel: TYPE_LABELS[t.type] || t.type,
      direction: ["SALE", "RENT_INCOME", "OTHER_INCOME", "DEBT_PAYMENT"].includes(t.type) ? "in" : ["CASH_HANDOVER"].includes(t.type) ? "transfer" : "out",
      description: t.description || categoryLabel(t.category),
      method: METHOD_LABELS[t.paymentMethod] || t.paymentMethod,
      amount: roundMoney(t.amount),
      by: t.user?.name,
      voided: t.status === "VOIDED",
      voidReason: t.voidReason,
    })),
    ...stock.map((m) => ({
      id: m.id,
      kind: "stock",
      date: m.date,
      dateKey: toDateKey(m.date, timeZone),
      time: formatTimeInZone(m.date, timeZone),
      referenceNo: m.referenceNo,
      type: m.type,
      typeLabel: STOCK_LABELS[m.type] || m.type,
      direction: "stock",
      description: `${m.menuItem?.name}: ${Number(m.quantity) > 0 && ["CORRECTION", "OPENING_CORRECTION"].includes(m.type) ? "+" : ""}${Number(m.quantity)} plate(s)${m.reason ? ` — ${m.reason}` : m.notes ? ` — ${m.notes}` : ""}`,
      method: null,
      amount: null,
      plates: Number(m.quantity),
      by: m.user?.name,
      voided: Boolean(m.voidedAt),
      voidReason: null,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  const valid = rows.filter((r) => !r.voided && r.kind === "money");
  return {
    rows,
    totals: {
      count: rows.length,
      moneyIn: valid.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0),
      moneyOut: valid.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0),
      transfers: valid.filter((r) => r.direction === "transfer").reduce((s, r) => s + r.amount, 0),
    },
  };
}

/** One record with its lines, links and audit trail. */
export async function recordDetail({ organizationId, kind, id, client = db }) {
  if (kind === "stock") {
    const m = await client.stockMovement.findFirst({
      where: { id, organizationId },
      include: { menuItem: true, user: { select: { name: true } }, purchase: { include: { transaction: { select: { id: true, referenceNo: true } } } } },
    });
    if (!m) return null;
    const audit = await client.auditEvent.findMany({ where: { organizationId, entityId: m.id }, include: {}, orderBy: { createdAt: "asc" } });
    return { kind, record: m, audit, attachments: [] };
  }
  const t = await client.transaction.findFirst({
    where: { id, organizationId },
    include: {
      user: { select: { name: true } },
      saleLines: { include: { menuItem: { select: { name: true } } } },
      debt: { include: { payments: { include: { transaction: { select: { id: true, referenceNo: true, status: true } } }, orderBy: { date: "asc" } } } },
      debtPayment: { include: { debt: { select: { id: true, referenceNo: true, debtorName: true, transactionId: true } } } },
      purchase: { include: { lines: true, stockAdds: { include: { menuItem: { select: { name: true } } } } } },
      cashHandovers: true,
      department: { select: { name: true, code: true } },
    },
  });
  if (!t) return null;
  const handoverIds = t.cashHandovers.map((h) => h.id);
  const [audit, attachments, voidedBy] = await Promise.all([
    client.auditEvent.findMany({ where: { organizationId, entityId: { in: [t.id, ...handoverIds, t.debt?.id].filter(Boolean) } }, orderBy: { createdAt: "asc" } }),
    client.attachment.findMany({ where: { organizationId, entityId: { in: [t.id, ...handoverIds] } }, select: { id: true, fileName: true, mimeType: true } }),
    t.voidedById ? client.user.findUnique({ where: { id: t.voidedById }, select: { name: true } }) : null,
  ]);
  const actorIds = [...new Set(audit.map((a) => a.userId).filter(Boolean))];
  const actors = actorIds.length ? await client.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  return {
    kind: "money",
    record: { ...t, voidedByName: voidedBy?.name || null },
    audit: audit.map((a) => ({ ...a, userName: actors.find((u) => u.id === a.userId)?.name || "System" })),
    attachments,
  };
}
