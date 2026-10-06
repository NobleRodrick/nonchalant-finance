import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { leaseDetail } from "@/lib/property/lease-queries";
import { readProfile } from "@/lib/business-profile";
import { attachmentUrl } from "@/lib/attachments";
import { DEFAULT_LEASE_TERMS, PROPERTY_DOCUMENTS } from "@/lib/property/documents";
import { monthLabel, monthOf } from "@/lib/property/rent-schedule";
import { tenantStatement } from "@/lib/property/statement";
import { CHARGE_KIND_LABELS, DEPOSIT_STATUS_LABELS } from "@/lib/property/account";
import { unitTitle } from "@/lib/property/unit-math";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { PrintButton } from "@/components/kit/print-button";
import { FilterBar } from "@/components/kit/filter-bar";
import { BusinessDocument } from "@/components/documents/business-document";

export const dynamic = "force-dynamic";
export const metadata = { title: "Document" };

const METHOD = { CASH: "Cash", MOMO: "Mobile Money", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };
const DEPOSIT_KIND = { RECEIVED: "Received", REFUNDED: "Refunded", APPLIED_RENT: "Used for rent", APPLIED_CHARGES: "Used for charges", APPLIED_DAMAGE: "Used for damages" };

/**
 * Property rental: a printable document of a contract — the receipt of a payment or deposit
 * (?t=), the monthly bill (?month=), the statement (?from=&to=), the rental agreement, the
 * move-out settlement. Print → Save as PDF.
 */
