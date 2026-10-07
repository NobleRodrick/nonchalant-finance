import { db } from "@/lib/prisma";
import { pageDate } from "@/lib/page-guards";
import { formatTimeInZone, rangeBounds, toDateKey } from "@/lib/timezone";
import { periodLabel, resolvePeriod } from "@/lib/reports/periods";
import { METHOD_LABELS, TYPE_LABELS } from "@/lib/finance/money-math";
import { categoriesFor, categoryLabel } from "@/data/categories";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { MoneyBoard } from "@/components/departments/money-board";

const IN = ["SALE", "BOOKING_PAYMENT", "OTHER_INCOME", "DEBT_PAYMENT"];
const OUT = ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE", "PURCHASE", "SUPPLIER_PAYMENT"];
const DEPOSITS = ["packaging-deposit", "packaging-deposit-refund", "packaging-deposit-paid", "packaging-deposit-back"];
const NOT_DEPOSIT = [{ category: null }, { category: { notIn: DEPOSITS } }];
const sum = (rows) => rows.reduce((s, t) => s + Number(t.amount), 0);
const LABEL = { SALE: "Sale", BOOKING_PAYMENT: "Payment", BOOKING_REFUND: "Refund", DEBT_PAYMENT: "Debt repaid", PURCHASE: "Purchase of goods", SUPPLIER_PAYMENT: "Supplier paid" };

/**
 * Shop, bar, pressing, car wash, other: every money record of a period (?period=), by kind
 * (?kind=in|out|purchases|deposits) — sales (cash, MoMo, bank; credit sales are debts), payments
 * on tickets, debts repaid, purchases and suppliers paid, crate deposits apart, expenses (with
 * their approval) and other income, which are recorded here. ?ref= shows one record.
 */
