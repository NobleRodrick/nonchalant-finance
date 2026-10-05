import Link from "next/link";
import { db } from "@/lib/prisma";
import { departmentTeam } from "@/lib/departments/team";
import { pageDate } from "@/lib/page-guards";
import { buildDailyReport } from "@/lib/reports/daily-report";
import { summarizeMoney } from "@/lib/finance/money-math";
import { listCashRequests } from "@/lib/finance/cash-requests";
import { formatMoney } from "@/lib/format";
import { addDaysToKey, listDateKeys, rangeBounds, toDateKey, formatDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader, Section, StatusBadge } from "@/components/kit/primitives";
import { DepartmentTeam } from "@/components/departments/department-team";
import { DepartmentStats, SalesByDish } from "@/components/restaurant/department-figures";
import { MoneyBars } from "@/components/charts/money-bars";
import { Button } from "@/components/ui/button";
import { Boxes, CheckCircle2, Circle, FileText, ShoppingCart, Wallet } from "lucide-react";

/**
 * Home of a restaurant department: today's figures live, the last 7 days, what remains to do
 * (head) or the department heads (Boss), sales by dish.
 */
export async function RestaurantHome({ page }) {
  const { user, department, domain, perms, renderedAt } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const weekFrom = addDaysToKey(todayKey, -6);
  const week = rangeBounds(weekFrom, todayKey, timeZone);
  const [r, weekTx, pendingReturned, cashRequests] = await Promise.all([
    buildDailyReport({ organizationId: user.organizationId, departmentId: department.id, dateKey: todayKey, timeZone }),
    db.transaction.findMany({ where: { departmentId: department.id, date: { gte: week.start, lte: week.end } }, select: { type: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, status: true, date: true, category: true, operationCategory: true } }),
    db.dailyReport.findMany({ where: { departmentId: department.id, status: { in: ["RETURNED", "DRAFT"] }, reportDate: { lt: rangeBounds(todayKey, todayKey, timeZone).start } }, select: { reportDate: true, status: true, reviewNotes: true }, orderBy: { reportDate: "desc" }, take: 5 }),
    perms.handover ? listCashRequests({ organizationId: user.organizationId, departmentIds: [department.id], statuses: ["OPEN"], take: 5, timeZone }) : [],
  ]);
  const team = perms.boss ? await departmentTeam(department.id) : [];
  const series = listDateKeys(weekFrom, todayKey).map((k) => {
    const m = summarizeMoney(weekTx.filter((t) => toDateKey(t.date, timeZone) === k));
    return { dateKey: k, moneyIn: m.moneyIn, moneyOut: m.moneyOut, result: m.result };
  });
  const base = `/d/${department.id}`;
  // What the figure cards need (the page adds this computer's unsent records on top).
  const figures = serialize({ money: r.money, stock: { rows: r.stock.rows, totals: r.stock.totals }, cash: r.cash, debts: r.debts, sales: r.sales, status: r.status, locked: r.locked });
  const out = r.stock.rows.filter((x) => x.isActive && x.closing <= 0);
  const todo = [
    perms.manageStock ? { done: r.stock.rows.length > 0, text: r.stock.rows.length ? `${r.stock.totals.dishes} dishes on the menu` : "Add your dishes and their plates", href: `${base}/menu-stock` } : null,
    ...cashRequests.map((q) => ({ done: false, text: `The Boss asks for the cash of ${q.period}: ${formatMoney(q.figures.outstanding)} to hand over`, href: `${base}/cash-handover` })),
    out.length ? { done: false, text: `${out.length} dish(es) out of stock: ${out.map((x) => x.name).join(", ")}`, href: `${base}/menu-stock` } : null,
    ...pendingReturned.map((p) => ({ done: false, text: p.status === "RETURNED" ? `Report of ${formatDateKey(toDateKey(p.reportDate, timeZone))} returned by the Boss: ${p.reviewNotes}` : `Report of ${formatDateKey(toDateKey(p.reportDate, timeZone))} not sent`, href: `${base}/report?date=${toDateKey(p.reportDate, timeZone)}` })),
    perms.reportSubmit ? { done: r.cash.counted !== null, text: r.cash.counted !== null ? "Cash counted" : "Count the cash at the end of the day", href: `${base}/report` } : null,
    perms.reportSubmit ? { done: r.locked, text: r.locked ? "Today's report sent to the Boss" : "Send today's report to the Boss", href: `${base}/report` } : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={domain.label}
        title={department.name}
        description={`${formatDateKey(todayKey)} · everything recorded today, live.`}
        actions={
          <>
            {perms.sell ? <Link href={`${base}/sell`}><Button><ShoppingCart className="h-4 w-4" /> Sell</Button></Link> : null}
            {perms.manageStock ? <Link href={`${base}/menu-stock`}><Button variant="outline"><Boxes className="h-4 w-4" /> Menu & Stock</Button></Link> : null}
            {perms.reportRead ? <Link href={`${base}/report`}><Button variant="outline"><FileText className="h-4 w-4" /> Today's report</Button></Link> : null}
            {perms.boss ? <Link href={`/boss/daily-reports?dept=${department.id}`}><Button variant="outline">All daily reports</Button></Link> : null}
          </>
        }
      />
      <DepartmentStats
        departmentId={department.id}
        renderedAt={renderedAt}
        dateKey={todayKey}
        figures={figures}
        links={{ money: perms.reportRead ? `${base}/money` : undefined, stock: `${base}/menu-stock`, cash: perms.handover ? `${base}/cash-handover` : undefined, debts: `${base}/debts` }}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Last 7 days" description="Money in and money out per day" className="xl:col-span-2">
          <MoneyBars data={serialize(series)} />
        </Section>
{perms.boss ? (
          <DepartmentTeam departmentId={department.id} team={team} description={<>Today's report: <StatusBadge status={r.status} /></>} />
        ) : (
          <Section title="To do" description={<>Today's report: <StatusBadge status={r.status} /></>}>
          <ul className="space-y-2">
            {todo.map((t) => (
              <li key={t.text}>
                <Link href={t.href} className="flex items-start gap-2 rounded-md p-1 text-sm hover:bg-slate-50">
                  {t.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                  <span className={t.done ? "text-slate-500" : "text-slate-800"}>{t.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
        )}
      </div>
      <Section title="Sales today by dish" actions={perms.sell ? <Link className="text-sm font-medium underline" href={`${base}/sell`}>Open Sell</Link> : null}>
        <SalesByDish departmentId={department.id} renderedAt={renderedAt} dateKey={todayKey} figures={figures} />
      </Section>
      <p className="flex items-center gap-1 text-xs text-slate-400"><Wallet className="h-3.5 w-3.5" /> Figures update after every record.</p>
    </div>
  );
}
