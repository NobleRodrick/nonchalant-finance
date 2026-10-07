import Link from "next/link";
import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { membershipList, planList } from "@/lib/salon/queries";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { MembershipsBoard } from "@/components/salon/memberships-board";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Memberships" };

const VIEWS = [["", "Active"], ["renew", "To renew"], ["ended", "Ended"], ["all", "All"]];

/** Salon / gym: membership plans, members, check-ins, renewals. */
export default async function MembershipsPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "memberships" });
  const { todayKey, timeZone } = pageDate(user, null);
  const [plans, memberships, debtors] = await Promise.all([
    planList({ departmentId: department.id }),
    membershipList({ departmentId: department.id, todayKey, timeZone, q: sp.q }),
    db.debtor.findMany({ where: { departmentId: department.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
  ]);
  const active = memberships.filter((m) => m.state.status === "ACTIVE");
  const base = `/d/${department.id}/memberships`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Memberships" description="Monthly memberships and session packs: sold (paid or on credit), checked in at each visit, reminded before they end, renewed." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" label="Active members" value={active.length} />
        <StatCard tone={memberships.some((m) => m.renew) ? "warn" : "default"} label="To renew soon" value={memberships.filter((m) => m.renew).length} href={`${base}?view=renew`} />
        <StatCard label="Value of active memberships" value={formatMoney(active.reduce((s, m) => s + m.price, 0))} />
        <StatCard tone={memberships.some((m) => m.onCredit && m.state.status !== "CANCELLED") ? "warn" : "default"} label="Sold on credit" value={memberships.filter((m) => m.onCredit && m.state.status !== "CANCELLED").length} href={`/d/${department.id}/money`} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <nav className="flex flex-wrap gap-1" aria-label="Views">{VIEWS.map(([k, l]) => <Link key={k || "active"} href={k ? `${base}?view=${k}` : base} className={cn("rounded-full border px-3 py-1 text-sm", (sp.view || "") === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white")}>{l}</Link>)}</nav>
        <FilterBar fields={[{ name: "q", label: "Search", type: "search", placeholder: "Name, phone, MB-…" }]} />
      </div>
      <MembershipsBoard departmentId={department.id} business={department.name} plans={plans} memberships={serialize(memberships)} debtors={debtors} todayKey={todayKey} perms={perms} view={sp.q ? "all" : sp.view || ""} />
    </div>
  );
}
