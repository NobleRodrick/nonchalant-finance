import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { ticketDetail } from "@/lib/services/queries";
import { serviceSettings } from "@/lib/services/settings";
import { documentBusiness, METHOD_WORDS, vatRows } from "@/lib/trade/documents";
import { formatDateKey } from "@/lib/timezone";
import { PrintButton } from "@/components/kit/print-button";
import { BusinessDocument } from "@/components/documents/business-document";

export const dynamic = "force-dynamic";
export const metadata = { title: "Document" };

/**
 * Printable documents of a ticket: the drop-off slip (`slip`: the customer keeps it to collect),
 * a payment receipt (`receipt?t=`), the invoice of a collected ticket (`invoice`, with the VAT
 * included when the company charges VAT, and its NIU / RCCM).
 */
export default async function TicketDocumentPage({ params, searchParams }) {
  const { deptId, ticketId, kind } = await params;
  const sp = (await searchParams) || {};
  if (!["slip", "receipt", "invoice"].includes(kind)) notFound();
  const { user, department, domain } = await departmentPage(deptId, { module: "tickets" });
  const { todayKey, timeZone } = pageDate(user, null);
  const d = await ticketDetail({ department, ticketId, timeZone, todayKey });
  if (!d) notFound();
  const t = d.ticket;
  const { business, company } = await documentBusiness(department);
  const settings = serviceSettings(department);
  const day = (k) => (k ? formatDateKey(k, { weekday: false }) : null);
  const carWash = department.domain === "CAR_WASH";
  const number = (n) => (department.code ? `${department.code} · ${n}` : n);
  const party = { label: "Customer", name: t.customer || t.plate || "Walk-in customer", lines: [t.phone, t.plate && t.customer ? `Vehicle ${t.plate}${t.vehicleType ? ` (${t.vehicleType})` : ""}` : null] };
  const lines = t.lines.map((l) => ({ label: l.label, detail: [l.variant && !l.label.includes(l.variant) ? l.variant : null, l.notes].filter(Boolean).join(" · "), quantity: l.quantity, unitPrice: l.unitPrice, total: l.total }));
  const event = [
    { label: domain.words.ticket, value: t.referenceNo },
    { label: "Received", value: `${day(t.receivedKey)} ${t.receivedTime}` },
    t.promisedLabel ? { label: "Ready by", value: t.promisedLabel } : null,
    t.tagNo ? { label: "Tag numbers", value: t.tagNo } : null,
    t.express ? { label: "Service", value: `Express (+${t.surchargePct} %)` } : null,
  ].filter(Boolean);
  const totals = [
    { label: "Items", value: t.subtotal },
    ...(t.surchargePct ? [{ label: `Express +${t.surchargePct} %`, value: Math.round((t.subtotal * t.surchargePct) / 100) }] : []),
    ...(t.discount ? [{ label: t.discountReason || "Discount", value: -t.discount }] : []),
    { label: "Total", value: t.total, strong: true },
  ];
  const back = (
    <div className="flex items-center justify-between print:hidden">
      <Link href={`/d/${department.id}/tickets/${t.id}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft className="h-4 w-4" /> {t.referenceNo}</Link>
      <PrintButton label="Print / save as PDF" variant="default" size="default" />
    </div>
  );
  const payments = d.records.filter((r) => r.type === "BOOKING_PAYMENT" && !r.voided).map((r) => ({ dateLabel: day(r.dateKey), referenceNo: r.referenceNo, method: METHOD_WORDS[r.method] || r.method, amount: r.amount, by: r.by }));

  if (kind === "receipt") {
    const r = d.records.find((x) => x.id === sp.t && x.type === "BOOKING_PAYMENT" && !x.voided);
    if (!r) notFound();
    return (
      <div className="space-y-4">
        {back}
        <BusinessDocument business={business} doc={{ title: "Receipt", number: number(r.referenceNo), dateLabel: day(r.dateKey) }} party={party} event={event} eventTitle={domain.words.ticket} highlight={{ label: `Received by ${METHOD_WORDS[r.method] || r.method}${r.reference ? ` · ref. ${r.reference}` : ""}`, amount: r.amount, note: t.status === "COLLECTED" ? null : "Advance on the ticket: the balance is paid on collection." }} totals={[{ label: "Ticket total", value: t.total }, { label: "Paid so far", value: t.paid }, { label: "Left to pay", value: Math.max(0, t.balance), strong: true, tone: t.balance > 0 ? "due" : null }]} authorized={r.by} signatures={[{ label: "Received by", name: r.by }]} />
      </div>
    );
  }
  if (kind === "invoice") {
    if (t.status !== "COLLECTED") notFound();
    return (
      <div className="space-y-4">
        {back}
        <BusinessDocument business={business} doc={{ title: t.balance > 0 ? "Invoice" : "Invoice · paid", number: number(t.referenceNo), dateLabel: day(t.collectedKey) }} party={party} event={event} eventTitle={domain.words.ticket} lines={lines} totals={[...totals, ...vatRows(t.total, company, t.collectedKey), { label: "Paid", value: t.paid }, { label: "Left to pay", value: Math.max(0, t.balance), strong: true, tone: t.balance > 0 ? "due" : null }]} payments={payments} terms={business.paymentTerms ? { title: "Payment terms", text: business.paymentTerms } : null} authorized={user.name} />
      </div>
    );
  }
  const terms = carWash ? "Please check your vehicle before leaving. Valuables left in the vehicle are the owner's responsibility." : `Keep this slip: it is needed to collect the items. Items not collected within ${settings.unclaimedDays} days of being ready may be given away. Claims for damage are accepted on collection only.`;
  return (
    <div className="space-y-4">
      {back}
      <BusinessDocument business={business} doc={{ title: carWash ? "Wash ticket" : "Drop-off slip", number: number(t.referenceNo), dateLabel: day(t.receivedKey), status: t.balance > 0 ? `To pay ${t.balance.toLocaleString("fr-FR")} FCFA` : "Paid" }} party={party} event={event} eventTitle={domain.words.ticket} lines={lines} totals={[...totals, { label: "Paid", value: t.paid }, { label: "Left to pay", value: Math.max(0, t.balance), strong: true, tone: t.balance > 0 ? "due" : null }]} payments={payments.length ? payments : null} terms={{ title: "Conditions", text: business.contractTerms || terms }} signatures={[{ label: "Received by", name: t.createdBy }, { label: "Customer", name: t.customer || "" }]} />
    </div>
  );
}
