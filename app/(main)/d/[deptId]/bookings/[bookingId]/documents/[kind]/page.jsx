import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { orderDetail } from "@/lib/rental/order-queries";
import { readProfile } from "@/lib/business-profile";
import { DEFAULT_CONTRACT_TERMS, DEFAULT_PAYMENT_TERMS, DOCUMENT_KINDS } from "@/lib/rental/documents";
import { CHARGE_KINDS } from "@/lib/rental/booking-math";
import { attachmentUrl } from "@/lib/attachments";
import { orgTimezone } from "@/lib/access";
import { formatDateKey, toDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { PrintButton } from "@/components/kit/print-button";
import { BusinessDocument } from "@/components/documents/business-document";

export const dynamic = "force-dynamic";
export const metadata = { title: "Document" };

const METHOD = { CASH: "Cash", MOMO: "Mobile Money", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

/**
 * Event rental: a printable document of a booking — quotation, booking confirmation, invoice,
 * rental agreement, or the receipt of one payment (?t=transaction id). Print → Save as PDF.
 */
export default async function BookingDocumentPage({ params, searchParams }) {
  const { deptId, bookingId, kind } = await params;
  const { t } = (await searchParams) || {};
  const def = DOCUMENT_KINDS[kind];
  if (!def) notFound();
  const { user, department } = await departmentPage(deptId, { module: "bookings" });
  if (department.domain !== "MATERIAL_RENTAL") notFound();
  const { todayKey } = pageDate(user, null);
  const detail = await orderDetail({ departmentId: department.id, orderId: bookingId, todayKey });
  if (!detail) notFound();
  const { order, transactions, charges } = detail;
  const tz = orgTimezone(user);
  const day = (k) => (k ? formatDateKey(k, { weekday: false }) : null);
  const at = (d) => formatDateKey(toDateKey(d, tz), { weekday: false });
  const p = readProfile(department);
  const business = { ...p, name: department.name, logoUrl: p.logoId ? attachmentUrl(p.logoId) : null };
  const f = order.figures;
  const payments = transactions.filter((x) => x.status !== "VOIDED" && ["BOOKING_PAYMENT", "BOOKING_REFUND"].includes(x.type));
  const receipt = kind === "receipt" ? payments.find((x) => x.id === t && x.type === "BOOKING_PAYMENT") : null;
  if (kind === "receipt" && !receipt) notFound();

  const lines = order.lines.map((l) => ({ label: l.label, detail: l.kind === "SERVICE" ? "Service" : l.item?.code, quantity: l.quantity, unitPrice: l.unitPrice, total: l.total }));
  const liveCharges = charges.filter((c) => !c.voidedAt);
  for (const c of liveCharges) lines.push({ label: c.label, detail: `${CHARGE_KINDS[c.kind]} · ${c.referenceNo}`, quantity: 1, unitPrice: c.amount, total: c.amount });
  const totals = [
    { label: "Items", value: order.itemsTotal },
    order.servicesTotal ? { label: "Services", value: order.servicesTotal } : null,
    order.discount ? { label: "Discount", value: -order.discount } : null,
    liveCharges.length ? { label: "Charges", value: f.charges } : null,
    { label: "Total", value: f.total, strong: true },
    def.payments ? { label: "Paid", value: f.paid } : null,
    def.payments ? { label: "Balance due", value: f.balance, strong: true, tone: f.balance > 0 ? "due" : null } : null,
    !def.payments && order.depositDue ? { label: "Deposit to confirm", value: order.depositDue } : null,
  ].filter(Boolean);
  const paymentRows = payments.map((x) => ({ dateLabel: at(x.date), referenceNo: x.referenceNo, method: METHOD[x.paymentMethod] || x.paymentMethod, by: x.receivedByName || x.user?.name, amount: x.type === "BOOKING_REFUND" ? -Number(x.amount) : Number(x.amount) }));
  const docNumber = kind === "receipt" ? receipt.referenceNo : `${order.referenceNo}${kind === "quotation" ? "-Q" : kind === "contract" ? "-C" : ""}`;
  const dueKey = order.paymentDueDateKey || order.eventDateKey;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/d/${department.id}/bookings/${order.id}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft className="h-4 w-4" /> {order.referenceNo}</Link>
        <PrintButton label="Print / save as PDF" variant="default" size="default" />
      </div>
      <BusinessDocument
        business={business}
        doc={{
          title: def.title,
          number: department.code ? `${department.code} · ${docNumber}` : docNumber,
          dateLabel: receipt ? at(receipt.date) : formatDateKey(todayKey, { weekday: false }),
          lead: def.lead,
          status: kind === "invoice" ? (f.balance <= 0 ? "Paid" : f.paid > 0 ? "Partly paid" : `Due ${day(dueKey)}`) : kind === "quotation" ? `Valid until ${day(order.eventDateKey)}` : null,
        }}
        party={{ label: kind === "receipt" ? "Received from" : kind === "contract" ? "Customer" : "Billed to", name: order.client.name, lines: [order.client.company, order.client.phone, order.client.email, order.client.address] }}
        event={[
          { label: "Event", value: order.eventType },
          { label: "Date", value: day(order.eventDateKey) },
          { label: "Location", value: order.eventLocation },
          { label: "Guests", value: order.guests },
          { label: "Items leave", value: day(order.dispatchDateKey) },
          { label: "Items return", value: day(order.returnDateKey) },
          { label: "Booking", value: order.referenceNo },
        ]}
        highlight={receipt ? { label: `Received by ${METHOD[receipt.paymentMethod] || receipt.paymentMethod}${receipt.reference ? ` · ref. ${receipt.reference}` : ""}`, amount: Number(receipt.amount), note: `Balance after all payments: ${formatMoney(f.balance)}` } : null}
        lines={kind === "receipt" ? [] : lines}
        totals={kind === "receipt" ? [{ label: "Total of the booking", value: f.total }, { label: "Paid in all", value: f.paid }, { label: "Balance due", value: f.balance, strong: true, tone: f.balance > 0 ? "due" : null }] : totals}
        payments={def.payments && kind !== "receipt" ? paymentRows : null}
        terms={def.terms === "contract" ? { title: "Terms of the rental", text: p.contractTerms || DEFAULT_CONTRACT_TERMS } : def.terms === "payment" ? { title: "Payment terms", text: p.paymentTerms || DEFAULT_PAYMENT_TERMS } : null}
        signatures={def.signatures ? [{ label: "For the business", name: order.handledBy?.name }, { label: "The customer", name: order.client.name }] : null}
        notes={order.specialInstructions && kind !== "receipt" ? `Instructions: ${order.specialInstructions}` : null}
        authorized={receipt ? receipt.receivedByName || receipt.user?.name : order.handledBy?.name || user.name}
      />
    </div>
  );
}
