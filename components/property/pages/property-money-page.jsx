import { db } from "@/lib/prisma";
import { pageDate } from "@/lib/page-guards";
import { formatTimeInZone, rangeBounds, toDateKey } from "@/lib/timezone";
import { periodLabel, resolvePeriod } from "@/lib/reports/periods";
import { METHOD_LABELS, TYPE_LABELS } from "@/lib/finance/money-math";
import { categoriesFor, categoryLabel } from "@/data/categories";
import { buildingsOf } from "@/lib/property/unit-queries";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { MoneyBoard } from "@/components/departments/money-board";

const SHOWN = ["BOOKING_PAYMENT", "BOOKING_REFUND", "OTHER_INCOME", "EXPENSE", "OTHER_EXPENSE"];
const DEPOSITS = ["lease-deposit", "lease-deposit-refund"];
const sum = (rows, f) => rows.reduce((s, t) => s + Number(t.amount), 0);

/**
 * Property rental: money in and out of a period (?period=, default this month), by kind
 * (?kind=in|out|deposits), building or office (?place=), or waiting for approval (?pending=1):
 * tenants' payments and refunds (recorded on each contract), deposits apart, expenses with their
 * building / office, payee and approval, other income. ?ref= shows one record whatever its date.
 */
export async function PropertyMoneyPage({ page, searchParams: sp }) {
  const { user, department, domain, perms, renderedAt } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "month");
  const { start, end } = rangeBounds(range.fromKey, range.toKey, timeZone);
  const kind = sp?.kind || "";
  const place = sp?.place || "";
  const where = {
    departmentId: department.id,
    type: { in: SHOWN },
    ...(sp?.ref ? { referenceNo: String(sp.ref).slice(0, 40) } : sp?.pending ? { type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, validatedAt: null, status: { not: "VOIDED" } } : { date: { gte: start, lte: end } }),
    ...(kind === "in" ? { type: { in: ["BOOKING_PAYMENT", "OTHER_INCOME"] }, NOT: { category: { in: DEPOSITS } } } : kind === "out" ? { type: { in: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"] }, NOT: { category: { in: DEPOSITS } } } : kind === "deposits" ? { category: { in: DEPOSITS } } : {}),
    ...(place ? { OR: [{ propertyUnitId: place }, { buildingId: place }] } : {}),
  };
  const [transactions, buildings, units, pendingCount] = await Promise.all([
    db.transaction.findMany({ where, include: { user: { select: { id: true, name: true } }, lease: { select: { id: true, referenceNo: true, client: { select: { name: true } } } }, propertyUnit: { select: { id: true, name: true } }, building: { select: { id: true, name: true } }, validatedBy: { select: { name: true } } }, orderBy: { date: "desc" }, take: 1500 }),
    buildingsOf(department.id),
    db.propertyUnit.findMany({ where: { departmentId: department.id, isActive: true }, select: { id: true, name: true, building: { select: { name: true, sortOrder: true } } }, orderBy: [{ building: { sortOrder: "asc" } }, { name: "asc" }] }),
    db.transaction.count({ where: { departmentId: department.id, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, validatedAt: null, status: { not: "VOIDED" } } }),
  ]);
  const files = transactions.length ? await db.attachment.findMany({ where: { entityType: "Transaction", entityId: { in: transactions.map((t) => t.id) } }, select: { id: true, entityId: true, fileName: true } }) : [];
  const live = transactions.filter((t) => t.status !== "VOIDED");
  const base = `/d/${department.id}`;
  const records = transactions.map((t) => ({
    id: t.id,
    referenceNo: t.referenceNo,
    type: t.type,
    typeLabel: DEPOSITS.includes(t.category) ? "Deposit" : TYPE_LABELS[t.type]?.replace(/s$/, "") || t.type,
    direction: ["BOOKING_PAYMENT", "OTHER_INCOME"].includes(t.type) ? "in" : "out",
    dateKey: toDateKey(t.date, timeZone),
    time: formatTimeInZone(t.date, timeZone),
    category: categoryLabel(t.category),
    categoryId: t.category,
    methodCode: t.paymentMethod,
    method: METHOD_LABELS[t.paymentMethod] || t.paymentMethod,
    description: t.description,
    counterparty: t.counterparty,
    reference: t.reference,
    link: t.lease ? { label: `${t.lease.referenceNo} · ${t.lease.client.name}`, href: `${base}/contracts/${t.lease.id}` } : t.propertyUnit ? { label: `Office ${t.propertyUnit.name}`, href: `${base}/offices/${t.propertyUnit.id}` } : t.building ? { label: t.building.name } : null,
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
  const summary = {
    bookingPayments: sum(live.filter((t) => t.category === "lease-payment")),
    bookingRefunds: sum(live.filter((t) => t.category === "lease-refund")),
    otherIncome: sum(live.filter((t) => t.type === "OTHER_INCOME")),
    expenses: sum(live.filter((t) => ["EXPENSE", "OTHER_EXPENSE"].includes(t.type))),
    investments: sum(live.filter((t) => t.category === "lease-deposit")) - sum(live.filter((t) => t.category === "lease-deposit-refund")),
    cash: { in: sum(live.filter((t) => t.paymentMethod === "CASH" && ["BOOKING_PAYMENT", "OTHER_INCOME"].includes(t.type))), out: sum(live.filter((t) => t.paymentMethod === "CASH" && !["BOOKING_PAYMENT", "OTHER_INCOME"].includes(t.type))) },
  };
  const categories = Object.fromEntries(["EXPENSE", "OTHER_EXPENSE", "OTHER_INCOME"].map((type) => [type, categoriesFor(type, department.domain).filter((c) => !c.internal).map((c) => ({ id: c.id, label: c.label }))]));
  return (
    <div>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Money in / out" description={`${sp?.pending ? "Every expense waiting for approval" : periodLabel(range)}. Tenants' payments (recorded on each contract), deposits kept apart, expenses with their building or office, payee and approval, other income.`}>
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
        labels={{ customers: "From tenants", investments: "Deposits (net)", investmentsHint: "held for tenants, not income", investmentsIn: true }}
        kinds={[{ value: "", label: "Everything" }, { value: "in", label: "Money in" }, { value: "out", label: "Expenses and refunds" }, { value: "deposits", label: "Deposits" }]}
        link={{ label: "Building / office", none: "The whole business", every: "Every building and office", filter: "place", hint: "Where the money went (its reports count it there).", options: [...buildings.map((b) => ({ value: `building:${b.id}`, label: b.name })), ...units.map((u) => ({ value: `unit:${u.id}`, label: `Office ${u.name} · ${u.building.name}` }))] }}
        categories={categories}
      />
    </div>
  );
}
