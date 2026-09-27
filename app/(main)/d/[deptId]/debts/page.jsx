import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { dayBounds, startOfDateKey, toDateKey, formatDateKey } from "@/lib/timezone";
import { debtStatus } from "@/lib/finance/money-math";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { DebtsBoard } from "@/components/restaurant/debts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Debts" };

export default async function DebtsPage({ params }) {
  const { deptId } = await params;
  const { user, department, perms } = await departmentPage(deptId, { module: "debts" });
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
    db.menuItem.findMany({ where: { departmentId: department.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sellingPrice: true, currentQuantity: true } }),
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
  return (
    <div>
      <PageHeader eyebrow={department.name} title="Debts" description="Money customers owe the department: food taken on credit and old debts. Repayments go into the cash drawer." />
      <DebtsBoard
        departmentId={department.id}
        departmentName={department.name}
        perms={{ manage: perms.debts, repay: perms.repay }}
        stats={{ outstanding: open.reduce((s, r) => s + r.balance, 0), givenToday, repaidToday: Number(todayPayments._sum.amount || 0), customersOwing: [...customers.values()].filter((c) => c.balance > 0).length }}
        debts={serialize(rows)}
        customers={serialize([...customers.values()].sort((a, b) => b.balance - a.balance))}
        dishes={serialize(dishes.map((d) => ({ id: d.id, name: d.name, price: Number(d.sellingPrice), available: Number(d.currentQuantity) })))}
      />
    </div>
  );
}
