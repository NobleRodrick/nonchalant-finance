import { db } from "@/lib/prisma";
import { pageDate } from "@/lib/page-guards";
import { formatTimeInZone, rangeBounds, toDateKey } from "@/lib/timezone";
import { periodLabel, resolvePeriod } from "@/lib/reports/periods";
import { METHOD_LABELS, TYPE_LABELS, summarizeMoney } from "@/lib/finance/money-math";
import { categoriesFor, categoryLabel } from "@/data/categories";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { MoneyBoard } from "@/components/departments/money-board";

const SHOWN = ["BOOKING_PAYMENT", "BOOKING_REFUND", "OTHER_INCOME", "EXPENSE", "OTHER_EXPENSE"];

/**
 * Event rental: money in and out of a period (?period=, default this month), filtered by kind
 * (?kind=in|out|purchases), event (?event=) or waiting for approval (?pending=1): payments and
 * refunds (recorded on each booking), expenses with their details and approval, purchases
 * (investments), other income. ?ref= shows one record whatever its date (search results).
 */
export async function RentalMoneyPage({ page, searchParams: sp }) {
  const { user, department, domain, perms, renderedAt } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "month");
  const { start, end } = rangeBounds(range.fromKey, range.toKey, timeZone);
  const kind = sp?.kind || "";
  const where = {
    departmentId: department.id,
    type: { in: SHOWN },
    ...(sp?.ref ? { referenceNo: String(sp.ref).slice(0, 40) } : sp?.pending ? { type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, validatedAt: null, status: { not: "VOIDED" }, NOT: { category: "rental-stock" } } : { date: { gte: start, lte: end } }),
    ...(kind === "in" ? { type: { in: ["BOOKING_PAYMENT", "OTHER_INCOME"] } } : kind === "out" ? { type: { in: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"] }, NOT: { category: "rental-stock" } } : kind === "purchases" ? { category: "rental-stock" } : {}),
    ...(sp?.event ? { rentalOrderId: sp.event } : {}),
  };
  const [transactions, orders, pendingCount] = await Promise.all([
    db.transaction.findMany({ where, include: { user: { select: { id: true, name: true } }, rentalOrder: { select: { id: true, referenceNo: true, eventType: true, client: { select: { name: true } } } }, validatedBy: { select: { name: true } } }, orderBy: { date: "desc" }, take: 1500 }),
    db.rentalOrder.findMany({ where: { departmentId: department.id, status: { not: "CANCELLED" } }, select: { id: true, referenceNo: true, eventType: true, eventDate: true, client: { select: { name: true } } }, orderBy: { eventDate: "desc" }, take: 300 }),
    db.transaction.count({ where: { departmentId: department.id, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, validatedAt: null, status: { not: "VOIDED" }, NOT: { category: "rental-stock" } } }),
  ]);
  const files = transactions.length ? await db.attachment.findMany({ where: { entityType: "Transaction", entityId: { in: transactions.map((t) => t.id) } }, select: { id: true, entityId: true, fileName: true } }) : [];
  const money = summarizeMoney(transactions);
  const records = transactions.map((t) => ({
    id: t.id,
    referenceNo: t.referenceNo,
    type: t.type,
    typeLabel: t.category === "rental-stock" ? "Purchase" : TYPE_LABELS[t.type]?.replace(/s$/, "") || t.type,
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
    link: t.rentalOrder ? { label: t.rentalOrder.referenceNo, href: `/d/${department.id}/bookings/${t.rentalOrder.id}` } : null,
    recordedBy: t.user?.name,
    recordedById: t.user?.id,
    spentBy: t.receivedByName,
    authorizedBy: t.authorizedByName,
    validatedBy: t.validatedBy?.name || null,
    validatedAt: t.validatedAt,
    validationNote: t.validationNote,
    amount: Number(t.amount),
    voided: t.status === "VOIDED",
    voidReason: t.voidReason,
    needsApproval: ["EXPENSE", "OTHER_EXPENSE"].includes(t.type) && t.category !== "rental-stock" && !t.validatedAt && t.status !== "VOIDED",
    proofs: files.filter((f) => f.entityId === t.id).map((f) => ({ id: f.id, fileName: f.fileName })),
  }));
  const categories = Object.fromEntries(["EXPENSE", "OTHER_EXPENSE", "OTHER_INCOME"].map((type) => [type, categoriesFor(type, department.domain).filter((c) => !c.internal).map((c) => ({ id: c.id, label: c.label }))]));
  return (
    <div>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Money in / out" description={`${sp?.pending ? "Every expense waiting for approval" : periodLabel(range)}. Payments from customers (recorded on each booking), expenses with their event, payee and approval, purchases of items (investments), other income.`}>
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
        filters={{ kind, event: sp?.event || "", pending: Boolean(sp?.pending) }}
        pendingCount={pendingCount}
        periodKey={`${range.fromKey}-${range.toKey}`}
        summary={serialize({ bookingPayments: money.bookingPayments, bookingRefunds: money.bookingRefunds, otherIncome: money.otherIncome, expenses: money.expenses + money.otherExpenses, investments: money.assetPurchases, receivedByMethod: money.receivedByMethod, cash: money.cash })}
        records={serialize(records)}
        link={{ label: "Event", none: "No event (general)", every: "Every event", filter: "event", hint: "The booking this expense was for (its profit counts it).", options: orders.map((o) => ({ value: `order:${o.id}`, label: `${o.referenceNo} · ${o.eventType} · ${o.client.name}` })) }}
        categories={categories}
      />
    </div>
  );
}