export default async function ContractDocumentPage({ params, searchParams }) {
  const { deptId, leaseId, kind } = await params;
  const sp = (await searchParams) || {};
  const def = PROPERTY_DOCUMENTS[kind];
  if (!def) notFound();
  const { user, department } = await departmentPage(deptId, { module: "contracts" });
  const { todayKey, timeZone } = pageDate(user, null);
  const l = await leaseDetail({ departmentId: department.id, leaseId, todayKey, timeZone });
  if (!l) notFound();
  const p = readProfile(department);
  const business = { ...p, name: department.name, logoUrl: p.logoId ? attachmentUrl(p.logoId) : null };
  const day = (k) => (k ? formatDateKey(k, { weekday: false }) : null);
  const party = { label: kind === "receipt" ? "Received from" : "Tenant", name: l.client.name, lines: [l.client.company, l.client.phone, l.client.email, l.client.address, l.client.identification] };
  const office = [
    { label: "Office", value: l.unit.name },
    { label: "Building", value: l.unit.building.name },
    { label: "Floor", value: l.unit.floor },
    { label: "Contract", value: l.referenceNo },
    { label: "Monthly rent", value: formatMoney(l.rentNow) },
  ];
  const number = (n) => (department.code ? `${department.code} · ${n}` : n);
  const back = (
    <div className="flex items-center justify-between print:hidden">
      <Link href={`/d/${department.id}/contracts/${l.id}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft className="h-4 w-4" /> {l.referenceNo}</Link>
      <PrintButton label="Print / save as PDF" variant="default" size="default" />
    </div>
  );

  if (kind === "receipt") {
    const r = l.payments.find((x) => x.id === sp.t && x.status !== "VOIDED" && ["lease-payment", "lease-deposit"].includes(x.category));
    if (!r) notFound();
    const deposit = r.category === "lease-deposit";
    const at = l.statement.lines.findIndex((x) => x.referenceNo === r.referenceNo);
    const after = at >= 0 ? l.statement.lines[at].balance : l.account?.outstanding || 0;
    const before = after + (deposit ? 0 : r.amount);
    return (
      <div className="space-y-4">
        {back}
        <BusinessDocument
          business={business}
          doc={{ title: deposit ? "Deposit receipt" : "Receipt", number: number(r.referenceNo), dateLabel: day(r.dateKey) }}
          party={party}
          event={[...office, { label: "Payment date", value: day(r.dateKey) }]}
          eventTitle="Office"
          highlight={{ label: `Received by ${METHOD[r.paymentMethod] || r.paymentMethod}${r.reference ? ` · ref. ${r.reference}` : ""}`, amount: r.amount, note: deposit ? "Deposit (caution): held for the tenant, not rent." : null }}
          lines={deposit ? [] : r.covered.map((c) => ({ label: c.label, detail: "Paid by this receipt", quantity: 1, unitPrice: c.amount, total: c.amount }))}
          totals={deposit ? [{ label: "Deposit required", value: l.deposit.required }, { label: "Deposit held now", value: l.deposit.held, strong: true }] : [{ label: "Previous balance", value: Math.max(0, before) }, { label: "Amount paid", value: r.amount }, ...(r.amount > r.covered.reduce((s, c) => s + c.amount, 0) ? [{ label: "Advance (next months)", value: r.amount - r.covered.reduce((s, c) => s + c.amount, 0) }] : []), { label: "Amount remaining", value: Math.max(0, after), strong: true, tone: after > 0 ? "due" : null }]}
          authorized={r.receivedByName || r.user?.name}
          signatures={[{ label: "Received by", name: r.receivedByName || r.user?.name }]}
        />
      </div>
    );
  }

  if (kind === "bill") {
    const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month : monthOf(todayKey);
    const current = l.items.filter((i) => i.monthKey === month);
    const previous = l.items.filter((i) => i.monthKey < month && i.balance > 0).reduce((s, i) => s + i.balance, 0);
    const paidInMonth = l.payments.filter((x) => x.status !== "VOIDED" && x.category === "lease-payment" && x.dateKey.startsWith(month)).reduce((s, x) => s + x.amount, 0);
    const currentBalance = current.reduce((s, i) => s + i.balance, 0);
    return (
      <div className="space-y-4">
        <div className="print:hidden"><FilterBar fields={[{ name: "month", label: "Month", type: "month" }]} /></div>
        {back}
        <BusinessDocument
          business={business}
          doc={{ title: def.title, number: number(`${l.referenceNo}-${month}`), dateLabel: monthLabel(month), status: currentBalance + previous > 0 ? `Due ${day(current.find((i) => i.balance > 0)?.dueKey || todayKey)}` : "Paid" }}
          party={{ ...party, label: "Billed to" }}
          event={office}
          eventTitle="Office"
          lines={current.map((i) => ({ label: i.label, detail: CHARGE_KIND_LABELS[i.kind], quantity: 1, unitPrice: i.amount, total: i.amount }))}
          totals={[
            { label: `Charges of ${monthLabel(month)}`, value: current.reduce((s, i) => s + i.amount, 0) },
            { label: "Already paid on them", value: -current.reduce((s, i) => s + i.paid + i.byCredit, 0) },
            { label: "Previous balance", value: previous },
            { label: `Payments made in ${monthLabel(month)}`, value: paidInMonth },
            { label: "Current balance", value: currentBalance },
            { label: "Total amount due", value: currentBalance + previous, strong: true, tone: currentBalance + previous > 0 ? "due" : null },
          ]}
          terms={p.paymentTerms ? { title: "How to pay", text: p.paymentTerms } : null}
          authorized={user.name}
        />
      </div>
    );
  }

  if (kind === "statement") {
    const fromKey = /^\d{4}-\d{2}-\d{2}$/.test(sp.from || "") ? sp.from : l.startKey;
    const toKey = /^\d{4}-\d{2}-\d{2}$/.test(sp.to || "") ? sp.to : todayKey;
    const st = tenantStatement({ items: l.items.filter((i) => i.due), credits: l.statement.lines.filter((x) => x.credit || x.kind === "REFUND").map((x) => ({ dateKey: x.dateKey, label: x.label, kind: x.kind, amount: x.credit || x.debit, referenceNo: x.referenceNo })), fromKey, toKey });
    return (
      <div className="space-y-4">
        <div className="print:hidden"><FilterBar fields={[{ name: "from", label: "From", type: "date" }, { name: "to", label: "To", type: "date" }]} /></div>
        {back}
        <BusinessDocument
          business={business}
          doc={{ title: def.title, number: number(l.referenceNo), dateLabel: `${day(fromKey)} – ${day(toKey)}` }}
          party={party}
          event={office}
          eventTitle="Office"
          lines={[{ label: "Opening balance", quantity: "", unitPrice: null, total: st.opening }, ...st.lines.map((x) => ({ label: `${day(x.dateKey)} · ${x.label}`, detail: x.referenceNo, quantity: x.debit ? "+" : "−", unitPrice: x.debit || x.credit, total: x.balance }))]}
          totals={[
            { label: "Opening balance", value: st.opening },
            { label: "Rent charged", value: st.totals.rent },
            { label: "Utilities", value: st.totals.utilities },
            { label: "Other charges", value: st.totals.other + st.totals.refunds },
            { label: "Payments", value: -(st.totals.payments + st.totals.deposit + st.totals.waived) },
            { label: "Closing balance", value: st.closing, strong: true, tone: st.closing > 0 ? "due" : null },
          ]}
          authorized={user.name}
        />
      </div>
    );
  }

  if (kind === "agreement") {
    return (
      <div className="space-y-4">
        {back}
        <BusinessDocument
          business={business}
          doc={{ title: def.title, number: number(l.referenceNo), dateLabel: day(l.startKey) }}
          party={party}
          event={[
            ...office,
            { label: "Starts", value: day(l.startKey) },
            { label: "Ends", value: day(l.endKey) || "Open-ended" },
            { label: "Rent due", value: `On the ${l.dueDay}${l.monthsPerBill > 1 ? `, every ${l.monthsPerBill} months` : " of each month"}` },
            { label: "Deposit", value: formatMoney(l.depositRequired) },
            { label: "Notice", value: `${l.noticeDays} days` },
          ]}
          eventTitle="Office and terms"
          lines={[]}
          totals={[]}
          notes={[l.utilities && `Utilities and charges: ${l.utilities}`, l.conditions && `Conditions: ${l.conditions}`].filter(Boolean).join("\n") || null}
          terms={{ title: "Terms of the rental", text: p.contractTerms || DEFAULT_LEASE_TERMS }}
          signatures={[{ label: "For the landlord", name: l.createdBy?.name }, { label: "The tenant", name: l.client.name }]}
          authorized={l.createdBy?.name}
        />
      </div>
    );
  }

  // Move-out settlement
  const s = l.settlement;
  if (!s) notFound();
  return (
    <div className="space-y-4">
      {back}
      <BusinessDocument
        business={business}
        doc={{ title: def.title, number: number(`${l.referenceNo}-OUT`), dateLabel: day(s.moveOutKey) }}
        party={party}
        event={[...office, { label: "Moved in", value: day(l.moveInKey || l.startKey) }, { label: "Moved out", value: day(s.moveOutKey) }, { label: "Reason", value: s.reason }, { label: "Inspection", value: s.inspection ? `${s.inspection.referenceNo} · damages ${formatMoney(s.inspection.damageCost)}` : "None" }]}
        eventTitle={unitTitle(l.unit)}
        lines={l.depositLedger.map((d) => ({ label: `Deposit · ${DEPOSIT_KIND[d.kind]}`, detail: day(d.dateKey), quantity: 1, unitPrice: d.amount, total: d.amount }))}
        totals={[
          { label: "Owed before settlement", value: s.owedBefore },
          { label: "Deposit used", value: -s.depositUsed.reduce((x, u) => x + u.amount, 0) },
          { label: "Deposit refunded", value: s.depositRefunded },
          { label: "Deposit still held", value: s.depositHeld },
          { label: "Still owed by the tenant", value: s.owedAfter, strong: true, tone: s.owedAfter > 0 ? "due" : null },
        ]}
        notes={[`Deposit: ${DEPOSIT_STATUS_LABELS[l.depositStatus]}.`, s.utilitiesOwed ? `Utilities still owed: ${formatMoney(s.utilitiesOwed)}.` : null, s.repairs ? `Repairs required: ${s.repairs}.` : null].filter(Boolean).join(" ")}
        signatures={[{ label: "For the landlord", name: user.name }, { label: "The tenant", name: l.client.name }]}
        authorized={user.name}
      />
    </div>
  );
}
