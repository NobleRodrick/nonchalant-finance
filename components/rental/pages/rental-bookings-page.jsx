import Link from "next/link";
import { Plus } from "lucide-react";
import { pageDate } from "@/lib/page-guards";
import { listOrders, listTotals } from "@/lib/rental/order-queries";
import { departmentTeam } from "@/lib/departments/team";
import { RENTAL_EVENT_TYPES } from "@/lib/domains/rental";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { OrdersTable } from "@/components/rental/bookings/orders-table";

const TABS = [
  { key: "open", label: "In progress" },
  { key: "INQUIRY", label: "Inquiries" },
  { key: "QUOTED", label: "Quotations" },
  { key: "holding", label: "Confirmed" },
  { key: "DISPATCHED", label: "Out now" },
  { key: "RETURNED", label: "Returned" },
  { key: "CLOSED", label: "Closed" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "all", label: "All" },
];

/** Event rental: every booking, by stage, searchable and filtered (?status=&q=&from=&to=…). */
export async function RentalBookingsPage({ page, searchParams }) {
  const { user, department, domain, perms } = page;
  const sp = searchParams || {};
  const { todayKey } = pageDate(user, null);
  const tab = TABS.some((t) => t.key === sp.status) ? sp.status : "open";
  const [orders, team] = await Promise.all([
    listOrders({ departmentId: department.id, todayKey, status: tab, q: sp.q, fromKey: sp.from || undefined, toKey: sp.to || undefined, eventType: sp.type || undefined, payment: sp.payment || undefined, handledById: sp.by || undefined }),
    departmentTeam(department.id),
  ]);
  const t = listTotals(orders);
  const base = `/d/${department.id}/bookings`;
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "status" && v));
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${domain.label} · ${department.name}`}
        title="Bookings"
        description="Every event: customer, items, days out, stage, money and balance."
        actions={perms.rentalBook ? <Link href={`${base}/new`}><Button><Plus className="h-4 w-4" /> New booking</Button></Link> : null}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bookings shown" value={t.count} />
        <StatCard label="Amount booked" value={formatMoney(t.amount)} />
        <StatCard label="Paid" value={formatMoney(t.paid)} tone="in" />
        <StatCard label="Balance owed" value={formatMoney(t.balance)} hint={t.overdueCount ? `${t.overdueCount} overdue: ${formatMoney(t.overdue)}` : "none overdue"} tone={t.overdueCount ? "out" : "default"} />
      </div>
      <nav className="flex flex-wrap gap-1 print:hidden" aria-label="Booking stage">
        {TABS.map((x) => {
          const q = new URLSearchParams(keep);
          q.set("status", x.key);
          return <Link key={x.key} href={`${base}?${q}`} aria-current={x.key === tab ? "page" : undefined} className={cn("rounded-full px-3 py-1 text-sm font-medium", x.key === tab ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>{x.label}</Link>;
        })}
      </nav>
      <FilterBar
        fields={[
          { name: "q", label: "Search", type: "search", placeholder: "Customer, phone, booking no., place…" },
          { name: "from", label: "Event from", type: "date" },
          { name: "to", label: "Event to", type: "date" },
          { name: "type", label: "Event type", type: "select", options: [{ value: "", label: "All events" }, ...RENTAL_EVENT_TYPES.map((x) => ({ value: x, label: x }))] },
          { name: "payment", label: "Payment", type: "select", options: [{ value: "", label: "Any" }, { value: "unpaid", label: "Unpaid" }, { value: "partly", label: "Deposit / partly paid" }, { value: "paid", label: "Paid in full" }, { value: "overdue", label: "Overdue" }] },
          { name: "by", label: "Responsible", type: "select", options: [{ value: "", label: "Anyone" }, ...team.map((p) => ({ value: p.id, label: p.name }))] },
        ]}
      />
      <Section bodyClassName="p-0 sm:p-2">
        <OrdersTable departmentId={department.id} orders={serialize(orders)} canExport={perms.export} exportName={`bookings-${tab}-${todayKey}`} />
      </Section>
    </div>
  );
}
