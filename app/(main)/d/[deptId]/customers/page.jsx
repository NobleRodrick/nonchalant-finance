import Link from "next/link";
import { UserPlus } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { customerList } from "@/lib/rental/order-queries";
import { serialize } from "@/lib/serialize";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { DataTable, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { CustomerButton } from "@/components/rental/customers/customer-dialog";
import { CustomerExport } from "@/components/rental/customers/customer-export";
import { ServiceCustomersPage } from "@/components/services/service-customers-page";
import { SERVICE_DOMAINS } from "@/lib/domains/trade";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

/** Event rental: every customer with their bookings, what they spent and what they still owe. */
export default async function CustomersPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const page = await departmentPage(deptId, { module: "customers" });
  if (SERVICE_DOMAINS.includes(page.department.domain)) return <ServiceCustomersPage page={page} searchParams={sp} />;
  const { user, department, domain, perms } = page;
  const { todayKey } = pageDate(user, null);
  const rows = await customerList({ departmentId: department.id, q: sp.q, todayKey });
  const owing = rows.filter((c) => c.balance > 0);
  const base = `/d/${department.id}/customers`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Customers" description="Every customer with their bookings, total spent and balance owed. Open one for their history." actions={perms.rentalBook ? <CustomerButton departmentId={department.id} variant="default" size="default"><UserPlus className="h-4 w-4" /> New customer</CustomerButton> : null} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Customers" value={rows.length} />
        <StatCard label="Spent with us" value={formatMoney(rows.reduce((s, c) => s + c.spent, 0))} />
        <StatCard label="Owed by customers" value={formatMoney(owing.reduce((s, c) => s + c.balance, 0))} hint={`${owing.length} customer(s)`} tone={owing.length ? "warn" : "default"} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <FilterBar fields={[{ name: "q", label: "Search", type: "search", placeholder: "Name, phone, e-mail, company…" }]} className="flex-1" />
        {perms.export ? <CustomerExport rows={serialize(rows)} todayKey={todayKey} /> : null}
      </div>
      <Section bodyClassName="p-0">
        <DataTable
          rows={rows}
          empty="No customer yet: they are added with their first booking."
          columns={[
            { key: "name", label: "Customer", render: (c) => <Link href={`${base}/${c.id}`} className="font-medium underline">{c.name}</Link> },
            { key: "phone", label: "Phone", render: (c) => c.phone || "—" },
            { key: "bookings", label: "Bookings", align: "right", render: (c) => c.bookings },
            { key: "spent", label: "Spent", align: "right", render: (c) => <Money value={c.spent} suffix={false} /> },
            { key: "balance", label: "Owes", align: "right", render: (c) => (c.balance ? <span className={c.overdue ? "font-semibold text-rose-700" : ""}><Money value={c.balance} suffix={false} />{c.overdue ? " · overdue" : ""}</span> : "—") },
            { key: "last", label: "Last event", render: (c) => (c.lastEventKey ? formatDateKey(c.lastEventKey, { weekday: false }) : "—") },
          ]}
        />
      </Section>
    </div>
  );
}
