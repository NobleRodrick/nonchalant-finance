import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { customerDetail } from "@/lib/rental/order-queries";
import { orgTimezone } from "@/lib/access";
import { serialize } from "@/lib/serialize";
import { formatDateKey, toDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DataTable, KeyValues, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { OrdersTable } from "@/components/rental/bookings/orders-table";
import { CustomerButton } from "@/components/rental/customers/customer-dialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer" };

const METHOD = { CASH: "Cash", MOMO: "Mobile Money", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

/** One customer: details, every booking, what they spent and owe, every payment. */
export default async function CustomerPage({ params }) {
  const { deptId, clientId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "customers" });
  const { todayKey } = pageDate(user, null);
  const data = await customerDetail({ departmentId: department.id, clientId, todayKey });
  if (!data) notFound();
  const { client: c, orders, payments, totals, eventTypes } = data;
  const tz = orgTimezone(user);
  return (
    <div className="space-y-5">
      <Link href={`/d/${department.id}/customers`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline print:hidden"><ArrowLeft className="h-4 w-4" /> Customers</Link>
      <PageHeader
        eyebrow={`${domain.label} · ${department.name}`}
        title={c.name}
        description={[c.company, c.phone, c.email].filter(Boolean).join(" · ")}
        actions={perms.rentalBook ? (
          <>
            <CustomerButton departmentId={department.id} customer={serialize(c)}><Pencil className="h-4 w-4" /> Edit</CustomerButton>
            <Link href={`/d/${department.id}/bookings/new`}><Button size="sm"><Plus className="h-4 w-4" /> New booking</Button></Link>
          </>
        ) : null}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bookings" value={totals.count} hint={eventTypes.join(", ") || "—"} />
        <StatCard label="Spent" value={formatMoney(totals.amount)} />
        <StatCard label="Paid" value={formatMoney(totals.paid)} tone="in" />
        <StatCard label="Owes" value={formatMoney(totals.balance)} hint={totals.overdueCount ? `${formatMoney(totals.overdue)} overdue` : undefined} tone={totals.overdueCount ? "out" : totals.balance ? "warn" : "default"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Details">
          <KeyValues rows={[
            { label: "Phone", value: c.phone || "—" },
            { label: "Other phone", value: c.phoneAlt || "—" },
            { label: "E-mail", value: c.email || "—" },
            { label: "Address", value: c.address || "—" },
            { label: "Customer since", value: formatDateKey(toDateKey(c.createdAt, tz), { weekday: false }) },
          ]} />
          {c.notes ? <p className="mt-3 text-sm text-slate-600">{c.notes}</p> : null}
        </Section>
        <Section title="Bookings and events" className="lg:col-span-2" bodyClassName="p-0 sm:p-2">
          <OrdersTable departmentId={department.id} orders={serialize(orders)} canExport={perms.export} exportName={`bookings-${c.name}`} empty="No booking yet." />
        </Section>
      </div>
      <Section title="Payments" bodyClassName="p-0">
        <DataTable
          rows={payments}
          empty="No payment yet."
          columns={[
            { key: "d", label: "Date", render: (t) => formatDateKey(toDateKey(t.date, tz), { weekday: false }) },
            { key: "r", label: "Receipt", render: (t) => <span className="font-mono text-xs">{t.referenceNo}</span> },
            { key: "b", label: "Booking", render: (t) => (t.rentalOrder ? <Link className="underline" href={`/d/${department.id}/bookings/${t.rentalOrder.id}`}>{t.rentalOrder.referenceNo}</Link> : "—") },
            { key: "m", label: "Method", render: (t) => METHOD[t.paymentMethod] || t.paymentMethod },
            { key: "a", label: "Amount", align: "right", render: (t) => <Money value={t.type === "BOOKING_REFUND" ? -Number(t.amount) : Number(t.amount)} suffix={false} className={t.status === "VOIDED" ? "line-through text-slate-400" : ""} /> },
            { key: "u", label: "Received by", render: (t) => t.receivedByName || t.user?.name },
          ]}
        />
      </Section>
    </div>
  );
}
