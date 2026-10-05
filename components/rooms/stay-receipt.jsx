import { formatMoney } from "@/lib/format";
import { formatDateKey } from "@/lib/timezone";
import { BOOKING_TYPE_LABELS } from "@/lib/rooms/stay-math";
import { DocumentHead as Head, DocumentRow as Row, METHOD } from "@/components/departments/document-parts";

/**
 * The receipt of a payment (or refund) of a stay: guest, apartment, nights, price, this payment,
 * paid so far and the balance after it; who received it, how, reference and remarks.
 */
export function StayReceipt({ organization, department, stay, receipt }) {
  const t = receipt.transaction;
  const f = receipt.figures;
  const when = new Date(t.date).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <article className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-sm shadow-xs print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none" data-testid="receipt">
      <Head organization={organization} department={department} title={receipt.isRefund ? "Refund" : "Receipt"} number={t.referenceNo} when={when} />
      {receipt.voided ? <p className="mt-3 rounded-md bg-rose-50 p-2 text-center font-semibold text-rose-800">VOID — {t.voidReason}</p> : null}
      <section className="mt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Guest</h2>
        <p className="mt-1 font-semibold text-slate-900">{stay.guestName}</p>
        {stay.guestPhone || stay.guestEmail ? <p className="text-slate-600">{[stay.guestPhone, stay.guestEmail].filter(Boolean).join(" · ")}</p> : null}
      </section>
      <section className="mt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Stay</h2>
        <dl className="mt-1">
          <Row label="Booking" value={stay.referenceNo} />
          <Row label="Apartment" value={stay.room.name} />
          <Row label="Arrival → departure" value={`${formatDateKey(stay.checkInKey)} → ${formatDateKey(stay.checkOutKey)}`} />
          <Row label="Nights" value={`${stay.nights} · ${BOOKING_TYPE_LABELS[stay.bookingType] || stay.bookingType}`} />
        </dl>
      </section>
      <section className="mt-4 rounded-lg bg-slate-50 p-3">
        <dl>
          <Row label="Price of the stay" value={formatMoney(f.total)} />
          <Row label={receipt.isRefund ? "Amount given back" : "Amount paid now"} value={formatMoney(t.amount)} strong />
          <Row label="Paid so far (this included)" value={formatMoney(f.paid)} />
          <Row label="Outstanding balance" value={formatMoney(Math.max(0, f.balance))} strong />
          {f.balance < 0 ? <Row label="Paid too much" value={formatMoney(-f.balance)} /> : null}
        </dl>
      </section>
      <section className="mt-4">
        <dl>
          <Row label="Date and time" value={when} />
          <Row label={receipt.isRefund ? "Given back by" : "Received by"} value={t.receivedByName || t.user?.name || "—"} />
          <Row label="Payment method" value={METHOD[t.paymentMethod] || t.paymentMethod} />
          {t.reference ? <Row label="Transaction reference" value={t.reference} /> : null}
          {t.description ? <Row label="Remarks" value={t.description} /> : null}
        </dl>
      </section>
      <footer className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <div>Guest&apos;s signature<div className="mt-8 border-b border-slate-300" /></div>
        <div>{receipt.isRefund ? "Given back by" : "Received by"}<div className="mt-8 border-b border-slate-300" /></div>
      </footer>
    </article>
  );
}
