import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { firstOpenKey, keyOf } from "@/lib/accounting/ledger";
import { openingSuggestions } from "@/lib/accounting/closing";
import { formatMoney } from "@/lib/format";
import { EntryForm } from "@/components/accounting/entry-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New entry" };

/** A manual entry (?opening=1: the opening balances, with what the app already knows; ?edit=<id>: a draft). */
export default async function NewEntryPage({ params, searchParams }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { company, access, timeZone } = await accountingPage(companyId);
  const [accounts, departments, openKey] = await Promise.all([
    db.ledgerAccount.findMany({ where: { companyId, isActive: true }, select: { number: true, label: true }, orderBy: { number: "asc" } }),
    db.department.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    firstOpenKey(db, company),
  ]);
  let initial = null;
  if (sp?.edit) {
    const e = await db.journalEntry.findFirst({ where: { id: sp.edit, companyId, isManual: true, status: { in: ["DRAFT", "REJECTED", "PENDING"] } }, include: { journal: true, lines: { orderBy: { position: "asc" }, include: { account: { select: { number: true } } } } } });
    if (e) initial = { id: e.id, journal: e.journal.code, dateKey: keyOf(e.date), label: e.label, reference: e.reference || "", note: e.note || "", lines: e.lines.map((l) => ({ account: l.account.number, label: l.label || "", debit: l.debit || "", credit: l.credit || "", departmentId: l.departmentId || "", partnerName: l.partnerName || "" })) };
  } else if (sp?.opening) {
    const s = await openingSuggestions({ company, timeZone });
    initial = { journal: "AN", dateKey: s.dateKey, label: "Opening balances", lines: [...s.lines, { account: "5211", label: "Bank balance", debit: "", credit: "" }, { account: "101", label: "Capital (or 104 owner's account): the balancing figure", debit: "", credit: "" }] };
  }
  const approvalNote = !access.isBoss && company.approvalThreshold > 0 ? `Entries above ${formatMoney(company.approvalThreshold)} wait for the Boss's approval before they count.` : null;
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{initial?.id ? "Edit the entry" : sp?.opening ? "Opening balances" : "New entry"}</h2>
      {sp?.opening ? <p className="mb-4 max-w-3xl text-sm text-slate-600">What the business owned and owed on the day before its first record in the app: cash in each drawer, bank and Mobile Money balances, equipment, what suppliers were owed and loans. The difference is the owners' capital. Debts customers owed then are already in the books (old debts recorded in the departments).</p> : null}
      <EntryForm companyId={companyId} accounts={accounts} departments={departments} initial={initial} openKey={openKey} approvalNote={approvalNote} />
    </div>
  );
}
