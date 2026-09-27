import Link from "next/link";
import { BellRing } from "lucide-react";
import { db } from "@/lib/prisma";
import { requirePageUser, pageDate } from "@/lib/page-guards";
import { accessibleDepartments } from "@/lib/access";
import { getDomain } from "@/lib/domains/registry";
import { summarizeMoney } from "@/lib/finance/money-math";
import { dayStatus } from "@/lib/restaurant/day-status";
import { rangeBounds, formatDateKey } from "@/lib/timezone";
import { Money, PageHeader, Pill, StatusBadge } from "@/components/kit/primitives";

export const dynamic = "force-dynamic";
export const metadata = { title: "My departments" };

/** A department head's departments at a glance: today's figures, the report and the Boss's requests. */
export default async function MyDepartments() {
  const user = await requirePageUser();
  const { todayKey, timeZone } = pageDate(user, null);
  const departments = await accessibleDepartments(user);
  const ids = departments.map((d) => d.id);
  const { start, end } = rangeBounds(todayKey, todayKey, timeZone);
  const [tx, requests, statuses] = await Promise.all([
    db.transaction.findMany({ where: { departmentId: { in: ids }, date: { gte: start, lte: end } }, select: { departmentId: true, type: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, status: true, category: true, operationCategory: true } }),
    db.cashRequest.findMany({ where: { departmentId: { in: ids }, status: "OPEN" }, select: { departmentId: true } }),
    Promise.all(departments.map(async (d) => [d.id, getDomain(d.domain).enabled ? await dayStatus(d.id, todayKey, timeZone) : null])),
  ]);
  const statusOf = new Map(statuses);
  return (
    <div>
      <PageHeader
        title={user.role === "ADMIN" ? "Departments" : departments.length > 1 ? `Your ${departments.length} departments` : "Your department"}
        description={`${formatDateKey(todayKey)}. ${user.role === "ADMIN" ? "Open a department to look into it." : "You are the head of each of these departments. Open one to work in it; switch at any time from the top of the menu."}`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="my-departments">
        {departments.map((d) => {
          const domain = getDomain(d.domain);
          const m = summarizeMoney(tx.filter((t) => t.departmentId === d.id));
          const st = statusOf.get(d.id);
          const asked = requests.filter((r) => r.departmentId === d.id).length;
          return (
            <Link key={d.id} href={`/d/${d.id}`} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <Pill tone={domain.color}>{domain.label}</Pill>
                {!domain.enabled ? <StatusBadge status="COMING_SOON" /> : st ? <StatusBadge status={st.status || "DRAFT"} /> : null}
              </div>
              <div className="mt-3 text-lg font-semibold text-slate-900">{d.name}</div>
              {user.role !== "ADMIN" ? <div className="mt-0.5 text-xs font-medium text-emerald-700">Department head</div> : null}
              {domain.enabled ? (
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-emerald-50 px-3 py-2"><div className="text-[11px] text-emerald-800">Money in today</div><Money value={m.moneyIn} className="font-semibold" /></div>
                  <div className="rounded-lg bg-slate-900 px-3 py-2 text-white"><div className="text-[11px] text-slate-300">Result today</div><Money value={m.result} className="font-semibold" /></div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">This department type is coming soon.</p>
              )}
              {asked ? (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900">
                  <BellRing className="h-3.5 w-3.5" /> The Boss asks for cash
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
