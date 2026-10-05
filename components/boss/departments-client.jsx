"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Pencil, Plus, UserCog, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Field, Pill, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { DepartmentTypePicker } from "@/components/boss/department-type-picker";
import { getDomain } from "@/lib/domains/registry";
import { formatMoney } from "@/lib/format";
import { createDepartment, updateDepartment, setDepartmentHead } from "@/actions/organization";

function DepartmentDialog({ open, onClose, department }) {
  const router = useRouter();
  const editing = Boolean(department?.id);
  const [f, setF] = useState(() => ({
    name: department?.name || "",
    domain: department?.domain || "RESTAURANT",
    description: department?.description || "",
    code: department?.code || "",
    openingCashFloat: department?.openingCashFloat ?? 0,
  }));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const payload = { ...f, code: f.code || undefined };
    const ok = await runWithToast(editing ? updateDepartment({ departmentId: department.id, ...payload }) : createDepartment(payload), {
      success: editing ? "Department updated." : `Department "${f.name}" created.`,
    });
    setBusy(false);
    if (ok) {
      onClose();
      router.refresh();
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${department.name}` : "Create a department"}</DialogTitle>
          <DialogDescription>Name the department, then choose its type.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field label="Department name" required htmlFor="d-name">
              <input id="d-name" autoComplete="off" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Enter the department name" />
            </Field>
            <Field label="Short code" htmlFor="d-code" hint={editing ? "Used on printed references" : "Automatic if empty"}>
              <input id="d-code" autoComplete="off" className={inputClass} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="e.g. RST" maxLength={6} />
            </Field>
          </div>
          <Field label="Department type" required hint={department?.typeLocked ? "The type cannot change: this department already has dishes, records or reports." : null}>
            <DepartmentTypePicker value={f.domain} onChange={(domain) => setF({ ...f, domain })} disabled={department?.typeLocked} />
          </Field>
          <Field label="Description" htmlFor="d-desc">
            <input id="d-desc" className={inputClass} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Optional" />
          </Field>
          {f.domain === "RESTAURANT" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cash in the drawer at the start (FCFA)" htmlFor="d-float" hint="The float the department started with">
                <input id="d-float" inputMode="numeric" className={inputClass} value={f.openingCashFloat} onChange={(e) => setF({ ...f, openingCashFloat: wholeNumber(e.target.value) })} />
              </Field>
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || f.name.trim().length < 2} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editing ? "Save" : "Create department"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DepartmentsClient({ departments, people = [] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(null);
  const addHead = async (d, userId) => {
    const who = people.find((p) => p.id === userId)?.name;
    if (await runWithToast(setDepartmentHead({ departmentId: d.id, userId }), { success: `${who} is now a head of ${d.name}.` })) router.refresh();
  };
  const removeHead = async (d, h) => {
    if (await runWithToast(setDepartmentHead({ departmentId: d.id, userId: h.id, remove: true }), { success: `${h.name} no longer heads ${d.name}.` })) router.refresh();
  };
  const toggle = async (d) => {
    if (await runWithToast(updateDepartment({ departmentId: d.id, isActive: !d.isActive }), { success: d.isActive ? "Department deactivated. History is kept." : "Department active again." })) router.refresh();
  };
  return (
    <div className="space-y-4">
      <Button onClick={() => setDialog({})}><Plus className="h-4 w-4" /> Create a department</Button>
      {departments.length === 0 ? (
        <EmptyState title="No departments" description="Create your first department and choose its type." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => {
            const domain = getDomain(d.domain);
            return (
              <div key={d.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold">{d.name} <span className="text-xs font-normal text-slate-400">{d.code}</span></div>
                    <div className="mt-1 flex gap-1"><Pill tone={domain.color}>{domain.label}</Pill>{!domain.enabled ? <StatusBadge status="COMING_SOON" /> : null}</div>
                  </div>
                  <StatusBadge status={d.isActive ? "ACTIVE" : "INACTIVE"} />
                </div>
                {d.description ? <p className="mt-2 text-sm text-slate-600">{d.description}</p> : null}
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <div data-testid={`heads-${d.name}`}>
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600"><UserCog className="h-3.5 w-3.5 text-emerald-700" /> {d.heads.length === 1 ? "Department head" : "Department heads"}</div>
                    {d.heads.length ? (
                      <ul className="space-y-1">
                        {d.heads.map((h) => (
                          <li key={h.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-sm text-slate-800">
                            <span className="truncate">{h.name}{h.title ? <span className="text-xs text-slate-500"> · {h.title}</span> : null}</span>
                            {d.isActive ? (
                              <button type="button" className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700" onClick={() => removeHead(d, h)} aria-label={`Remove ${h.name} from ${d.name}`}>
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : d.isActive ? (
                      <div className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-1 text-amber-900" data-testid={`no-head-${d.name}`}><AlertTriangle className="h-3.5 w-3.5" /> No department head yet: you run it yourself</div>
                    ) : null}
                    {d.isActive && people.some((p) => !d.heads.some((h) => h.id === p.id)) ? (
                      <select aria-label={`Add a head to ${d.name}`} className={`${selectClass} mt-1.5 h-8 text-xs`} value="" onChange={(e) => e.target.value && addHead(d, e.target.value)}>
                        <option value="">+ Add a department head…</option>
                        {people.filter((p) => !d.heads.some((h) => h.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? ` (${p.title})` : ""}</option>)}
                      </select>
                    ) : null}
                  </div>
                  {domain.enabled ? <div>This month: money in {formatMoney(d.month.moneyIn)} · result {formatMoney(d.month.result)}</div> : null}
                  {d.domain === "RESTAURANT" ? <div>Starting cash {formatMoney(d.openingCashFloat)}</div> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/d/${d.id}`}><Button size="sm" variant="outline">Open</Button></Link>
                  <Link href={`/boss/people?dept=${d.id}`}><Button size="sm" variant="outline"><Users className="h-3.5 w-3.5" /> People</Button></Link>
                  <Button size="sm" variant="outline" onClick={() => setDialog(d)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(d)}>{d.isActive ? "Deactivate" : "Activate"}</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {dialog ? <DepartmentDialog open onClose={() => setDialog(null)} department={dialog.id ? dialog : null} /> : null}
    </div>
  );
}
