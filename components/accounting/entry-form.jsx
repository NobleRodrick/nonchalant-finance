"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Section, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { SubmitButton } from "@/components/kit/form-dialog";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { formatMoney } from "@/lib/format";
import { navigateTo } from "@/lib/navigation";
import { saveManualEntryAction } from "@/actions/accounting";

const blank = () => ({ account: "", label: "", debit: "", credit: "", departmentId: "", partnerName: "" });

/** Ready-made entries for what owners record most (accounts filled, amounts to type). */
export const TEMPLATES = [
  { key: "capital", label: "Capital brought in (to the bank)", journal: "OD", lines: [["5211", "D"], ["101", "C"]] },
  { key: "owner", label: "Owner puts money in / takes money out (sole trader)", journal: "OD", lines: [["5211", "D"], ["104", "C"]] },
  { key: "loan", label: "Bank loan received", journal: "BQ", lines: [["5211", "D"], ["162", "C"]] },
  { key: "loan-repay", label: "Loan repayment (principal and interest)", journal: "BQ", lines: [["162", "D"], ["671", "D"], ["5211", "C"]] },
  { key: "deposit", label: "Boss's cash deposited at the bank", journal: "BQ", lines: [["5211", "D"], ["5712", "C"]] },
  { key: "salaries", label: "Salaries paid by bank", journal: "BQ", lines: [["661", "D"], ["5211", "C"]] },
  { key: "cnps", label: "Social security (CNPS) paid", journal: "BQ", lines: [["664", "D"], ["5211", "C"]] },
  { key: "bank-fees", label: "Bank charges", journal: "BQ", lines: [["631", "D"], ["5211", "C"]] },
  { key: "tax", label: "Income tax (minimum / IS) paid", journal: "BQ", lines: [["891", "D"], ["5211", "C"]] },
  { key: "asset", label: "Equipment bought by the company (paid by bank)", journal: "BQ", lines: [["2441", "D"], ["5211", "C"]] },
];

