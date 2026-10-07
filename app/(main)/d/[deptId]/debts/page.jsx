import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { dayBounds, startOfDateKey, toDateKey, formatDateKey } from "@/lib/timezone";
import { debtStatus } from "@/lib/finance/money-math";
import { summarizeDebts } from "@/lib/offline/overlay";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { DebtsBoard } from "@/components/restaurant/debts";
import { TRADE_DOMAINS } from "@/lib/domains/trade";

export const dynamic = "force-dynamic";
export const metadata = { title: "Debts" };

export default async function DebtsPage({ params }) {
  const { deptId } = await params;
  const { user, department, domain, perms, renderedAt } = await departmentPage(deptId, { module: "debts" });
  // Shops, bars, other activities: credit sales are made at the till; here, old debts and repayments.
  const trade = TRADE_DOMAINS.includes(department.domain);
  const { todayKey, timeZone } = pageDate(user, null);
  const { start, end } = dayBounds(startOfDateKey(todayKey, timeZone), timeZone);
  const [debts, dishes, todayPayments] = await Promise.all([
    db.debt.findMany({
      where: { departmentId: department.id },
      include: {
        payments: { where: { voidedAt: null }, include: { transaction: { select: { referenceNo: true } } }, orderBy: { date: "asc" } },
        transaction: { select: { referenceNo: true, status: true } },
      },
      orderBy: { date: "desc" },
      take: 1000,
    }),
    trade ? [] : db.menuItem.findMany({ where: { departmentId: department.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sellingPrice: true, currentQuantity: true } }),
    db.debtPayment.aggregate({ where: { departmentId: department.id, voidedAt: null, date: { gte: start, lte: end } }, _sum: { amount: true } }),
  ]);
  const rows = debts.map((d) => {
    const st = debtStatus(d.amountOwed, d.amountPaid, { cancelled: d.status === "CANCELLED" });
    return {
      id: d.id,
      referenceNo: d.referenceNo,
      saleReference: d.transaction?.referenceNo || null,
      source: d.source,
      dateKey: toDateKey(d.date, timeZone),
      dateLabel: formatDateKey(toDateKey(d.date, timeZone)),
      debtorId: d.debtorId,
      debtor: d.debtorName,
      phone: d.debtorContact,
      description: d.foodDescription,
      owed: Number(d.amountOwed),
      paid: Number(d.amountPaid),
      balance: st.balance,
      status: d.status,
      dueDate: d.dueDate ? toDateKey(d.dueDate, timeZone) : null,
      voidReason: d.voidReason,
      payments: d.payments.map((p) => ({ id: p.id, referenceNo: p.transaction?.referenceNo, dateLabel: formatDateKey(toDateKey(p.date, timeZone)), amount: Number(p.amount), method: p.paymentMethod })),
    };
  });
  const { stats } = summarizeDebts(rows, { todayKey, repaidToday: Number(todayPayments._sum.amount || 0) });
  return (
    <div>
      <PageHeader eyebrow={department.name} title={trade ? "Customers on credit" : "Debts"} description={trade ? `Money customers owe: ${domain.words.items.toLowerCase()} sold on credit at the till, and debts from before the app. Repayments go into the cash drawer.` : "Money customers owe the department: food taken on credit and old debts. Repayments go into the cash drawer."} />
      <DebtsBoard
        departmentId={department.id}
        departmentName={department.name}
        todayKey={todayKey}
        renderedAt={renderedAt}
        perms={{ manage: perms.debts, repay: perms.repay }}
        stats={stats}
        debts={serialize(rows)}
        allowNew={!trade}
        dishes={serialize(dishes.map((d) => ({ id: d.id, name: d.name, price: Number(d.sellingPrice), available: Number(d.currentQuantity) })))}
      />
    </div>
  );
}
