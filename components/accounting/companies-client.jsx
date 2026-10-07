"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Building, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { EmptyState, Field, Pill, Section, inputClass, selectClass } from "@/components/kit/primitives";
import { runWithToast } from "@/components/kit/client";
import { assignDepartmentAction, saveCompanyAction } from "@/actions/accounting";

export function CompanyDialog({ open, onClose, company = null }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({ name: company?.name || "", legalName: company?.legalName || "", taxId: company?.taxId || "", tradeRegister: company?.tradeRegister || "", address: company?.address || "", phone: company?.phone || "", email: company?.email || "", fiscalYearStartMonth: company?.fiscalYearStartMonth || 1 }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(saveCompanyAction({ ...(company?.id ? { id: company.id } : {}), ...f }), { success: company?.id ? "Company details saved." : `Company "${f.name}" added.` });
    setBusy(false);
    if (ok) {
      onClose();
      router.refresh();
    }
  };
  return (
    <FormDialog open={open} onOpenChange={(v) => !v && onClose()} title={company?.id ? "Company details" : "Add a company"} description="As registered: they are printed on the statements and the VAT returns." footer={<SubmitButton busy={busy} onClick={submit}>{company?.id ? "Save" : "Add the company"}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Short name" required htmlFor="co-name"><input id="co-name" className={inputClass} value={f.name} onChange={set("name")} placeholder="e.g. Deco Diva" /></Field>
        <Field label="Registered name" htmlFor="co-legal"><input id="co-legal" className={inputClass} value={f.legalName} onChange={set("legalName")} placeholder="e.g. Deco Diva SARL" /></Field>
        <Field label="Tax number (NIU)" htmlFor="co-niu"><input id="co-niu" className={inputClass} value={f.taxId} onChange={set("taxId")} /></Field>
        <Field label="Trade register (RCCM)" htmlFor="co-rccm"><input id="co-rccm" className={inputClass} value={f.tradeRegister} onChange={set("tradeRegister")} /></Field>
        <Field label="Address" htmlFor="co-addr" className="sm:col-span-2"><input id="co-addr" className={inputClass} value={f.address} onChange={set("address")} /></Field>
        <Field label="Phone" htmlFor="co-phone"><input id="co-phone" className={inputClass} value={f.phone} onChange={set("phone")} /></Field>
        <Field label="E-mail" htmlFor="co-email"><input id="co-email" className={inputClass} value={f.email} onChange={set("email")} /></Field>
        <Field label="Fiscal year starts in" htmlFor="co-fy" hint="OHADA: January, unless your company was allowed another month.">
          <select id="co-fy" className={selectClass} value={f.fiscalYearStartMonth} onChange={(e) => setF({ ...f, fiscalYearStartMonth: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 1)))}</option>)}
          </select>
        </Field>
      </div>
    </FormDialog>
  );
}

/** The companies, their departments and level; the Boss adds companies and moves departments. */
export function CompaniesClient({ companies, isBoss }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const move = async (departmentId, companyId) => {
    if (await runWithToast(assignDepartmentAction({ departmentId, companyId }), { success: "Department moved." })) router.refresh();
  };
  if (!companies.length) return <EmptyState title="No company yet" description="The Boss adds you to the companies whose books you keep." icon={Building} />;
  return (
    <div className="space-y-4">
      {isBoss ? (
        <div className="flex justify-end">
          <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add a company</Button>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {companies.map((c) => (
          <Section
            key={c.id}
            title={c.legalName || c.name}
            description={[c.taxId ? `NIU ${c.taxId}` : null, `${c.departments.length} department(s)`].filter(Boolean).join(" · ")}
            actions={
              <div className="flex items-center gap-2">
                <Pill tone={c.level === "FULL" ? "emerald" : "slate"}>{c.level === "FULL" ? "Full accounting" : "Simple"}</Pill>
                {c.vat ? <Pill tone="indigo">VAT</Pill> : null}
                {c.pending ? <Pill tone="amber">{c.pending} to approve</Pill> : null}
              </div>
            }
          >
            <ul className="mb-4 divide-y divide-slate-100 text-sm">
              {c.departments.length ? c.departments.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <span className={d.isActive ? "" : "text-slate-400"}>{d.name} <span className="text-xs text-slate-500">· {d.type}</span></span>
                  {isBoss && companies.length > 1 ? (
                    <select aria-label={`Company of ${d.name}`} className={`${selectClass} h-8 w-auto py-0 text-xs`} value={c.id} onChange={(e) => move(d.id, e.target.value)}>
                      {companies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  ) : null}
                </li>
              )) : <li className="py-2 text-slate-500">No department yet: move one here.</li>}
            </ul>
            <div className="flex gap-2">
              {c.level === "FULL" ? (
                <Button asChild size="sm"><Link href={`/accounting/${c.id}`}><BookOpen className="h-4 w-4" /> Open the books</Link></Button>
              ) : null}
              <Button asChild size="sm" variant="outline"><Link href={`/accounting/${c.id}/settings`}><Settings className="h-4 w-4" /> {c.level === "FULL" ? "Settings" : "Set up Full accounting"}</Link></Button>
            </div>
          </Section>
        ))}
      </div>
      {adding ? <CompanyDialog open onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
