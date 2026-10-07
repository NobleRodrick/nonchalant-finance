import { departmentPage, pageDate } from "@/lib/page-guards";
import { farmBoard } from "@/lib/farm/queries";
import { formatMoney } from "@/lib/format";
import { EmptyState, PageHeader, StatCard } from "@/components/kit/primitives";
import { BatchCard } from "@/components/farm/batch-card";
import { NewBatchButton } from "@/components/farm/batch-dialogs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Batches & fields" };

/** Farm: every batch (bands, fields, ponds) with what is alive, its cost, sales and profit. */
export default async function BatchesPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "batches" });
  const { todayKey, timeZone } = pageDate(user, null);
  const board = await farmBoard({ departmentId: department.id, todayKey, timeZone, status: sp.show === "closed" ? "CLOSED" : sp.show === "all" ? undefined : "ACTIVE" });
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Batches & fields" description="Each band of animals, field or pond is followed from start to sale: what is alive, the feed and care it used, what it produced, what it sold for, and its profit." actions={perms.manageStock ? <NewBatchButton departmentId={department.id} todayKey={todayKey} /> : null}>
        <nav className="mt-3 flex gap-1 text-sm" aria-label="Show">{[["", "Active"], ["closed", "Closed"], ["all", "All"]].map(([k, l]) => <a key={k || "active"} href={`${base}/batches${k ? `?show=${k}` : ""}`} className={`rounded-full border px-3 py-1 ${(sp.show || "") === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>{l}</a>)}</nav>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" label="Active batches" value={board.totals.active} />
        <StatCard label="Animals and fish alive" value={board.totals.animals} />
        <StatCard tone={board.totals.deathsToday ? "warn" : "default"} label="Deaths today" value={board.totals.deathsToday} />
        <StatCard label="Cost of active batches" value={formatMoney(board.totals.cost)} hint={`sales ${formatMoney(board.totals.sales)}`} />
      </div>
      {board.batches.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{board.batches.map((b) => <BatchCard key={b.id} base={base} b={b} />)}</div> : <EmptyState title="No batch here" description="Start a batch for each band of chickens or pigs, each field and season, each fish pond." />}
    </div>
  );
}
