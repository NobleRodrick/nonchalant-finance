"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { Banner, DataTable, Field, KeyValues, Pill, Section, inputClass, selectClass } from "@/components/kit/primitives";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { formatMoney } from "@/lib/format";
import { createAccountantAction, saveLedgerAccountAction, setAccountantCompaniesAction, setAccountForAction, setAccountingLevelAction, setFeaturesAction, setHeadBookkeeperAction } from "@/actions/accounting";
import { updateEmployee } from "@/actions/organization";
import { CompanyDialog } from "./companies-client";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function LevelCard({ company, records, isBoss }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const full = company.level === "FULL";
  const change = async (level) => {
    setBusy(true);
    const ok = await runWithToast(setAccountingLevelAction({ companyId: company.id, level }), { success: (d) => (level === "FULL" ? `Full accounting on: ${d.built?.posted || 0} entries written from the records.` : "Back to Simple accounting: the books are kept, hidden.") });
    setBusy(false);
    setConfirm(null);
    if (ok) router.refresh();
  };
  return (
    <Section title="Accounting level" description="The heads' daily screens never change. In Full accounting the Boss can also let heads keep the books (below).">
      <div className="grid gap-3 md:grid-cols-2">
        <div className={`rounded-lg border p-4 ${!full ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}>
          <div className="flex items-center justify-between"><h3 className="font-semibold">Simple</h3>{!full ? <Pill tone="emerald">Current</Pill> : null}</div>
          <p className="mt-1 text-sm text-slate-600">Money in and out, cash, debts and profit, for a business without an accountant (OHADA <em>système minimal de trésorerie</em>).</p>
        </div>
        <div className={`rounded-lg border p-4 ${full ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}>
          <div className="flex items-center justify-between"><h3 className="font-semibold">Full accounting (SYSCOHADA)</h3>{full ? <Pill tone="emerald">Current</Pill> : null}</div>
          <p className="mt-1 text-sm text-slate-600">Double-entry books written automatically from every record: journals, general ledger, trial balance, income statement, balance sheet, cash-flow statement, closing, accountant, VAT, suppliers and reconciliation.</p>
        </div>
      </div>
      {isBoss ? (
        <div className="mt-4">
          {full ? (
            <Button variant="outline" size="sm" onClick={() => setConfirm("SIMPLE")}>Go back to Simple</Button>
          ) : (
            <Button onClick={() => setConfirm("FULL")}><BookOpen className="h-4 w-4" /> Switch to Full accounting</Button>
          )}
          {full && company.fullSince ? <span className="ml-3 text-xs text-slate-500">Full accounting since {company.fullSince}.</span> : null}
        </div>
      ) : null}
      <Dialog open={Boolean(confirm)} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "FULL" ? "Switch to Full accounting?" : "Go back to Simple?"}</DialogTitle>
            <DialogDescription>
              {confirm === "FULL"
                ? `The books are written now from the whole history of the company's departments (${records} money record(s), plus events, nights, rent, depreciation …), then kept up to date automatically. Nothing changes for the department heads.`
                : "The books stop being shown and updated. Nothing is deleted: switching back to Full brings them up to date."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <SubmitButton busy={busy} onClick={() => change(confirm)}>{confirm === "FULL" ? "Switch and write the books" : "Go back to Simple"}</SubmitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function FeaturesForm({ company, categories }) {
  const router = useRouter();
  const [f, setF] = useState({ vatEnabled: company.vatEnabled, vatSince: company.vatSince || new Date().toISOString().slice(0, 8) + "01", vatRate: company.vatRate, vatExempt: company.vatExempt, payablesEnabled: company.payablesEnabled, reconciliationEnabled: company.reconciliationEnabled, approvalThreshold: company.approvalThreshold });
  const [busy, setBusy] = useState(false);
  const incomeCategories = categories.filter((c) => ["RENT_INCOME", "OTHER_INCOME"].includes(c.type));
  const save = async () => {
    setBusy(true);
    const ok = await runWithToast(setFeaturesAction({ companyId: company.id, ...f, approvalThreshold: Number(f.approvalThreshold) || 0 }), { success: "Settings saved. The open months are written again with them." });
    setBusy(false);
    if (ok) router.refresh();
  };
  return (
    <Section title="VAT and options">
      <div className="space-y-5">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.vatEnabled} onChange={(e) => setF({ ...f, vatEnabled: e.target.checked })} /> The company is registered for VAT</label>
          {f.vatEnabled ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="VAT applies from" htmlFor="vat-since"><input id="vat-since" type="date" className={inputClass} value={f.vatSince} onChange={(e) => setF({ ...f, vatSince: e.target.value })} /></Field>
              <Field label="Standard rate (%)" htmlFor="vat-rate" hint="19.25 % as commonly published for Cameroon (17.5 % + 10 % council surcharge): confirm with your accountant."><input id="vat-rate" inputMode="decimal" className={inputClass} value={f.vatRate} onChange={(e) => setF({ ...f, vatRate: e.target.value })} /></Field>
              <Field label="Amounts recorded include VAT" htmlFor="vat-incl"><select id="vat-incl" className={selectClass} disabled value="yes"><option value="yes">Yes: the VAT is taken out of them</option></select></Field>
              <div className="sm:col-span-3">
                <div className="mb-1 text-xs font-medium text-slate-600">Income without VAT (exempt)</div>
                <div className="flex flex-wrap gap-2">
                  {incomeCategories.map((c) => (
                    <label key={c.id} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs">
                      <input type="checkbox" checked={f.vatExempt.includes(c.id)} onChange={(e) => setF({ ...f, vatExempt: e.target.checked ? [...f.vatExempt, c.id] : f.vatExempt.filter((x) => x !== c.id) })} /> {c.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : <p className="mt-1 text-xs text-slate-500">Off: amounts are revenue and expenses as recorded.</p>}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.payablesEnabled} onChange={(e) => setF({ ...f, payablesEnabled: e.target.checked })} /> Supplier bills paid later (accounts payable)</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.reconciliationEnabled} onChange={(e) => setF({ ...f, reconciliationEnabled: e.target.checked })} /> Bank and Mobile Money reconciliation (statements imported)</label>
        <Field label="Manual entries by an accountant or a head above this amount wait for the Boss (0: never)" htmlFor="appr" className="max-w-sm"><input id="appr" inputMode="numeric" className={inputClass} value={f.approvalThreshold} onChange={(e) => setF({ ...f, approvalThreshold: wholeNumber(e.target.value) })} /></Field>
        <SubmitButton busy={busy} onClick={save}>Save</SubmitButton>
      </div>
    </Section>
  );
}

function AccountantsPanel({ company, accountants, companies }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", tempPassword: "" });
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const ok = await runWithToast(createAccountantAction({ ...f, companyIds: [company.id] }), { success: `${f.name} can now sign in with the temporary password and keep the books.` });
    setBusy(false);
    if (ok) {
      setAdding(false);
      setF({ name: "", email: "", phone: "", tempPassword: "" });
      router.refresh();
    }
  };
  const toggle = async (a, on) => {
    const ids = on ? [...new Set([...a.companyIds, company.id])] : a.companyIds.filter((x) => x !== company.id);
    if (!ids.length) {
      if (await runWithToast(updateEmployee({ employeeId: a.id, isActive: false }), { success: `${a.name} is deactivated.` })) router.refresh();
      return;
    }
    if (await runWithToast(setAccountantCompaniesAction({ userId: a.id, companyIds: ids }), { success: "Saved." })) router.refresh();
  };
  return (
    <Section title="Accountants" description="People who keep the books (in-house or an outside firm). They see Accounting only: not the departments' daily work." actions={<Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add an accountant</Button>}>
      {accountants.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {accountants.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <span>{a.name} <span className="text-xs text-slate-500">· {a.email}</span>{!a.isActive ? <Pill className="ml-2">Deactivated</Pill> : null}</span>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={a.companyIds.includes(company.id)} onChange={(e) => toggle(a, e.target.checked)} /> Keeps the books of {company.name}{companies.length > 1 ? ` (and ${a.companyIds.filter((x) => x !== company.id).length} other)` : ""}</label>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">No accountant yet. The Boss can keep the books himself.</p>}
      <FormDialog open={adding} onOpenChange={setAdding} title="Add an accountant" description="They choose their own password at the first sign-in." footer={<SubmitButton busy={busy} onClick={create}>Add</SubmitButton>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required htmlFor="ac-name"><input id="ac-name" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="E-mail" required htmlFor="ac-email"><input id="ac-email" className={inputClass} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Phone" htmlFor="ac-phone"><input id="ac-phone" className={inputClass} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Temporary password" required htmlFor="ac-pass" hint="At least 8 characters with a letter and a number."><input id="ac-pass" className={inputClass} value={f.tempPassword} onChange={(e) => setF({ ...f, tempPassword: e.target.value })} /></Field>
        </div>
      </FormDialog>
    </Section>
  );
}

const KEEPS = [
  ["", "No access to the books"],
  ["DEPARTMENTS", "The books of his departments"],
  ["COMPANY", "The books of the whole company"],
];

/**
 * The Boss lets department heads keep the books: of their own departments only (entries, ledger,
 * trial balance, income statement, customers and suppliers, VAT of their expenses, supplier bills),
 * or of the whole company like an accountant. Approving large entries, closing and settings stay the
 * Boss's.
 */
function HeadBookkeepersPanel({ company, heads }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const set = async (h, scope) => {
    setBusy(h.id);
    const label = KEEPS.find(([k]) => k === scope)[1].toLowerCase();
    const ok = await runWithToast(setHeadBookkeeperAction({ companyId: company.id, userId: h.id, scope: scope || null }), { success: scope ? `${h.name} now keeps ${label.replace("his", "his own")}.` : `${h.name} no longer keeps the books.` });
    setBusy(null);
    if (ok) router.refresh();
  };
  return (
    <Section title="Department heads who keep the books" description={`Let a head do the accounting himself: the books of his departments only, or of the whole company. He then sees Accounting in his menu. ${company.approvalThreshold ? `His manual entries above ${formatMoney(company.approvalThreshold)} wait for your approval` : "Set an approval threshold above to approve his larger manual entries"}; closing the months and the settings stay yours.`}>
      {heads.length ? (
        <ul className="divide-y divide-slate-100 text-sm" data-testid="head-bookkeepers">
          {heads.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                {h.name} <span className="text-xs text-slate-500">· {h.title || "Head"} · {h.departments.join(", ")}</span>
              </span>
              <select aria-label={`Books ${h.name} keeps`} className={selectClass + " max-w-xs"} disabled={busy === h.id} value={h.scope || ""} onChange={(e) => set(h, e.target.value)}>
                {KEEPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">No department head yet. Add heads in People.</p>}
    </Section>
  );
}

function ChartPanel({ companyId, accounts }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState({ number: "", name: "", label: "" });
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => accounts.filter((a) => (!cls || a.number.startsWith(cls)) && (!q || `${a.number} ${a.label} ${a.name}`.toLowerCase().includes(q.toLowerCase()))), [accounts, q, cls]);
  const save = async () => {
    setBusy(true);
    const ok = await runWithToast(saveLedgerAccountAction({ companyId, ...(editing ? { id: editing.id, label: f.label } : f) }), { success: editing ? "Account saved." : `Account ${f.number} added.` });
    setBusy(false);
    if (ok) {
      setAdding(false);
      setEditing(null);
      setF({ number: "", name: "", label: "" });
      router.refresh();
    }
  };
  const toggle = async (a) => {
    if (await runWithToast(saveLedgerAccountAction({ companyId, id: a.id, isActive: !a.isActive }), { success: a.isActive ? `${a.number} switched off.` : `${a.number} switched on.` })) router.refresh();
  };
  return (
    <Section title="Chart of accounts (SYSCOHADA revised)" description="Add a sub-account under an existing one: e.g. 5212 for a second bank, 5521 for a second Mobile Money line." actions={<Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add an account</Button>} bodyClassName="p-0">
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        <input aria-label="Find an account" className={`${inputClass} max-w-xs`} placeholder="Find (number or name)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Class" className={`${selectClass} w-auto`} value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">All classes</option>
          {["1", "2", "3", "4", "5", "6", "7", "8"].map((c) => <option key={c} value={c}>Class {c}</option>)}
        </select>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        <DataTable
          dense
          stickyHeader
          rows={rows}
          columns={[
            { key: "number", label: "No.", render: (a) => <span className="font-mono text-xs">{a.number}</span> },
            { key: "label", label: "Name", render: (a) => <span className={a.isActive ? "" : "text-slate-400 line-through"}>{a.label}<span className="block text-[11px] text-slate-400">{a.name}</span></span> },
            { key: "flags", label: "", render: (a) => <span className="flex gap-1">{a.isSystem ? null : <Pill tone="sky">Added</Pill>}{a.reconcilable ? <Pill tone="violet">Reconciled</Pill> : null}</span> },
            { key: "act", label: "", align: "right", render: (a) => (
              <span className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" aria-label={`Rename ${a.number}`} onClick={() => { setEditing(a); setF({ number: a.number, name: a.name, label: a.label }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(a)}>{a.isActive ? "Switch off" : "Switch on"}</Button>
              </span>
            ) },
          ]}
        />
      </div>
      <FormDialog open={adding || Boolean(editing)} onOpenChange={(v) => { if (!v) { setAdding(false); setEditing(null); } }} title={editing ? `Account ${editing.number}` : "Add an account"} footer={<SubmitButton busy={busy} onClick={save}>Save</SubmitButton>}>
        <div className="grid gap-3">
          {!editing ? <Field label="Number" required htmlFor="la-n" hint="Starts with an existing account (e.g. 5212 under 521)."><input id="la-n" className={inputClass} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/\D/g, "") })} /></Field> : null}
          {!editing ? <Field label="Official name" required htmlFor="la-name"><input id="la-name" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Afriland First Bank" /></Field> : null}
          <Field label="Name shown in the app" htmlFor="la-label"><input id="la-label" className={inputClass} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        </div>
      </FormDialog>
    </Section>
  );
}

function AccountMapPanel({ companyId, categories, roles, accounts }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const numbers = accounts.filter((a) => a.isActive);
  const change = async (key, number) => {
    if (await runWithToast(setAccountForAction({ companyId, key, number }), { success: "Saved. The open months are written again with it." })) router.refresh();
  };
  const row = (r) => (
    <li key={r.key} className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm">{r.label}{r.custom ? <Pill tone="sky" className="ml-2">Changed</Pill> : null}</span>
      <select aria-label={`Account for ${r.label}`} className={`${selectClass} h-8 w-72 py-0 text-xs`} value={r.number} onChange={(e) => change(r.key, e.target.value)}>
        {!numbers.some((a) => a.number === r.number) ? <option value={r.number}>{r.number}</option> : null}
        {numbers.map((a) => <option key={a.number} value={a.number}>{a.number} · {a.label}</option>)}
      </select>
    </li>
  );
  const shown = categories.filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section title="Accounts used" description="Where each kind of record is posted. Change one only with your accountant: the open months are written again.">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Money categories</h3>
          <input aria-label="Find a category" className={`${inputClass} mb-2`} placeholder="Find a category" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">{shown.map(row)}</ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Treasury, customers, revenue and other roles</h3>
          <ul className="divide-y divide-slate-100">{roles.map(row)}</ul>
        </div>
      </div>
    </Section>
  );
}

export function CompanySettings({ isBoss, company, departments, records, accounts, categories, roles, accountants, companies, heads = [] }) {
  const [editing, setEditing] = useState(false);
  const full = company.level === "FULL";
  return (
    <div className="space-y-5">
      <Section title="Company" actions={isBoss ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button> : null}>
        <KeyValues rows={[
          { label: "Short name", value: company.name },
          { label: "Registered name", value: company.legalName || "—" },
          { label: "Tax number (NIU)", value: company.taxId || "—" },
          { label: "Trade register (RCCM)", value: company.tradeRegister || "—" },
          { label: "Address", value: company.address || "—" },
          { label: "Fiscal year", value: `${MONTHS[company.fiscalYearStartMonth - 1]} to ${MONTHS[(company.fiscalYearStartMonth + 10) % 12]}` },
          { label: "Departments", value: departments.map((d) => d.name).join(", ") || "—" },
        ]} />
        {editing ? <CompanyDialog open onClose={() => setEditing(false)} company={company} /> : null}
      </Section>
      <LevelCard company={company} records={records} isBoss={isBoss} />
      {full ? (
        <>
          {isBoss ? <FeaturesForm company={company} categories={categories} /> : <Section title="VAT and options"><KeyValues rows={[{ label: "VAT", value: company.vatEnabled ? `${company.vatRate} % from ${company.vatSince}` : "Off" }, { label: "Supplier bills", value: company.payablesEnabled ? "On" : "Off" }, { label: "Reconciliation", value: company.reconciliationEnabled ? "On" : "Off" }, { label: "Approval above", value: company.approvalThreshold ? formatMoney(company.approvalThreshold) : "Never" }]} /></Section>}
          {isBoss ? <AccountantsPanel company={company} accountants={accountants} companies={companies} /> : null}
          {isBoss ? <HeadBookkeepersPanel company={company} heads={heads} /> : null}
          <ChartPanel companyId={company.id} accounts={accounts} />
          {isBoss ? <AccountMapPanel companyId={company.id} categories={categories} roles={roles} accounts={accounts} /> : null}
        </>
      ) : !isBoss ? <Banner tone="info">Only the Boss can switch the company to Full accounting.</Banner> : null}
    </div>
  );
}
