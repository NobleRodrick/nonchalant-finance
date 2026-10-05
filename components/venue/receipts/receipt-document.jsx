import { formatMoney } from "@/lib/format";
import { formatDateKey } from "@/lib/timezone";
import { DocumentHead as Head, DocumentRow as Row, METHOD } from "@/components/departments/document-parts";

/**
 * A payment (or refund) receipt of a booking, made to be printed (A4 or a small receipt printer:
 * it is narrow and plain) or saved as PDF from the browser's print dialog.
 */
export function PaymentReceipt({ organization, department, hall, booking, receipt }) {
  const t = receipt.transaction;
  const f = receipt.figures;
  const pkg = booking.packageSnapshot;
  const when = new Date(t.date).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <article className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-sm shadow-xs print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none" data-testid="receipt">
      <Head organization={organization} department={department} title={receipt.isRefund ? "Refund" : "Receipt"} number={t.referenceNo} when={when} />
      {receipt.voided ? <p className="mt-3 rounded-md bg-rose-50 p-2 text-center font-semibold text-rose-800">VOID — {t.voidReason}</p> : null}
      <section className="mt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Client</h2>
        <p className="mt-1 font-semibold text-slate-900">{booking.client.name}</p>
        {booking.client.phone ? <p className="text-slate-600">{booking.client.phone}</p> : null}
      </section>
      <section className="mt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Event</h2>
        <dl className="mt-1">
          <Row label="Booking" value={booking.referenceNo} />
          <Row label="Hall" value={hall?.name || "—"} />
          <Row label="Event" value={booking.eventType} />
          <Row label="Event date" value={formatDateKey(booking.eventDateKey)} />
          <Row label="Package / services" value={pkg ? `${pkg.name}${pkg.items?.length ? ` (${pkg.items.map((i) => i.label).join(", ")})` : ""}` : "Hall only"} />
        </dl>
      </section>
      <section className="mt-4 rounded-lg bg-slate-50 p-3">
        <dl>
          <Row label="Total booking price" value={formatMoney(f.total)} />
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
        <div>Client&apos;s signature<div className="mt-8 border-b border-slate-300" /></div>
        <div>{receipt.isRefund ? "Given back by" : "Received by"}<div className="mt-8 border-b border-slate-300" /></div>
      </footer>
    </article>
  );
}

/** Everything a client owes and paid for a booking (statement of account). */
export function BookingStatement({ organization, department, hall, booking, todayKey }) {
  const f = booking.figures;
  const money = (booking.transactions || []).filter((t) => (t.type === "BOOKING_PAYMENT" || t.type === "BOOKING_REFUND") && t.status === "COMPLETED");
  const charges = (booking.charges || []).filter((c) => !c.voidedAt);
  const pkg = booking.packageSnapshot;
  return (
    <article className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 text-sm shadow-xs print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none" data-testid="statement-doc">
      <Head organization={organization} department={department} title="Statement" number={booking.referenceNo} when={formatDateKey(todayKey)} />
      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Client</h2>
          <p className="mt-1 font-semibold">{booking.client.name}</p>
          <p className="text-slate-600">{[booking.client.phone, booking.client.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Event</h2>
          <p className="mt-1 font-semibold">{booking.eventType} · {formatDateKey(booking.eventDateKey)}</p>
          <p className="text-slate-600">{hall?.name}{booking.guests ? ` · ${booking.guests} guests` : ""}</p>
        </div>
      </section>
      <table className="mt-5 w-full text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-1.5">Date</th><th>Reference</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          <tr className="border-b border-slate-100"><td className="py-1.5">{new Date(booking.bookedAt).toLocaleDateString("en-GB")}</td><td>{booking.referenceNo}</td><td>Hall{pkg ? ` + ${pkg.name}` : ""} (agreed price)</td><td className="text-right tabular-nums">{formatMoney(booking.agreedPrice)}</td></tr>
          {charges.map((c) => (
            <tr key={c.id} className="border-b border-slate-100"><td className="py-1.5">{new Date(c.date).toLocaleDateString("en-GB")}</td><td>{c.referenceNo}</td><td>{c.label}</td><td className="text-right tabular-nums">{formatMoney(c.amount)}</td></tr>
          ))}
          {money.map((t) => (
            <tr key={t.id} className="border-b border-slate-100"><td className="py-1.5">{new Date(t.date).toLocaleDateString("en-GB")}</td><td>{t.referenceNo}</td><td>{t.type === "BOOKING_REFUND" ? "Refund" : "Payment"} · {METHOD[t.paymentMethod] || t.paymentMethod}{t.receivedByName ? ` · ${t.receivedByName}` : ""}</td><td className="text-right tabular-nums">{t.type === "BOOKING_REFUND" ? formatMoney(t.amount) : `−${formatMoney(t.amount)}`}</td></tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-4 max-w-xs rounded-lg bg-slate-50 p-3">
        <Row label="Total due" value={formatMoney(f.total)} />
        <Row label="Paid" value={formatMoney(f.paid)} />
        <Row label={f.balance < 0 ? "Paid too much" : "Balance due"} value={formatMoney(Math.abs(f.balance))} strong />
      </dl>
    </article>
  );
}
