import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, Zap } from "lucide-react";
import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { statusLabels, ticketDetail } from "@/lib/services/queries";
import { STATUS_TONES } from "@/lib/services/ticket-math";
import { METHOD_WORDS } from "@/lib/trade/documents";
import { serialize } from "@/lib/serialize";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DataTable, KeyValues, Money, PageHeader, Pill, Section, StatCard } from "@/components/kit/primitives";
import { TicketActions } from "@/components/services/ticket-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ticket" };

/** One ticket: items, status and times, money (paid, balance), payments, and every action. */
export default async function TicketPage({ params }) {
  const { deptId, ticketId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "tickets" });
  const { todayKey, timeZone } = pageDate(user, null);
  const d = await ticketDetail({ department, ticketId, timeZone, todayKey });
  if (!d) notFound();
  const t = d.ticket;
  const workers = domain.workers ? await db.serviceWorker.findMany({ where: { departmentId: department.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const labels = statusLabels(department.domain);
  const base = `/d/${department.id}/tickets`;
  const day = (k) => (k ? formatDateKey(k, { weekday: false }) : "—");
  return (
    <div className="space-y-5">
      <Link href={base} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft className="h-4 w-4" /> {domain.words.tickets}</Link>
      <PageHeader
        eyebrow={`${domain.words.ticket} · ${department.name}`}
        title={`${t.referenceNo} · ${[t.plate, t.customer].filter(Boolean).join(" · ") || "Walk-in"}`}
        description={`Received ${day(t.receivedKey)} ${t.receivedTime} by ${t.createdBy}${t.promisedLabel ? ` · ready by ${t.promisedLabel}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/${t.id}/documents/slip`}><Button variant="outline"><Printer className="h-4 w-4" /> {department.domain === "CAR_WASH" ? "Ticket" : "Drop-off slip"}</Button></Link>
            {t.status === "COLLECTED" ? <Link href={`${base}/${t.id}/documents/invoice`}><Button variant="outline"><Printer className="h-4 w-4" /> Invoice / receipt</Button></Link> : null}
          </div>
        }
      >
        <div className="mt-2 flex flex-wrap gap-1"><Pill tone={STATUS_TONES[t.status]}>{labels[t.status]}</Pill>{t.express ? <Pill tone="amber"><Zap className="h-3 w-3" /> express +{t.surchargePct} %</Pill> : null}{t.late ? <Pill tone="rose">late</Pill> : null}{t.unclaimed ? <Pill tone="orange">unclaimed</Pill> : null}{t.notified ? <Pill tone="emerald">customer told</Pill> : null}</div>
      </PageHeader>
      <TicketActions departmentId={department.id} domain={department.domain} ticket={serialize(t)} workers={workers} business={department.name} perms={perms} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total" value={formatMoney(t.total)} hint={t.discount ? `discount ${formatMoney(t.discount)}${t.discountReason ? ` (${t.discountReason})` : ""}` : undefined} />
        <StatCard tone="in" label="Paid" value={formatMoney(t.paid)} />
        <StatCard tone={t.balance > 0 && t.status !== "CANCELLED" ? "out" : "default"} label={t.balance < 0 ? "Paid too much" : "To pay"} value={formatMoney(t.status === "CANCELLED" ? 0 : Math.abs(t.balance))} />
        <StatCard label={t.status === "CANCELLED" ? "Kept" : "Status"} value={t.status === "CANCELLED" ? formatMoney(t.kept) : labels[t.status]} hint={t.status === "CANCELLED" ? t.cancelReason : t.collectedKey ? `collected ${day(t.collectedKey)} ${t.collectedTime}` : t.readyKey ? `ready ${day(t.readyKey)} ${t.readyTime}` : undefined} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Section title={domain.words.items} bodyClassName="p-0">
          <DataTable
            rows={t.lines}
            footer={<tr className="font-semibold"><td colSpan={4} className="px-4 py-2 text-right">{t.surchargePct ? `Express +${t.surchargePct} % · ` : ""}{t.discount ? `Discount −${formatMoney(t.discount)} · ` : ""}Total</td><td className="px-4 py-2 text-right tabular-nums">{formatMoney(t.total)}</td><td /></tr>}
            columns={[
              { key: "l", label: "Item / service", render: (l) => <span>{l.label}{l.notes ? <span className="block text-xs text-slate-500">{l.notes}</span> : null}</span> },
              { key: "v", label: domain.variantsLabel || "Option", render: (l) => l.variant || "—" },
              { key: "q", label: "Qty", align: "right", render: (l) => l.quantity },
              { key: "p", label: "Price", align: "right", render: (l) => <Money value={l.unitPrice} suffix={false} /> },
              { key: "t", label: "Total", align: "right", render: (l) => <Money value={l.total} suffix={false} /> },
              { key: "w", label: domain.workers ? "Washer" : "", render: (l) => (l.worker ? <span className="text-xs">{l.worker}{l.commission ? ` · ${formatMoney(l.commission)}` : ""}</span> : null) },
            ]}
          />
        </Section>
        <Section title="Details">
          <KeyValues rows={[t.plate && { label: "Plate", value: t.plate }, t.vehicleType && { label: domain.variantsLabel, value: t.vehicleType }, { label: "Customer", value: t.customer || "—" }, { label: "Phone", value: t.phone || "—" }, t.tagNo && { label: "Tag numbers", value: t.tagNo }, { label: "Ready by", value: t.promisedLabel || "—" }, t.notes && { label: "Notes", value: t.notes }].filter(Boolean)} />
        </Section>
      </div>
      <Section title="Money" description="Payments are kept as the customer's advance until the ticket is collected." bodyClassName="p-0">
        <DataTable
          dense
          rows={d.records}
          empty="Nothing paid yet."
          rowClassName={(r) => (r.voided ? "opacity-50 line-through" : "")}
          columns={[
            { key: "r", label: "Reference", render: (r) => <span className="font-mono text-xs">{r.referenceNo}</span> },
            { key: "d", label: "Date", render: (r) => `${day(r.dateKey)} ${r.time}` },
            { key: "k", label: "What", render: (r) => (r.type === "BOOKING_PAYMENT" ? "Payment" : r.type === "BOOKING_REFUND" ? "Refund" : "Compensation") },
            { key: "m", label: "How", render: (r) => <span className="text-xs">{METHOD_WORDS[r.method] || r.method}{r.reference ? ` · ${r.reference}` : ""}</span> },
            { key: "a", label: "Amount", align: "right", render: (r) => <Money value={r.type === "BOOKING_PAYMENT" ? r.amount : -r.amount} suffix={false} /> },
            { key: "b", label: "By", render: (r) => <span className="text-xs">{r.by}</span> },
            { key: "x", label: "", render: (r) => (r.type === "BOOKING_PAYMENT" && !r.voided ? <Link className="text-xs underline" href={`${base}/${t.id}/documents/receipt?t=${r.id}`}>Receipt</Link> : r.voided ? <span className="text-xs">{r.voidReason}</span> : null) },
          ]}
        />
      </Section>
    </div>
  );
}
