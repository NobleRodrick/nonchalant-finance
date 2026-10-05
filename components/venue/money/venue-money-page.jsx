import { db } from "@/lib/prisma";
import { pageDate } from "@/lib/page-guards";
import { dayStatus } from "@/lib/departments/day-status";
import { addDaysToKey, dayBounds, startOfDateKey, formatTimeInZone } from "@/lib/timezone";
import { summarizeMoney, TYPE_LABELS, METHOD_LABELS } from "@/lib/finance/money-math";
import { categoryLabel } from "@/data/categories";
import { dbDate, dateKeyOf } from "@/lib/venue/dates";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { DateNav } from "@/components/kit/date-nav";
import { DayBanner } from "@/components/departments/day-banner";
import { VenueMoneyBoard } from "./venue-money-board";

/**
 * Money in / out of an event venue day: payments received from clients and refunds (from the
 * bookings), event and hall expenses (an expense may name its booking), other income.
 */
export async function VenueMoneyPage({ page, searchParams: sp }) {
  const { user, department, domain, perms, renderedAt } = page;
  const { dateKey, todayKey, isToday, timeZone } = pageDate(user, sp?.date);
  const { start, end } = dayBounds(startOfDateKey(dateKey, timeZone), timeZone);
  const [transactions, status, bookings] = await Promise.all([
    db.transaction.findMany({
      where: { departmentId: department.id, date: { gte: start, lte: end } },
      include: { user: { select: { name: true } }, booking: { select: { id: true, referenceNo: true, eventType: true, client: { select: { name: true } } } } },
      orderBy: { date: "desc" },
    }),
    dayStatus(department.id, dateKey, timeZone),
    db.venueBooking.findMany({
      where: { departmentId: department.id, status: { not: "CANCELLED" }, eventDate: { gte: dbDate(addDaysToKey(dateKey, -60)) } },
      select: { id: true, referenceNo: true, eventType: true, eventDate: true, client: { select: { name: true } } },
      orderBy: { eventDate: "asc" },
      take: 300,
    }),
  ]);
  const money = summarizeMoney(transactions);
  const records = transactions
    .filter((t) => ["BOOKING_PAYMENT", "BOOKING_REFUND", "OTHER_INCOME", "EXPENSE", "OTHER_EXPENSE"].includes(t.type))
    .map((t) => ({
      id: t.id,
      referenceNo: t.referenceNo,
      type: t.type,
      typeLabel: TYPE_LABELS[t.type]?.replace(/s$/, "") || t.type,
      direction: ["BOOKING_PAYMENT", "OTHER_INCOME"].includes(t.type) ? "in" : "out",
      time: formatTimeInZone(t.date, timeZone),
      category: categoryLabel(t.category),
      categoryId: t.category,
      methodCode: t.paymentMethod,
      method: METHOD_LABELS[t.paymentMethod] || t.paymentMethod,
      description: t.description,
      receivedBy: t.receivedByName || t.user?.name,
      amount: Number(t.amount),
      voided: t.status === "VOIDED",
      voidReason: t.voidReason,
      booking: t.booking ? { id: t.booking.id, referenceNo: t.booking.referenceNo, label: `${t.booking.referenceNo} · ${t.booking.client.name}` } : null,
    }));
  return (
    <div>
      <PageHeader
        eyebrow={`${domain.label} · ${department.name}`}
        title="Money in / out"
        description="Money received from clients and given back (recorded on each booking), the hall's and events' expenses, other income."
        actions={<DateNav dateKey={dateKey} todayKey={todayKey} />}
      />
      <DayBanner dateKey={dateKey} isToday={isToday} status={status} departmentId={department.id} />
      <VenueMoneyBoard
        departmentId={department.id}
        dateKey={isToday ? null : dateKey}
        renderedAt={renderedAt}
        canRecord={(perms.expenses || perms.moneyIn) && !status.locked}
        canVoid={perms.void && !status.locked}
        summary={serialize({
          bookingPayments: money.bookingPayments,
          bookingRefunds: money.bookingRefunds,
          otherIncome: money.otherIncome,
          expenses: money.expenses,
          otherExpenses: money.otherExpenses,
          receivedByMethod: money.receivedByMethod,
          cash: money.cash,
        })}
        records={serialize(records)}
        bookings={bookings.map((b) => ({ id: b.id, label: `${b.referenceNo} · ${b.client.name} · ${b.eventType} · ${dateKeyOf(b.eventDate)}` }))}
      />
    </div>
  );
}
