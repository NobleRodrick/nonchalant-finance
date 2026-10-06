import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { pageDate } from "@/lib/page-guards";
import { orderDetail } from "@/lib/rental/order-queries";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { formatDateKey, formatTimeInZone, toDateKey } from "@/lib/timezone";
import { orgTimezone } from "@/lib/access";
import { DataTable, KeyValues, Money, PageHeader, Section } from "@/components/kit/primitives";
import { OrderActions } from "@/components/rental/bookings/order-actions";
import { CheckButtons } from "@/components/rental/bookings/checks";
import { PaymentButtons, PaymentsTable } from "@/components/rental/bookings/payments";
import { DocumentLinks } from "@/components/rental/bookings/document-links";
import { AddChargeButton, ChargeVoidButton, IncidentButtons } from "@/components/rental/incidents/incident-actions";
import { INCIDENT_KIND_LABELS, INCIDENT_STATUS_LABELS } from "@/lib/rental/stock-math";
import { CHARGE_KINDS } from "@/lib/rental/booking-math";
import { PaymentBadge, StageBadge } from "@/components/rental/bookings/stage-badge";

const day = (k) => (k ? formatDateKey(k) : "—");

/** Event rental: one booking with everything about it (who, what, when, where, money, history). */
export async function RentalBookingPage({ page, params }) {
  const { user, department, domain, perms } = page;
  const { todayKey } = pageDate(user, null);
  const detail = await orderDetail({ departmentId: department.id, orderId: params.bookingId, todayKey });
  if (!detail) notFound();
  const { order, checks, incidents, charges, transactions } = detail;
  const itemName = Object.fromEntries(order.lines.filter((l) => l.item).map((l) => [l.id, l.label]));
  const f = order.figures;
  const base = `/d/${department.id}`;
  const tz = orgTimezone(user);
  const timeline = [
    ["Created", order.createdAt, order.createdBy?.name],
    ["Quotation sent", order.quotedAt],
    ["Confirmed", order.confirmedAt],
    ["Preparation", order.preparingAt],
    ["Items dispatched", order.dispatchedAt],
    ["Items returned", order.returnedAt],
    ["Closed", order.closedAt],
    ["Cancelled", order.cancelledAt, order.cancelReason],
  ].filter(([, at]) => at);
  return (
    <div className="space-y-5">
      <Link href={`${base}/bookings`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline print:hidden"><ArrowLeft className="h-4 w-4" /> Bookings</Link>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title={`${order.referenceNo} · ${order.eventType}`} description={`${order.client.name} · ${day(order.eventDateKey)}${order.eventLocation ? ` · ${order.eventLocation}` : ""}`} actions={<><CheckButtons departmentId={department.id} order={serialize(order)} canBook={perms.rentalBook} /><OrderActions departmentId={department.id} order={serialize(order)} canBook={perms.rentalBook} /></>}>
        <div className="mt-2 flex flex-wrap items-center gap-2"><StageBadge stage={order.stage} /><PaymentBadge order={order} />{order.lateReturn ? <span className="text-xs font-semibold text-rose-700">Items late: due back {day(order.returnDateKey)}</span> : null}</div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Event">
          <KeyValues rows={[
            { label: "Customer", value: <Link className="underline" href={`${base}/customers/${order.client.id}`}>{order.client.name}</Link> },
            { label: "Phone", value: order.client.phone || "—" },
            { label: "Event", value: order.eventType },
            { label: "Date", value: day(order.eventDateKey) },
            { label: "Location", value: order.eventLocation || "—" },
            { label: "Guests", value: order.guests || "—" },
            { label: "Items leave", value: day(order.dispatchDateKey) },
            { label: "Items come back", value: day(order.returnDateKey) },
          ]} />
        </Section>
        <Section title="Money">
          <KeyValues rows={[
            { label: "Items", value: <Money value={order.itemsTotal} /> },
            { label: "Services", value: <Money value={order.servicesTotal} /> },
            order.discount ? { label: "Discount", value: <Money value={-order.discount} /> } : null,
            f.charges ? { label: "Charges (damages, extras)", value: <Money value={f.charges} /> } : null,
            { label: "Total due", value: <Money value={f.total} />, strong: true },
            { label: "Paid", value: <Money value={f.paid} tone="in" /> },
            { label: "Balance", value: <Money value={f.balance} />, strong: true },
            order.depositDue ? { label: "Deposit asked", value: <Money value={order.depositDue} /> } : null,
            { label: "Pay in full by", value: day(order.paymentDueDateKey || order.eventDateKey) },
          ]} />
          {order.priceNote ? <p className="mt-2 text-xs text-slate-500">Price: {order.priceNote}</p> : null}
        </Section>
        <Section title="People">
          <KeyValues rows={[
            { label: "Responsible", value: order.handledBy?.name || "—" },
            { label: "Booked by", value: order.createdBy?.name },
            { label: "Staff", value: order.staffNames.length ? order.staffNames.join(", ") : "—" },
          ]} />
          {order.specialInstructions ? <div className="mt-3 rounded-md bg-amber-50 p-2 text-sm text-amber-900"><span className="font-semibold">Instructions: </span>{order.specialInstructions}</div> : null}
          {order.notes ? <p className="mt-2 text-xs text-slate-500">{order.notes}</p> : null}
        </Section>
      </div>

      <Section title="Payments" description="Deposit and balance received, refunds; each payment has its receipt." actions={<><DocumentLinks departmentId={department.id} order={serialize(order)} /><PaymentButtons departmentId={department.id} order={serialize(order)} canBook={perms.rentalBook} currentUserName={user.name} /></>} bodyClassName="p-0">
        <PaymentsTable
          departmentId={department.id}
          order={serialize(order)}
          canVoid={perms.void}
          payments={serialize(transactions.filter((t) => ["BOOKING_PAYMENT", "BOOKING_REFUND"].includes(t.type)).map((t) => ({ ...t, amount: Number(t.amount), dateLabel: `${formatDateKey(toDateKey(t.date, tz), { weekday: false })} ${formatTimeInZone(t.date, tz)}` })))}
        />
      </Section>

      <Section title="Items and services" bodyClassName="p-0">
        <DataTable
          rows={order.lines}
          footer={<tr><td className="px-3 py-2" colSpan={6}>Total</td><td className="px-3 py-2 text-right"><Money value={order.itemsTotal + order.servicesTotal} suffix={false} /></td></tr>}
          columns={[
            { key: "label", label: "Item / service", render: (l) => (l.item ? <Link className="underline" href={`${base}/stock/${l.item.id}`}>{l.label}</Link> : <span>{l.label} <span className="text-xs text-slate-400">service</span></span>) },
            { key: "q", label: "Booked", align: "right", render: (l) => l.quantity },
            { key: "issued", label: "Issued", align: "right", render: (l) => (l.kind === "ITEM" ? l.issued : "") },
            { key: "back", label: "Back", align: "right", render: (l) => (l.kind === "ITEM" ? l.returned : "") },
            { key: "diff", label: "Damaged / missing", align: "right", render: (l) => (l.kind === "ITEM" && l.damaged + l.broken + l.missing ? <span className="font-medium text-rose-700">{l.damaged + l.broken} / {l.missing}</span> : "") },
            { key: "price", label: "Price", align: "right", render: (l) => <span><Money value={l.unitPrice} suffix={false} />{l.kind === "ITEM" && l.unitPrice !== l.listPrice ? <span className="block text-[11px] text-slate-400 line-through"><Money value={l.listPrice} suffix={false} /></span> : null}</span> },
            { key: "total", label: "Total", align: "right", render: (l) => <Money value={l.total} suffix={false} /> },
          ]}
        />
      </Section>

      {checks.length ? (
        <Section title="Dispatch and returns" description="Every time items left or came back, who counted them.">
          <ul className="space-y-3 text-sm">
            {checks.map((c) => (
              <li key={c.id} className="rounded-lg border border-slate-200 p-3" data-testid={`check-${c.referenceNo}`}>
                <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{c.kind === "DISPATCH" ? "Left" : "Came back"} · {c.referenceNo}</span><span className="text-slate-500">{formatDateKey(toDateKey(c.date, tz), { weekday: false })} {formatTimeInZone(c.date, tz)} · counted by {c.checkedBy?.name}{c.counterpart ? ` · ${c.kind === "DISPATCH" ? "taken by" : "brought by"} ${c.counterpart}` : ""}</span></div>
                <ul className="mt-1 text-slate-700">
                  {c.lines.map((l) => (
                    <li key={l.id}>{itemName[l.lineId] || "Item"}: {c.kind === "DISPATCH" ? `${l.quantity} out` : [`${l.quantity} back`, l.damaged && `${l.damaged} damaged`, l.broken && `${l.broken} broken`, l.missing && `${l.missing} missing`].filter(Boolean).join(", ")}</li>
                  ))}
                </ul>
                {c.notes ? <p className="mt-1 text-xs text-slate-500">{c.notes}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {incidents.length ? (
        <Section title="Damaged and missing items" description="What did not come back in good condition, and what was decided." bodyClassName="p-0">
          <DataTable
            rows={incidents}
            columns={[
              { key: "ref", label: "No.", render: (i) => <span className="font-mono text-xs">{i.referenceNo}</span> },
              { key: "what", label: "What", render: (i) => <span className="font-medium">{i.quantity} × {i.item.name} {INCIDENT_KIND_LABELS[i.kind].toLowerCase()}</span> },
              { key: "why", label: "What happened", render: (i) => <span className="text-xs text-slate-500">{i.reason || "—"}</span> },
              { key: "loss", label: "Replacement", align: "right", render: (i) => (i.estimatedLoss ? <Money value={i.estimatedLoss} suffix={false} /> : "—") },
              { key: "status", label: "Decision", render: (i) => <span className={i.status === "OPEN" ? "font-semibold text-amber-700" : ""}>{INCIDENT_STATUS_LABELS[i.status]}{i.chargedAmount ? ` · ${formatMoney(i.chargedAmount)}` : ""}{i.stockAction === "REPAIR" ? (i.repairedAt ? " · repaired" : " · in repair") : ""}</span> },
              { key: "act", label: "", align: "right", render: (i) => <IncidentButtons departmentId={department.id} incident={serialize({ ...i, order: { ...i.order, referenceNo: order.referenceNo, client: order.client } })} canBook={perms.rentalBook} /> },
            ]}
          />
        </Section>
      ) : null}

      <Section title="Charges" description="Added to what the customer owes: damages, extra days, transport, labour." actions={perms.rentalBook && !["CANCELLED", "CLOSED"].includes(order.status) ? <AddChargeButton departmentId={department.id} order={serialize(order)} /> : null} bodyClassName="p-0">
        <DataTable
          rows={charges}
          empty="No charge."
          rowClassName={(c) => (c.voidedAt ? "opacity-50 line-through" : "")}
          columns={[
            { key: "ref", label: "No.", render: (c) => <span className="font-mono text-xs">{c.referenceNo}</span> },
            { key: "kind", label: "For", render: (c) => CHARGE_KINDS[c.kind] },
            { key: "label", label: "Description", render: (c) => c.label },
            { key: "amount", label: "Amount", align: "right", render: (c) => <Money value={c.amount} suffix={false} /> },
            { key: "act", label: "", align: "right", render: (c) => (!c.voidedAt && perms.void ? <ChargeVoidButton departmentId={department.id} charge={serialize(c)} /> : c.voidReason ? <span className="text-xs">{c.voidReason}</span> : null) },
          ]}
        />
      </Section>

      <Section title="History">
        <ol className="space-y-1 text-sm">
          {timeline.map(([label, at, note]) => (
            <li key={label} className="flex gap-3"><span className="w-40 shrink-0 text-slate-500">{formatDateKey(toDateKey(at, tz), { weekday: false })} {formatTimeInZone(at, tz)}</span><span className="font-medium">{label}</span>{note ? <span className="text-slate-500">· {note}</span> : null}</li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