export function EntryForm({ companyId, accounts, departments, initial = null, openKey = null, approvalNote = null, requireDepartment = false }) {
  const router = useRouter();
  // A head limited to his departments: every line carries one of them (the first by default).
  const fresh = () => ({ ...blank(), departmentId: requireDepartment ? departments[0]?.id || "" : "" });
  const [f, setF] = useState(() => ({
    journal: initial?.journal || "OD",
    dateKey: initial?.dateKey || new Date().toISOString().slice(0, 10),
    label: initial?.label || "",
    reference: initial?.reference || "",
    note: initial?.note || "",
    lines: initial?.lines?.length ? initial.lines.map((l) => ({ ...fresh(), ...l, debit: l.debit || "", credit: l.credit || "" })) : [fresh(), fresh()],
  }));
  const [busy, setBusy] = useState(null);
  const byNumber = useMemo(() => new Map(accounts.map((a) => [a.number, a.label])), [accounts]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setLine = (i, patch) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const debit = f.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const credit = f.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const diff = debit - credit;

  const applyTemplate = (key) => {
    const t = TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setF({ ...f, journal: t.journal, label: f.label || t.label, lines: t.lines.map(([account]) => ({ ...fresh(), account })) });
  };

  const submit = async (post) => {
    setBusy(post ? "post" : "draft");
    const input = {
      companyId,
      ...(initial?.id ? { id: initial.id } : {}),
      journal: f.journal,
      dateKey: f.dateKey,
      label: f.label,
      reference: f.reference,
      note: f.note,
      submit: post,
      lines: f.lines.filter((l) => l.account || l.debit || l.credit).map((l) => ({ account: String(l.account).split(/\s/)[0], label: l.label, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, departmentId: l.departmentId || null, partnerName: l.partnerName })),
    };
    const saved = await runWithToast(saveManualEntryAction(input), { success: (e) => (e.status === "POSTED" ? `Entry ${e.number} posted.` : e.status === "PENDING" ? "Sent to the Boss for approval." : "Draft saved.") });
    setBusy(null);
    if (saved) navigateTo(router, `/accounting/${companyId}/entries/${saved.id}`);
  };

  return (
    <div className="space-y-4">
      <Section title="The entry" description={openKey ? `The books are closed until ${openKey}: date it on or after.` : "Debits must equal credits."}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {!initial?.id ? (
            <Field label="Start from" htmlFor="en-tpl" className="lg:col-span-4">
              <select id="en-tpl" className={selectClass} defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">An empty entry</option>
                {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label="Date" required htmlFor="en-date"><input id="en-date" type="date" className={inputClass} value={f.dateKey} onChange={set("dateKey")} /></Field>
          <Field label="Journal" htmlFor="en-journal">
            <select id="en-journal" className={selectClass} value={f.journal} onChange={set("journal")}>
              {[["OD", "General entries"], ["BQ", "Bank"], ["MM", "Mobile Money"], ["CA", "Cash"], ["AC", "Purchases"], ["VE", "Sales"], ["AN", "Opening balances"]].map(([c, l]) => <option key={c} value={c}>{c} · {l}</option>)}
            </select>
          </Field>
          <Field label="What it is for" required htmlFor="en-label" className="lg:col-span-2"><input id="en-label" className={inputClass} value={f.label} onChange={set("label")} placeholder="e.g. Capital brought in by the owners" /></Field>
          <Field label="Document reference" htmlFor="en-ref"><input id="en-ref" className={inputClass} value={f.reference} onChange={set("reference")} placeholder="Bank slip, invoice no." /></Field>
          <Field label="Note" htmlFor="en-note" className="sm:col-span-1 lg:col-span-3"><textarea id="en-note" rows={1} className={textareaClass} value={f.note} onChange={set("note")} /></Field>
        </div>
      </Section>
      <Section title="Lines" bodyClassName="p-0">
        <datalist id="entry-accounts">{accounts.map((a) => <option key={a.number} value={a.number}>{a.label}</option>)}</datalist>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="entry-lines">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Line label</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Partner</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {f.lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  <td className="w-44 px-2 py-1.5">
                    <input list="entry-accounts" aria-label={`Account of line ${i + 1}`} className={inputClass} value={l.account} onChange={(e) => setLine(i, { account: e.target.value })} placeholder="Account no." />
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">{byNumber.get(String(l.account).split(/\s/)[0]) || (l.account ? "Not in the chart" : "")}</div>
                  </td>
                  <td className="px-2 py-1.5"><input aria-label={`Label of line ${i + 1}`} className={inputClass} value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} /></td>
                  <td className="w-40 px-2 py-1.5">
                    <select aria-label={`Department of line ${i + 1}`} className={selectClass} value={l.departmentId} onChange={(e) => setLine(i, { departmentId: e.target.value })}>
                      {requireDepartment ? null : <option value="">—</option>}
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
                  <td className="w-40 px-2 py-1.5"><input aria-label={`Partner of line ${i + 1}`} className={inputClass} value={l.partnerName} onChange={(e) => setLine(i, { partnerName: e.target.value })} placeholder="Customer, supplier" /></td>
                  <td className="w-32 px-2 py-1.5"><input inputMode="numeric" aria-label={`Debit of line ${i + 1}`} className={`${inputClass} text-right`} value={l.debit} onChange={(e) => setLine(i, { debit: wholeNumber(e.target.value), credit: e.target.value ? "" : l.credit })} /></td>
                  <td className="w-32 px-2 py-1.5"><input inputMode="numeric" aria-label={`Credit of line ${i + 1}`} className={`${inputClass} text-right`} value={l.credit} onChange={(e) => setLine(i, { credit: wholeNumber(e.target.value), debit: e.target.value ? "" : l.debit })} /></td>
                  <td className="px-1 py-1.5">
                    {f.lines.length > 2 ? <Button type="button" variant="ghost" size="sm" aria-label={`Remove line ${i + 1}`} onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-3 py-2" colSpan={4}>
                  <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, lines: [...f.lines, fresh()] })}><Plus className="h-4 w-4" /> Add a line</Button>
                  {diff !== 0 && debit + credit > 0 ? (
                    <Button type="button" size="sm" variant="ghost" className="ml-2" onClick={() => {
                      const i = f.lines.findIndex((l) => !l.debit && !l.credit);
                      const patch = diff > 0 ? { credit: diff, debit: "" } : { debit: -diff, credit: "" };
                      if (i >= 0) setLine(i, patch);
                      else setF({ ...f, lines: [...f.lines, { ...fresh(), ...patch }] });
                    }}>Balance with an empty line</Button>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(debit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(credit)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className={diff ? "text-sm font-medium text-rose-700" : "text-sm text-emerald-700"} data-testid="entry-balance">{diff ? `Difference: ${formatMoney(Math.abs(diff))} (${diff > 0 ? "more debit" : "more credit"})` : debit ? "Balanced" : "Type the amounts"}</span>
          <div className="flex gap-2">
            <SubmitButton variant="outline" busy={busy === "draft"} disabled={Boolean(busy)} onClick={() => submit(false)}>Save as draft</SubmitButton>
            <SubmitButton busy={busy === "post"} disabled={Boolean(busy) || Boolean(diff) || !debit} onClick={() => submit(true)}>{approvalNote ? "Post (or send for approval)" : "Post the entry"}</SubmitButton>
          </div>
        </div>
        {approvalNote ? <p className="px-4 pb-3 text-xs text-slate-500">{approvalNote}</p> : null}
      </Section>
    </div>
  );
}
