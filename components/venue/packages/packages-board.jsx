"use client";

import { useState } from "react";
import { BedDouble, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Field, Money, StatusBadge, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { removePackage, savePackage, setPackageActive } from "@/actions/venue";

const KIND_LABELS = { ROOM: "Room(s) at a rooms department", SERVICE: "Service", OTHER: "Other" };
const blankItem = () => ({ kind: "SERVICE", label: "", quantity: 1, nights: 1 });

function PackageDialog({ departmentId, pkg, onClose }) {
  const [f, setF] = useState(() => ({
    name: pkg?.name || "",
    description: pkg?.description || "",
    price: pkg?.price ?? "",
    items: pkg?.items?.length ? pkg.items.map((i) => ({ kind: i.kind, label: i.label, quantity: i.quantity, nights: i.nights ?? 1 })) : [blankItem()],
  }));
  const [busy, setBusy] = useState(false);
  const setItem = (n, patch) => setF({ ...f, items: f.items.map((it, i) => (i === n ? { ...it, ...patch } : it)) });
  const valid = f.name.trim().length >= 2 && f.price !== "";
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(savePackage({ departmentId, id: pkg?.id, name: f.name.trim(), description: f.description, price: f.price, items: f.items.filter((i) => i.label.trim()) }), { success: pkg ? "Package updated." : "Package created." });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <FormDialog
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={pkg ? `Change ${pkg.name}` : "New package"}
      description="A package is the hall with extra benefits. Its price is added to the price of the date; bookings already made keep the package as it was sold."
      footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>{pkg ? "Save" : "Create the package"}</SubmitButton>}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" required htmlFor="pk-name" className="sm:col-span-2">
          <input id="pk-name" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Hall + free room at Executive Stay" />
        </Field>
        <Field label="Price added to the hall (FCFA)" required htmlFor="pk-price">
          <input id="pk-price" className={inputClass} inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: wholeNumber(e.target.value) })} />
        </Field>
      </div>
      <Field label="Description" htmlFor="pk-description">
        <textarea id="pk-description" className={textareaClass} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div className="space-y-2">
        <div className="text-sm font-medium text-slate-700">What it includes</div>
        {f.items.map((it, n) => (
          <div key={n} className="grid items-end gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-[1fr_2fr_5rem_5rem_auto]">
            <Field label="Kind" htmlFor={`pk-kind-${n}`}>
              <select id={`pk-kind-${n}`} className={selectClass} value={it.kind} onChange={(e) => setItem(n, { kind: e.target.value })}>
                {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="What" htmlFor={`pk-label-${n}`}>
              <input id={`pk-label-${n}`} className={inputClass} value={it.label} onChange={(e) => setItem(n, { label: e.target.value })} placeholder={it.kind === "ROOM" ? "Free room at Executive Stay" : "Decoration, sound …"} />
            </Field>
            <Field label={it.kind === "ROOM" ? "Rooms" : "Quantity"} htmlFor={`pk-qty-${n}`}>
              <input id={`pk-qty-${n}`} className={inputClass} inputMode="numeric" value={it.quantity} onChange={(e) => setItem(n, { quantity: wholeNumber(e.target.value) })} />
            </Field>
            {it.kind === "ROOM" ? (
              <Field label="Nights" htmlFor={`pk-nights-${n}`}>
                <input id={`pk-nights-${n}`} className={inputClass} inputMode="numeric" value={it.nights} onChange={(e) => setItem(n, { nights: wholeNumber(e.target.value) })} />
              </Field>
            ) : <span />}
            <Button size="icon-sm" variant="ghost" aria-label={`Remove item ${n + 1}`} onClick={() => setF({ ...f, items: f.items.filter((_, i) => i !== n) })}><Trash2 className="h-4 w-4 text-rose-700" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setF({ ...f, items: [...f.items, blankItem()] })}><Plus className="h-4 w-4" /> Add an item</Button>
      </div>
    </FormDialog>
  );
}

/** The packages of the venue: what each includes, its price, offered or not. */
export function PackagesBoard({ departmentId, packages, canManage }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const act = async (id, promise, success) => {
    setBusy(id);
    await runWithToast(promise, { success });
    setBusy(null);
  };
  return (
    <div className="space-y-4">
      {canManage ? <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New package</Button> : null}
      {!packages.length ? (
        <EmptyState icon={Sparkles} title="No package yet" description="Offer the hall with extra benefits, e.g. the hall + a free room at Executive Stay, or decoration included." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((p) => (
            <article key={p.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs" data-testid={`package-${p.name}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{p.name}</h3>
                  <p className="text-sm text-slate-600">+ <Money value={p.price} /> on the hall</p>
                </div>
                <StatusBadge status={p.isActive ? "ACTIVE" : "INACTIVE"} label={p.isActive ? "Offered" : "Not offered"} />
              </div>
              {p.description ? <p className="mt-2 text-sm text-slate-600">{p.description}</p> : null}
              <ul className="mt-3 flex-1 space-y-1 text-sm">
                {p.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    {i.kind === "ROOM" ? <BedDouble className="h-4 w-4 text-violet-600" /> : <Sparkles className="h-4 w-4 text-amber-600" />}
                    <span>{i.quantity > 1 ? `${i.quantity} × ` : ""}{i.label}{i.kind === "ROOM" ? ` (${i.nights} night${i.nights > 1 ? "s" : ""})` : ""}</span>
                  </li>
                ))}
                {!p.items.length ? <li className="text-slate-400">Nothing listed.</li> : null}
              </ul>
              {canManage ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /> Change</Button>
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => act(p.id, setPackageActive({ departmentId, packageId: p.id, active: !p.isActive }), p.isActive ? "No longer offered." : "Offered again.")}>{p.isActive ? "Stop offering" : "Offer again"}</Button>
                  <Button size="sm" variant="ghost" className="text-rose-700" disabled={busy === p.id} onClick={() => act(p.id, removePackage({ departmentId, packageId: p.id }), "Package removed.")}>Remove</Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {editing ? <PackageDialog key={editing === "new" ? "new" : editing.id} departmentId={departmentId} pkg={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