export async function TradeMoneyPage({ page, searchParams: sp }) {
  const { user, department, domain, perms, renderedAt } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp || {}, todayKey, "month");
  const { start, end } = rangeBounds(range.fromKey, range.toKey, timeZone);
  const kind = sp?.kind || "";
  const where = {
    departmentId: department.id,
    type: { in: [...IN, ...OUT] },
    NOT: { paymentMethod: "CREDIT" },
    ...(sp?.ref ? { referenceNo: String(sp.ref).slice(0, 40) } : sp?.pending ? { type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, validatedAt: null, status: { not: "VOIDED" } } : { date: { gte: start, lte: end } }),
    ...(kind === "in" ? { type: { in: IN }, OR: NOT_DEPOSIT } : kind === "out" ? { type: { in: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"] }, OR: NOT_DEPOSIT } : kind === "purchases" ? { type: { in: ["PURCHASE", "SUPPLIER_PAYMENT"] } } : kind === "deposits" ? { category: { in: DEPOSITS } } : {}),
  };
  const batches = department.domain === "FARM" ? await db.farmBatch.findMany({ where: { departmentId: department.id }, orderBy: [{ status: "asc" }, { startDate: "desc" }], select: { id: true, name: true, status: true }, take: 200 }) : [];
  const [transactions, pendingCount] = await Promise.all([
    db.transaction.findMany({ where: { ...where, ...(sp?.place ? { farmBatchId: String(sp.place) } : {}) }, include: { user: { select: { id: true, name: true } }, validatedBy: { select: { name: true } }, serviceTicket: { select: { id: true, referenceNo: true } }, farmBatch: { select: { id: true, name: true } } }, orderBy: { date: "desc" }, take: 2000 }),
    db.transaction.count({ where: { departmentId: department.id, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, validatedAt: null, status: { not: "VOIDED" } } }),
  ]);
  const files = transactions.length ? await db.attachment.findMany({ where: { entityType: "Transaction", entityId: { in: transactions.map((t) => t.id) } }, select: { id: true, entityId: true, fileName: true } }) : [];
  const live = transactions.filter((t) => t.status !== "VOIDED");
  const base = `/d/${department.id}`;
  const records = transactions.map((t) => ({
    id: t.id,
    referenceNo: t.referenceNo,
    type: t.type,
    typeLabel: DEPOSITS.includes(t.category) ? "Crate deposit" : LABEL[t.type] || TYPE_LABELS[t.type]?.replace(/s$/, "") || t.type,
    direction: IN.includes(t.type) ? "in" : "out",
    dateKey: toDateKey(t.date, timeZone),
    time: formatTimeInZone(t.date, timeZone),
    category: categoryLabel(t.category),
    categoryId: t.category,
    methodCode: t.paymentMethod,
    method: METHOD_LABELS[t.paymentMethod] || t.paymentMethod,
    description: t.description,
    counterparty: t.counterparty || t.customerName,
    reference: t.reference,
    link: t.serviceTicket ? { label: t.serviceTicket.referenceNo, href: `${base}/tickets/${t.serviceTicket.id}` } : t.farmBatch ? { label: t.farmBatch.name, href: `${base}/batches/${t.farmBatch.id}` } : t.type === "SALE" ? { label: "Receipt", href: `${base}/money/receipt/${t.id}` } : null,
    recordedBy: t.user?.name,
    recordedById: t.user?.id,
    spentBy: t.receivedByName,
    authorizedBy: t.authorizedByName,
    validatedBy: t.validatedBy?.name || null,
    amount: Number(t.amount),
    voided: t.status === "VOIDED",
    voidReason: t.voidReason,
    needsApproval: ["EXPENSE", "OTHER_EXPENSE"].includes(t.type) && !t.validatedAt && t.status !== "VOIDED",
    proofs: files.filter((f) => f.entityId === t.id).map((f) => ({ id: f.id, fileName: f.fileName })),
  }));
  const notDeposit = (t) => !DEPOSITS.includes(t.category);
  const summary = {
    bookingPayments: sum(live.filter((t) => ["SALE", "BOOKING_PAYMENT", "DEBT_PAYMENT"].includes(t.type) && notDeposit(t))),
    bookingRefunds: sum(live.filter((t) => t.type === "BOOKING_REFUND" && notDeposit(t))),
    otherIncome: sum(live.filter((t) => t.type === "OTHER_INCOME")),
    expenses: sum(live.filter((t) => ["EXPENSE", "OTHER_EXPENSE"].includes(t.type))),
    investments: sum(live.filter((t) => ["PURCHASE", "SUPPLIER_PAYMENT"].includes(t.type))),
    cash: { in: sum(live.filter((t) => t.paymentMethod === "CASH" && IN.includes(t.type))), out: sum(live.filter((t) => t.paymentMethod === "CASH" && OUT.includes(t.type))) },
  };
  const categories = Object.fromEntries(["EXPENSE", "OTHER_EXPENSE", "OTHER_INCOME"].map((type) => [type, categoriesFor(type, department.domain).filter((c) => !c.internal).map((c) => ({ id: c.id, label: c.label }))]));
  const sells = domain.engine !== "SERVICES";
  return (
    <div>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Money in / out" description={`${sp?.pending ? "Every expense waiting for approval" : periodLabel(range)}. ${sells ? "Sales (credit sales count when repaid), " : ""}${domain.engine !== "TRADE" ? "payments on tickets, " : ""}debts repaid, ${sells ? "purchases and suppliers paid, " : ""}expenses and other income — record expenses and other income here.`}>
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <MoneyBoard
        departmentId={department.id}
        renderedAt={renderedAt}
        canRecord={perms.expenses || perms.moneyIn}
        canApprove={perms.approve}
        canVoid={perms.void}
        canExport={perms.export}
        currentUserId={user.id}
        currentUserName={user.name}
        isBoss={perms.boss}
        filters={{ kind, pending: Boolean(sp?.pending) }}
        pendingCount={pendingCount}
        periodKey={`${range.fromKey}-${range.toKey}`}
        summary={serialize(summary)}
        records={serialize(records)}
        labels={{ customers: sells ? "Sales and payments" : "From customers", investments: sells ? "Goods bought" : "Bought", investmentsHint: sells ? "purchases paid and suppliers' bills" : "purchases" }}
        kinds={[{ value: "", label: "Everything" }, { value: "in", label: "Money in" }, { value: "out", label: "Expenses and refunds" }, ...(sells ? [{ value: "purchases", label: "Purchases and suppliers" }] : []), ...(department.domain === "BAR" ? [{ value: "deposits", label: "Crate deposits" }] : [])]}
        categories={categories}
        {...(department.domain === "FARM" ? { link: { label: "Batch / field", none: "The whole farm", every: "Every batch", filter: "place", hint: "Its cost goes to that batch's profit.", options: batches.map((b) => ({ value: `batch:${b.id}`, label: `${b.name}${b.status === "CLOSED" ? " (closed)" : ""}` })) } } : {})}
      />
    </div>
  );
}
