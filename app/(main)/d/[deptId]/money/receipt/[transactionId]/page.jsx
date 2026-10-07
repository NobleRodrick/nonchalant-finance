import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { documentBusiness, METHOD_WORDS, vatRows } from "@/lib/trade/documents";
import { formatDateKey, formatTimeInZone, toDateKey } from "@/lib/timezone";
import { PrintButton } from "@/components/kit/print-button";
import { BusinessDocument } from "@/components/documents/business-document";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receipt" };

/** Shop, bar, other: the receipt of a sale (an invoice with VAT and NIU / RCCM for a formal business). */
export default async function SaleReceiptPage({ params }) {
  const { deptId, transactionId } = await params;
  const { user, department } = await departmentPage(deptId, { module: "money" });
  const { timeZone } = pageDate(user, null);
  const s = await db.transaction.findFirst({ where: { id: transactionId, departmentId: department.id, type: "SALE" }, include: { tradeLines: true, user: { select: { name: true } }, debt: { select: { referenceNo: true, debtorName: true, debtorContact: true } }, tradeTab: { select: { label: true } } } });
  if (!s || !s.tradeLines.length) notFound();
  const { business, company, formal } = await documentBusiness(department);
  const dateKey = toDateKey(s.date, timeZone);
  const net = Math.round(Number(s.amount));
  const gross = Math.round(Number(s.grossAmount ?? s.amount));
  const discount = Math.round(Number(s.discountAmount || 0));
  const credit = s.paymentMethod === "CREDIT";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/d/${department.id}/money?ref=${s.referenceNo}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft className="h-4 w-4" /> {s.referenceNo} · {formatDateKey(dateKey, { weekday: false })}</Link>
        <PrintButton label="Print / save as PDF" variant="default" size="default" />
      </div>
      <BusinessDocument
        business={business}
        doc={{ title: s.status === "VOIDED" ? "Sale voided" : formal ? (credit ? "Invoice" : "Invoice · paid") : "Receipt", number: department.code ? `${department.code} · ${s.referenceNo}` : s.referenceNo, dateLabel: `${formatDateKey(dateKey, { weekday: false })} ${formatTimeInZone(s.date, timeZone)}`, status: s.status === "VOIDED" ? "Void" : null }}
        party={{ label: "Customer", name: s.debt?.debtorName || s.customerName || "Walk-in customer", lines: [s.debt?.debtorContact, s.tradeTab ? `Tab ${s.tradeTab.label}` : null] }}
        lines={s.tradeLines.map((l) => ({ label: l.name, quantity: Math.round(l.quantity * 1000) / 1000, unitPrice: l.unitPrice, total: l.total }))}
        totals={[...(discount ? [{ label: "Subtotal", value: gross }, { label: "Discount", value: -discount }] : []), { label: "Total", value: net, strong: true }, ...vatRows(net, company, dateKey, [s.category])]}
        highlight={credit ? { label: `On credit${s.debt ? ` · debt ${s.debt.referenceNo}` : ""}`, amount: net, note: "To be paid by the customer." } : { label: `Paid by ${METHOD_WORDS[s.paymentMethod] || s.paymentMethod}${s.reference ? ` · ref. ${s.reference}` : ""}`, amount: net }}
        authorized={s.user?.name}
        notes={business.footer || "Thank you for your visit."}
      />
    </div>
  );
}
