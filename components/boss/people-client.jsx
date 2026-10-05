"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Pencil, KeyRound, Loader2, Copy, Star, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createEmployee, updateEmployee, resetEmployeePassword } from "@/actions/organization";
import { generateTempPassword } from "@/lib/password-utils";
import { DataTable, Field, Pill, Section, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { getDomain } from "@/lib/domains/registry";
import { ROLE_LABELS, TITLE_SUGGESTIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * The departments a head is assigned to: tick one or several; the star marks the one they open
 * first. Every ticked department is a department they head.
 */
function DepartmentPicker({ departments, value, onChange }) {
  const selected = new Map(value.map((m) => [m.departmentId, m]));
  const toggle = (id) => {
    if (selected.has(id)) {
      const next = value.filter((m) => m.departmentId !== id);
      if (selected.get(id).isPrimary && next.length) next[0] = { ...next[0], isPrimary: true };
      onChange(next);
    } else onChange([...value, { departmentId: id, isPrimary: value.length === 0 }]);
  };
  const makePrimary = (id) => onChange(value.map((m) => ({ ...m, isPrimary: m.departmentId === id })));
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Departments this person heads">
      {departments.map((d) => {
        const on = selected.has(d.id);
        const domain = getDomain(d.domain);
        return (
          <div key={d.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", on ? "border-emerald-500 bg-emerald-50/60" : "border-slate-200", !d.isActive && "opacity-60")}>
            <input id={`dp-${d.id}`} type="checkbox" checked={on} onChange={() => toggle(d.id)} />
            <label htmlFor={`dp-${d.id}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="block truncate text-sm font-medium">{d.name}{!d.isActive ? " (inactive)" : ""}</span>
              <Pill tone={domain.color}>{domain.label}</Pill>
            </label>
            {on ? (
              <button type="button" onClick={() => makePrimary(d.id)} className={cn("flex items-center gap-1 text-[11px]", selected.get(d.id).isPrimary ? "font-semibold text-amber-700" : "text-slate-500 hover:text-slate-800")} title="The department they open first">
                <Star className={cn("h-3.5 w-3.5", selected.get(d.id).isPrimary && "fill-amber-500 text-amber-500")} /> {selected.get(d.id).isPrimary ? "Opens first" : "Open first"}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function PersonDialog({ onClose, departments, person, onSaved, defaultDeptId }) {
  const isEdit = Boolean(person);
  const [form, setForm] = useState(() =>
    person
      ? { name: person.name, email: person.email, phone: person.phone || "", title: person.title || "", isActive: person.isActive, memberships: person.memberships.map((m) => ({ departmentId: m.departmentId, isPrimary: m.isPrimary })) }
      : { name: "", email: "", phone: "", title: "", isActive: true, tempPassword: generateTempPassword(), memberships: defaultDeptId ? [{ departmentId: defaultDeptId, isPrimary: true }] : [] }
  );
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isBoss = person?.role === "ADMIN";

  const submit = async (e) => {
    e.preventDefault();
    if (!isBoss && !form.memberships.length) return toast.error("Tick at least one department this person heads.");
    setBusy(true);
    const res = isEdit
      ? await updateEmployee({ employeeId: person.id, name: form.name, phone: form.phone, title: form.title, isActive: form.isActive, ...(isBoss ? {} : { memberships: form.memberships }) })
      : await createEmployee(form);
    setBusy(false);
    if (!res?.success) return toast.error(res?.error || "Could not save");
    toast.success(isEdit ? "Saved" : `Account created. Temporary password: ${form.tempPassword}`, { duration: isEdit ? 4000 : 15000 });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${person.name}` : "Add a department head"}</DialogTitle>
          <DialogDescription>
            {isBoss ? "Your own account: you oversee every department." : "Give the person a title, then tick every department they head. One person can head several departments."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required htmlFor="p-name"><Input id="p-name" autoComplete="off" placeholder="Full name" value={form.name} onChange={set("name")} required /></Field>
            <Field label="Email" required htmlFor="p-email" hint={isEdit ? "Used to sign in; cannot be changed." : "Used to sign in."}><Input id="p-email" type="email" autoComplete="off" placeholder="name@example.com" value={form.email} onChange={set("email")} required disabled={isEdit} /></Field>
            {!isBoss ? (
              <Field label="Title" htmlFor="p-title" hint="Any title you give (Accountant, Manager …). The role stays Department head.">
                <input id="p-title" list="title-suggestions" autoComplete="off" className={inputClass} value={form.title} onChange={set("title")} placeholder="e.g. Accountant" maxLength={60} />
                <datalist id="title-suggestions">{TITLE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
              </Field>
            ) : null}
            <Field label="Phone" htmlFor="p-phone"><Input id="p-phone" value={form.phone} onChange={set("phone")} placeholder="Optional" /></Field>
          </div>
          {!isBoss ? (
            <Field label="Departments this person heads" required>
              <DepartmentPicker departments={departments} value={form.memberships} onChange={(memberships) => setForm({ ...form, memberships })} />
            </Field>
          ) : null}
          {!isEdit ? (
            <Field label="Temporary password" htmlFor="p-temp" hint="Share it privately; the person changes it from their profile.">
              <div className="flex gap-2">
                <Input id="p-temp" value={form.tempPassword} onChange={set("tempPassword")} required />
                <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard?.writeText(form.tempPassword); toast.success("Copied"); }} aria-label="Copy password"><Copy className="h-4 w-4" /></Button>
              </div>
            </Field>
          ) : !isBoss ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Account active (unchecking signs the person out everywhere)
            </label>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {isEdit ? "Save" : "Create account"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PeopleClient({ initialData, currentUserId, focusDeptId = null }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(null); // { person } | { person: null }
  const departments = initialData?.departments || [];
  const allUsers = initialData?.users || [];
  const [deptFilter, setDeptFilter] = useState(focusDeptId || "");
  const [q, setQ] = useState("");
  const users = allUsers.filter((u) => {
    if (deptFilter && !u.memberships.some((m) => m.departmentId === deptFilter)) return false;
    const text = `${u.name} ${u.email} ${u.title || ""}`.toLowerCase();
    return !q.trim() || text.includes(q.trim().toLowerCase());
  });
  const focused = departments.find((d) => d.id === deptFilter);
  const focusedHeads = focused ? allUsers.filter((u) => u.isActive && u.role === "HEAD" && u.memberships.some((m) => m.departmentId === focused.id)) : [];

  const resetPassword = async (u) => {
    const temp = generateTempPassword();
    if (!confirm(`Reset ${u.name}'s password? They will be signed out and must use the new temporary password.`)) return;
    const res = await resetEmployeePassword({ employeeId: u.id, tempPassword: temp });
    if (res?.success) {
      navigator.clipboard?.writeText(temp);
      toast.success(`New temporary password for ${u.name}: ${temp} (copied)`, { duration: 15000 });
    } else toast.error(res?.error || "Could not reset password");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Button onClick={() => setDialog({ person: null })} disabled={!departments.length}><UserPlus className="h-4 w-4" /> Add a department head</Button>
        <Field label="Department" htmlFor="pf-dept" className="w-56">
          <select id="pf-dept" className={selectClass} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">Everyone</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Search" htmlFor="pf-q" className="w-56">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input id="pf-q" className={cn(inputClass, "pl-8")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, e-mail or title" />
          </div>
        </Field>
      </div>
      {focused && focused.isActive && !focusedHeads.length ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{focused.name} has no department head: you run it yourself until you add one (or edit a person and tick {focused.name}).</p>
      ) : null}
      {!departments.length ? <p className="text-sm text-amber-700">Create a department first.</p> : null}
      <Section>
        <DataTable
          rowClassName={(u) => (!u.isActive ? "opacity-60" : "")}
          columns={[
            {
              key: "n",
              label: "Person",
              render: (u) => (
                <div>
                  <div className="font-medium">{u.name}{u.id === currentUserId ? " (you)" : ""}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </div>
              ),
            },
            {
              key: "r",
              label: "Title and role",
              render: (u) => (
                <div className="space-y-1">
                  {u.title ? <div className="text-sm">{u.title}</div> : null}
                  <Pill tone={u.role === "ADMIN" ? "violet" : "emerald"}>{ROLE_LABELS[u.role]}</Pill>
                </div>
              ),
            },
            {
              key: "d",
              label: "Departments",
              render: (u) =>
                u.role === "ADMIN" ? <span className="text-xs text-slate-500">Oversees every department</span> : (
                  <ul className="flex flex-wrap gap-1 text-xs">
                    {u.memberships.map((m) => (
                      <li key={m.id} className="flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5">
                        {m.isPrimary ? <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-label="opens first" /> : null}
                        {m.department?.name}
                      </li>
                    ))}
                    {!u.memberships.length ? <li className="text-rose-700">No department</li> : null}
                  </ul>
                ),
            },
            { key: "s", label: "Status", render: (u) => <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} /> },
            {
              key: "a",
              label: "",
              align: "right",
              render: (u) => (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => setDialog({ person: u })}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  {u.id !== currentUserId ? <Button size="sm" variant="ghost" onClick={() => resetPassword(u)}><KeyRound className="h-3.5 w-3.5" /> Reset password</Button> : null}
                </div>
              ),
            },
          ]}
          rows={users}
          empty={deptFilter || q ? "Nobody matches." : "Nobody yet."}
        />
      </Section>
      {dialog ? (
        <PersonDialog
          key={dialog.person?.id || "new"}
          onClose={() => setDialog(null)}
          departments={departments}
          person={dialog.person}
          defaultDeptId={deptFilter || null}
          onSaved={() => { setDialog(null); router.refresh(); }}
        />
      ) : null}
    </div>
  );
}
