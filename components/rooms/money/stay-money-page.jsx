import { db } from "@/lib/prisma";
import { pageDate } from "@/lib/page-guards";
import { rangeBounds, formatTimeInZone, toDateKey } from "@/lib/timezone";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { summarizeMoney, TYPE_LABELS, METHOD_LABELS } from "@/lib/finance/money-math";
import { categoriesFor, categoryLabel } from "@/data/categories";
import { roomsOf } from "@/lib/rooms/room-queries";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { StayMoneyBoard } from "./stay-money-board";

const SHOWN = ["BOOKING_PAYMENT", "BOOKING_REFUND", "OTHER_INCOME", "EXPENSE", "OTHER_EXPENSE"];

/**
 * Money in / out of a guest house for a period (?period=, default today), by apartment (?room=,
 * "shared" for the house's shared costs) and waiting for validation (?pending=1): payments and
 * refunds (recorded on each booking), expenses with all their details, other income.
 */
export async function StayMoneyPage({ page, searchParams: sp }) {
  const { user, department, domain, perms, renderedAt } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "today");
  const { start, end } = rangeBounds(range.fromKey, range.toKey, timeZone);
  const roomFilter = sp?.room === "shared" ? null : sp?.room || undefined;
  const where = {
    departmentId: department.id,
    date: { gte: start, lte: end },
    type: { in: SHOWN },
    ...(sp?.room ? { roomId: roomFilter } : {}),
    ...(sp?.pending ? { type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, validatedAt: null, status: { not: "VOIDED" } } : {}),
  };
  const [transactions, rooms, pendingCount] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { user: { select: { id: true, name: true } }, room: { select: { id: true, name: true } }, stay: { select: { id: true, referenceNo: true, guestName: true } }, validatedBy: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 1000,
    }),
    roomsOf(department.id, { includeInactive: true }),
    db.transaction.count({ where: { departmentId: department.id, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, validatedAt: null, status: { not: "VOIDED" } } }),
  ]);
  const files = transactions.length ? await db.attachment.findMany({ where: { entityType: "Transaction", entityId: { in: transactions.map((t) => t.id) } }, select: { id: true, entityId: true, fileName: true } }) : [];
  const money = summarizeMoney(transactions);
  const records = transactions.map((t) => ({
    id: t.id,
    referenceNo: t.referenceNo,
    type: t.type,
    typeLabel: TYPE_LABELS[t.type]?.replace(/s$/, "") || t.type,
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
    room: t.room,
    stay: t.stay,
    recordedBy: t.user?.name,
    recordedById: t.user?.id,
    receivedBy: t.receivedByName,
    authorizedBy: t.authorizedByName,
    validatedBy: t.validatedBy?.name || null,
    validatedAt: t.validatedAt,
    validationNote: t.validationNote,
    amount: Number(t.amount),
    voided: t.status === "VOIDED",
    voidReason: t.voidReason,
    proofs: files.filter((f) => f.entityId === t.id).map((f) => ({ id: f.id, fileName: f.fileName })),
  }));
  const categories = Object.fromEntries(["EXPENSE", "OTHER_EXPENSE", "OTHER_INCOME"].map((type) => [type, categoriesFor(type, department.domain).filter((c) => !c.internal).map((c) => ({ id: c.id, label: c.label }))]));
  return (
    <div>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Money in / out" description={`${periodLabel(range)}. Payments from guests (recorded on each booking), expenses of each apartment or shared by the house, other income. Every expense is validated by the Boss or another head.`}>
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <StayMoneyBoard
        departmentId={department.id}
        renderedAt={renderedAt}
        isBoss={perms.boss}
        canRecord={perms.expenses || perms.moneyIn}
        canVoid={perms.void}
        currentUserId={user.id}
        filters={{ room: sp?.room || "", pending: Boolean(sp?.pending) }}
        pendingCount={pendingCount}
        summary={serialize({ bookingPayments: money.bookingPayments, bookingRefunds: money.bookingRefunds, otherIncome: money.otherIncome, expenses: money.expenses + money.otherExpenses, assetPurchases: money.assetPurchases, receivedByMethod: money.receivedByMethod, cash: money.cash })}
        records={serialize(records)}
        rooms={rooms.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive }))}
        categories={categories}
      />
    </div>
  );
}
