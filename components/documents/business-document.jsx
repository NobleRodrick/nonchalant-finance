import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A printable business document (quotation, invoice, receipt, booking confirmation, rental
 * agreement …) on the department's letterhead. Server component; the page prints to PDF.
 *
 * business: { name, legalName, tagline, address, phone, email, website, taxId, registration,
 *             bankDetails, momoNumber, logoUrl, footer }
 * doc:      { title, number, dateLabel, lead, status }
 * party:    { label, name, lines: [] }       event: [{ label, value }]
 * lines:    [{ label, detail, quantity, unitPrice, total }]
 * totals:   [{ label, value, strong, tone }]   payments: [{ dateLabel, referenceNo, method, amount, by }]
 * terms:    { title, text }   signatures: [{ label, name }]   authorized: name of who issued it
 */
export function BusinessDocument({ business, doc, party, event = [], eventTitle = "Event", lines = [], totals = [], payments = null, highlight = null, terms = null, signatures = null, authorized = null, notes = null }) {
  const contact = [business.address, business.phone, business.email, business.website].filter(Boolean);
  const ids = [business.taxId && `NIU ${business.taxId}`, business.registration && `RCCM ${business.registration}`].filter(Boolean);
  return (
    <article className="mx-auto max-w-[210mm] bg-white p-8 text-[13px] leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200 print:p-0 print:shadow-none print:ring-0" data-testid="business-document">
      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-5">
        <div className="flex items-start gap-3">
          {business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logoUrl} alt="" className="h-16 w-16 rounded-md object-contain" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-md bg-slate-900 text-lg font-bold text-white">{String(business.legalName || business.name).slice(0, 2).toUpperCase()}</div>
          )}
          <div>
            <div className="text-lg font-bold text-slate-900">{business.legalName || business.name}</div>
            {business.tagline ? <div className="text-xs text-slate-500">{business.tagline}</div> : null}
            {contact.length ? <div className="mt-1 text-xs text-slate-600">{contact.join(" · ")}</div> : null}
            {ids.length ? <div className="text-xs text-slate-500">{ids.join(" · ")}</div> : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold uppercase tracking-wide text-slate-900">{doc.title}</div>
          <div className="font-mono text-sm">{doc.number}</div>
          <div className="text-xs text-slate-500">{doc.dateLabel}</div>
          {doc.status ? <div className="mt-1 inline-block rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">{doc.status}</div> : null}
        </div>
      </header>

      {doc.lead ? <p className="mt-4 text-slate-700">{doc.lead}</p> : null}

      <section className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{party.label}</h3>
          <div className="font-semibold text-slate-900">{party.name}</div>
          {party.lines.filter(Boolean).map((l) => <div key={l} className="text-slate-600">{l}</div>)}
        </div>
        {event.length ? (
          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{eventTitle}</h3>
            <dl className="space-y-0.5">
              {event.filter((e) => e.value).map((e) => <div key={e.label} className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">{e.label}</dt><dd className="text-slate-800">{e.value}</dd></div>)}
            </dl>
          </div>
        ) : null}
      </section>

      {highlight ? <div className="mt-5 rounded-lg border-2 border-slate-900 p-4 text-center"><div className="text-xs uppercase tracking-wide text-slate-500">{highlight.label}</div><div className="text-3xl font-bold tabular-nums text-slate-900">{formatMoney(highlight.amount)}</div>{highlight.note ? <div className="text-xs text-slate-600">{highlight.note}</div> : null}</div> : null}

      {lines.length ? (
        <table className="mt-5 w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit price</th><th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-100 align-top">
                <td className="py-1.5">{l.label}{l.detail ? <div className="text-[11px] text-slate-500">{l.detail}</div> : null}</td>
                <td className="py-1.5 text-right tabular-nums">{l.quantity}</td>
                <td className="py-1.5 text-right tabular-nums">{l.unitPrice === null || l.unitPrice === undefined ? "" : formatMoney(l.unitPrice)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {totals.length ? (
        <dl className="ml-auto mt-3 w-full max-w-xs space-y-1">
          {totals.map((t) => (
            <div key={t.label} className={cn("flex justify-between gap-4", t.strong && "border-t border-slate-300 pt-1 text-base font-bold text-slate-900")}>
              <dt className={t.strong ? "" : "text-slate-600"}>{t.label}</dt>
              <dd className={cn("tabular-nums", t.tone === "due" && "text-rose-700")}>{formatMoney(t.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {payments && payments.length ? (
        <section className="mt-5">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payments received</h3>
          <table className="w-full text-[12px]">
            <tbody>
              {payments.map((p) => (
                <tr key={p.referenceNo} className="border-b border-slate-100">
                  <td className="py-1">{p.dateLabel}</td><td className="py-1 font-mono">{p.referenceNo}</td><td className="py-1">{p.method}</td><td className="py-1 text-slate-500">{p.by}</td><td className="py-1 text-right tabular-nums">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {business.bankDetails || business.momoNumber ? (
        <section className="mt-5 rounded-md bg-slate-50 p-3 text-xs text-slate-700 print:bg-transparent print:p-0">
          <span className="font-semibold">How to pay: </span>
          {[business.momoNumber && `Mobile Money ${business.momoNumber}`, business.bankDetails].filter(Boolean).join(" · ")}
        </section>
      ) : null}

      {notes ? <p className="mt-4 whitespace-pre-line text-slate-700">{notes}</p> : null}

      {terms?.text ? (
        <section className="mt-5 break-inside-avoid">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{terms.title}</h3>
          <p className="whitespace-pre-line text-[12px] text-slate-700">{terms.text}</p>
        </section>
      ) : null}

      {signatures ? (
        <section className="mt-10 grid grid-cols-2 gap-10 break-inside-avoid">
          {signatures.map((s) => (
            <div key={s.label}>
              <div className="h-14 border-b border-slate-400" />
              <div className="mt-1 text-xs text-slate-600">{s.label}{s.name ? `: ${s.name}` : ""}</div>
              <div className="text-[11px] text-slate-400">Date and signature</div>
            </div>
          ))}
        </section>
      ) : null}

      <footer className="mt-8 border-t border-slate-200 pt-3 text-center text-[11px] text-slate-500">
        {authorized ? <div>Issued by {authorized}</div> : null}
        {business.footer ? <div>{business.footer}</div> : null}
      </footer>
    </article>
  );
}
