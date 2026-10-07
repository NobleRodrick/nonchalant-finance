"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { DataTable, Field, Money, Pill, Section, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { formatDateKey } from "@/lib/timezone";
import { navigateTo } from "@/lib/navigation";
import { parseStatementCsv } from "@/lib/accounting/reconciliation-csv";
import { autoMatchAction, importStatementAction, matchLineAction, postFromStatementLineAction, setStatementLineAction } from "@/actions/accounting";

export function ImportStatement({ companyId, accounts }) {
  const router = useRouter();
  const [f, setF] = useState({ accountNumber: accounts[0]?.number || "", name: "", closingBalance: "", csv: "" });
  const [busy, setBusy] = useState(false);
  const parsed = f.csv ? parseStatementCsv(f.csv) : { rows: [], errors: [] };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setF({ ...f, csv: await file.text(), name: f.name || file.name.replace(/\.[^.]+$/, "") });
  };
  const submit = async () => {
    setBusy(true);
    const r = await runWithToast(importStatementAction({ companyId, accountNumber: f.accountNumber, name: f.name, closingBalance: Number(f.closingBalance) || 0, rows: parsed.rows }), { success: (d) => `${d.lines} line(s) imported, ${d.matched} matched with the books.` });
    setBusy(false);
    if (r) navigateTo(router, `/accounting/${companyId}/reconciliation/${r.statementId}`);
  };
  if (!accounts.length) return <p className="text-sm text-slate-500">No account to reconcile: mark a bank or Mobile Money account as reconciled in the chart of accounts.</p>;
  return (
    <div className="space-y-3">
      <Field label="Account" htmlFor="is-acc"><select id="is-acc" className={selectClass} value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })}>{accounts.map((a) => <option key={a.number} value={a.number}>{a.number} · {a.label}</option>)}</select></Field>
      <Field label="CSV file" htmlFor="is-file"><input id="is-file" type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="text-sm" /></Field>
      <Field label="…or paste it" htmlFor="is-csv"><textarea id="is-csv" rows={4} className={textareaClass} value={f.csv} onChange={(e) => setF({ ...f, csv: e.target.value })} placeholder={"date;label;reference;amount\n05/10/2026;Transfer from Client A;VIR123;250000"} /></Field>
      <Field label="Name" htmlFor="is-name"><input id="is-name" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Afriland October 2026" /></Field>
      <Field label="Closing balance on the statement" htmlFor="is-close"><input id="is-close" inputMode="numeric" className={inputClass} value={f.closingBalance} onChange={(e) => setF({ ...f, closingBalance: wholeNumber(e.target.value) })} /></Field>
      {f.csv ? <p className="text-xs text-slate-600">{parsed.rows.length} line(s) read.{parsed.errors.length ? ` ${parsed.errors.slice(0, 3).join(" ")}` : ""}</p> : null}
      <SubmitButton busy={busy} disabled={!parsed.rows.length} onClick={submit}>Import and match</SubmitButton>
    </div>
  );
}

function PostDialog({ companyId, line, accounts, onClose }) {
  const router = useRouter();
  const [account, setAccount] = useState(line.amount < 0 ? "631" : "771");
  const [label, setLabel] = useState(line.label);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(postFromStatementLineAction({ companyId, statementLineId: line.id, account, label }), { success: (d) => (d.entry.status === "POSTED" ? `Posted (${d.entry.number}) and matched.` : "Sent to the Boss for approval.") });
    setBusy(false);
    if (ok) {
      onClose();
      router.refresh();
    }
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title="Record it in the books" description={`${formatDateKey(line.dateKey, { weekday: false })} · ${line.label} · ${line.amount.toLocaleString("fr-FR")} FCFA`} footer={<SubmitButton busy={busy} onClick={submit}>Post</SubmitButton>}>
      <div className="grid gap-3">
        <Field label={line.amount < 0 ? "Paid for (account debited)" : "Received for (account credited)"} htmlFor="pd-acc">
          <input id="pd-acc" list="pd-accounts" className={inputClass} value={account} onChange={(e) => setAccount(e.target.value.split(/\s/)[0])} />
          <datalist id="pd-accounts">{accounts.map((a) => <option key={a.number} value={a.number}>{a.label}</option>)}</datalist>
        </Field>
        <Field label="Label" htmlFor="pd-label"><input id="pd-label" className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      </div>
    </FormDialog>
  );
}

export function StatementLines({ companyId, statementId, lines, openLedger, accounts }) {
  const router = useRouter();
  const [posting, setPosting] = useState(null);
  const act = async (promise, success) => {
    if (await runWithToast(promise, { success })) router.refresh();
  };
  return (
    <Section title="Lines" actions={<Button size="sm" variant="outline" onClick={() => act(autoMatchAction({ companyId, statementId }), (n) => `${n} more line(s) matched.`)}>Match again</Button>} bodyClassName="p-0">
      <DataTable
        dense
        rows={lines}
        columns={[
          { key: "dateKey", label: "Date", render: (l) => formatDateKey(l.dateKey, { weekday: false }) },
          { key: "label", label: "Statement", render: (l) => <span>{l.label}{l.reference ? <span className="block text-xs text-slate-500">{l.reference}</span> : null}</span> },
          { key: "amount", label: "Amount", align: "right", render: (l) => <Money value={l.amount} suffix={false} /> },
          { key: "match", label: "In the books", render: (l) => {
            if (l.status === "MATCHED") return <span className="flex items-center gap-2"><Pill tone="emerald">Matched</Pill>{l.entry ? <Link className="font-mono text-xs underline" href={`/accounting/${companyId}/entries/${l.entry.id}`}>{l.entry.number}</Link> : null}</span>;
            if (l.status === "IGNORED") return <Pill>Set aside</Pill>;
            const candidates = openLedger.filter((o) => o.amount === l.amount);
            return candidates.length ? (
              <select aria-label={`Match ${l.label}`} className={`${selectClass} h-8 py-0 text-xs`} defaultValue="" onChange={(e) => e.target.value && act(matchLineAction({ companyId, statementLineId: l.id, journalLineId: e.target.value }), "Matched.")}>
                <option value="">Choose the entry…</option>
                {candidates.map((o) => <option key={o.id} value={o.id}>{o.dateKey} · {o.number} · {o.label}</option>)}
              </select>
            ) : <span className="text-xs text-amber-700">Not in the books</span>;
          } },
          { key: "act", label: "", align: "right", render: (l) => (
            <span className="flex justify-end gap-1">
              {l.status === "UNMATCHED" ? <Button size="sm" variant="outline" onClick={() => setPosting(l)}>Record it</Button> : null}
              {l.status === "UNMATCHED" ? <Button size="sm" variant="ghost" onClick={() => act(setStatementLineAction({ companyId, statementLineId: l.id, status: "IGNORED" }), "Set aside.")}>Set aside</Button> : null}
              {l.status !== "UNMATCHED" ? <Button size="sm" variant="ghost" onClick={() => act(setStatementLineAction({ companyId, statementLineId: l.id, status: "UNMATCHED" }), "Undone.")}>Undo</Button> : null}
            </span>
          ) },
        ]}
      />
      {posting ? <PostDialog companyId={companyId} line={posting} accounts={accounts} onClose={() => setPosting(null)} /> : null}
    </Section>
  );
}
