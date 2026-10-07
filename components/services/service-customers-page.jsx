import Link from "next/link";
import { pageDate } from "@/lib/page-guards";
import { serviceCustomers } from "@/lib/services/queries";
import { serviceSettings } from "@/lib/services/settings";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { DataTable, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";

/** Pressing, car wash, jobs: customers (and vehicles) from their tickets: visits, spent, owing, loyalty. */
export async function ServiceCustomersPage({ page, searchParams: sp }) {
  const { user, department, domain } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const rows = await serviceCustomers({ department, q: sp?.q, timeZone, todayKey });
  const settings = serviceSettings(department);
  const carWash = department.domain === "CAR_WASH";
  const base = `/d/${department.id}/tickets`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title={carWash ? "Customers & vehicles" : "Customers"} description={`Built from the ${domain.words.tickets.toLowerCase()}: how often each customer${carWash ? " or vehicle" : ""} comes, what they spent and what they still owe.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={carWash ? "Customers / vehicles" : "Customers"} value={rows.length} />
        <StatCard label="Spent with us" value={formatMoney(rows.reduce((s, c) => s + c.spent, 0))} />
        <StatCard tone={rows.some((c) => c.owing) ? "warn" : "default"} label="Owed by customers" value={formatMoney(rows.reduce((s, c) => s + c.owing, 0))} hint={`${rows.filter((c) => c.owing).length} customer(s)`} href={`${base}?view=owing`} />
      </div>
      <FilterBar fields={[{ name: "q", label: "Search", type: "search", placeholder: carWash ? "Plate, name, phone…" : "Name, phone…" }]} />
      <Section bodyClassName="p-0">
        <DataTable
          rows={rows}
          rowKey={(c) => c.key}
          empty="No customer yet: they appear with their first ticket."
          columns={[
            { key: "n", label: "Customer", render: (c) => <Link className="font-medium hover:underline" href={`${base}?q=${encodeURIComponent(c.plates[0] || c.phone || c.name || "")}`}>{c.name || c.plates[0] || "—"}</Link> },
            { key: "p", label: "Phone", render: (c) => c.phone || "—" },
            ...(carWash ? [{ key: "v", label: "Vehicles", render: (c) => c.plates.join(", ") || "—" }] : []),
            { key: "t", label: "Visits", align: "right", render: (c) => c.visits },
            { key: "s", label: "Spent", align: "right", render: (c) => <Money value={c.spent} suffix={false} /> },
            { key: "o", label: "Owes", align: "right", render: (c) => (c.owing ? <strong className="text-rose-700"><Money value={c.owing} suffix={false} /></strong> : "—") },
            ...(settings.loyaltyEvery > 1 ? [{ key: "l", label: "Next free in", align: "right", render: (c) => `${c.nextFree} visit(s)` }] : []),
            { key: "d", label: "Last visit", render: (c) => (c.lastKey ? formatDateKey(c.lastKey, { weekday: false }) : "—") },
          ]}
        />
      </Section>
    </div>
  );
}
