"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, inputClass, selectClass, textareaClass, Money, Plates, StatusBadge } from "@/components/kit/primitives";
import { runWithToast, useIdempotencyKey, wholeNumber } from "@/components/kit/client";
import { ProofUpload } from "@/components/kit/proof-upload";
import { VoidButton } from "@/components/kit/void-button";
import { formatMoney } from "@/lib/format";
import {
  addDish, editDish, addStockToDish, correctDishCount, setDayOpeningStock, getDishHistory, voidStockRecord,
} from "@/actions/menu-stock";

function DialogShell({ open, onOpenChange, title, description, children, footer, wide = false }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? "max-w-3xl" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-4">{children}</div>
        {footer ? <DialogFooter className="gap-2">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton({ busy, disabled, children, onClick }) {
  return (
    <Button onClick={onClick} disabled={busy || disabled}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

// ─── Add dish ────────────────────────────────────────────────────────────────
export function AddDishDialog({ open, onOpenChange, departmentId }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", unitPrice: "", openingPlates: "", description: "", lowStockLevel: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: k === "name" || k === "description" ? e.target.value : wholeNumber(e.target.value) });
  const valid = f.name.trim().length >= 2 && Number(f.unitPrice) > 0;
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(addDish({ departmentId, ...f, openingPlates: f.openingPlates || 0 }), { success: `"${f.name.trim()}" added to the menu.` });
    setBusy(false);
    if (ok) {
      setF({ name: "", unitPrice: "", openingPlates: "", description: "", lowStockLevel: "" });
      onOpenChange(false);
      router.refresh();
    }
  };
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Add a dish"
      description="A dish is one line of the menu and of the stock."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <SubmitButton busy={busy} disabled={!valid} onClick={submit}>Add dish</SubmitButton>
        </>
      }
    >
      <Field label="Dish name" required htmlFor="dish-name">
        <input id="dish-name" autoComplete="off" className={inputClass} value={f.name} onChange={set("name")} placeholder="Enter the dish name" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Unit price (FCFA)" required htmlFor="dish-price" hint="Price of one plate">
          <input id="dish-price" inputMode="numeric" className={inputClass} value={f.unitPrice} onChange={set("unitPrice")} placeholder="0" />
        </Field>
        <Field label="Plates available now" htmlFor="dish-opening" hint="Leave empty if none yet">
          <input id="dish-opening" inputMode="numeric" className={inputClass} value={f.openingPlates} onChange={set("openingPlates")} placeholder="0" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Warn me when plates fall to" htmlFor="dish-low" hint="Optional">
          <input id="dish-low" inputMode="numeric" className={inputClass} value={f.lowStockLevel} onChange={set("lowStockLevel")} placeholder="0 = no warning" />
        </Field>
        <Field label="Description" htmlFor="dish-desc" hint="Optional">
          <input id="dish-desc" className={inputClass} value={f.description} onChange={set("description")} placeholder="What is in the plate" />
        </Field>
      </div>
      {valid && Number(f.openingPlates) > 0 ? (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {f.openingPlates} plate(s) × {formatMoney(f.unitPrice)} = <strong>{formatMoney(Number(f.openingPlates) * Number(f.unitPrice))}</strong> of stock.
        </p>
      ) : null}
    </DialogShell>
  );
}

// ─── Edit dish ───────────────────────────────────────────────────────────────
export function EditDishDialog({ open, onOpenChange, departmentId, dish }) {
  const router = useRouter();
  const [f, setF] = useState(() => (dish ? { name: dish.name, unitPrice: dish.unitPrice, description: dish.description || "", lowStockLevel: dish.lowStockLevel || "", costPrice: dish.costPrice || "" } : null));
  const [busy, setBusy] = useState(false);
  if (!dish || !f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: ["name", "description"].includes(k) ? e.target.value : wholeNumber(e.target.value) });
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(editDish({ departmentId, id: dish.dishId, ...f }), { success: "Dish updated." });
    setBusy(false);
    if (ok) {
      onOpenChange(false);
      router.refresh();
    }
  };
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${dish.name}`}
      description='To change the number of plates, use "Add stock" or "Correct a count" so every change is traceable.'
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <SubmitButton busy={busy} disabled={f.name.trim().length < 2 || !(Number(f.unitPrice) > 0)} onClick={submit}>Save changes</SubmitButton>
        </>
      }
    >
      <Field label="Dish name" required htmlFor="edit-name">
        <input id="edit-name" autoComplete="off" className={inputClass} value={f.name} onChange={set("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Unit price (FCFA)" required htmlFor="edit-price" hint="New sales use the new price; past sales keep theirs.">
          <input id="edit-price" inputMode="numeric" className={inputClass} value={f.unitPrice} onChange={set("unitPrice")} />
        </Field>
        <Field label="Cost per plate (FCFA)" htmlFor="edit-cost" hint="Optional: shows the stock value at cost.">
          <input id="edit-cost" inputMode="numeric" className={inputClass} value={f.costPrice} onChange={set("costPrice")} placeholder="Unknown" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Warn me when plates fall to" htmlFor="edit-low">
          <input id="edit-low" inputMode="numeric" className={inputClass} value={f.lowStockLevel} onChange={set("lowStockLevel")} placeholder="0 = no warning" />
        </Field>
        <Field label="Description" htmlFor="edit-desc">
          <input id="edit-desc" className={inputClass} value={f.description} onChange={set("description")} />
        </Field>
      </div>
    </DialogShell>
  );
}

// ─── Add stock ───────────────────────────────────────────────────────────────
export function AddStockDialog({ open, onOpenChange, departmentId, dishes, initialDishId, dateKey, canBuy }) {
  const router = useRouter();
  const [key, renew] = useIdempotencyKey();
  const blank = { dishId: initialDishId || "", newName: "", newPrice: "", plates: "", bought: false, amountPaid: "", supplier: "", paymentMethod: "CASH", note: "", attachmentIds: [] };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const isNew = f.dishId === "__new";
  const dish = dishes.find((d) => d.dishId === f.dishId);
  const price = isNew ? Number(f.newPrice) || 0 : dish?.unitPrice || 0;
  const plates = Number(f.plates) || 0;
  const valid = plates > 0 && (isNew ? f.newName.trim().length >= 2 && Number(f.newPrice) > 0 : Boolean(dish)) && (!f.bought || Number(f.amountPaid) > 0);
  const submit = async () => {
    setBusy(true);
    const payload = {
      departmentId, dateKey, plates, note: f.note, idempotencyKey: key,
      ...(isNew ? { newDish: { name: f.newName, unitPrice: f.newPrice } } : { dishId: f.dishId }),
      ...(f.bought ? { bought: true, amountPaid: f.amountPaid, supplier: f.supplier, paymentMethod: f.paymentMethod, attachmentIds: f.attachmentIds } : {}),
    };
    const ok = await runWithToast(addStockToDish(payload), {
      success: (d) => `${plates} plate(s) added${d.movement?.referenceNo ? ` (${d.movement.referenceNo})` : ""}${d.purchase ? ` · purchase ${d.purchase.referenceNo}` : ""}.`,
    });
    setBusy(false);
    if (ok) {
      renew();
      onOpenChange(false);
      router.refresh();
    }
  };
  const set = (k, num = false) => (e) => setF({ ...f, [k]: num ? wholeNumber(e.target.value) : e.target.value });
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Add stock"
      description="Plates prepared, bought ready-made or received."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <SubmitButton busy={busy} disabled={!valid} onClick={submit}>Add {plates || ""} plate{plates === 1 ? "" : "s"}</SubmitButton>
        </>
      }
    >
      <Field label="Dish" required htmlFor="stock-dish">
        <select id="stock-dish" className={selectClass} value={f.dishId} onChange={set("dishId")}>
          <option value="">Choose a dish…</option>
          {dishes.map((d) => (
            <option key={d.dishId} value={d.dishId}>
              {d.name} — {formatMoney(d.unitPrice)} · {d.available} left
            </option>
          ))}
          <option value="__new">+ A new dish…</option>
        </select>
      </Field>
      {isNew ? (
        <div className="grid gap-4 rounded-lg border border-dashed border-slate-300 p-3 sm:grid-cols-2">
          <Field label="New dish name" required htmlFor="stock-new-name">
            <input id="stock-new-name" autoComplete="off" className={inputClass} value={f.newName} onChange={set("newName")} placeholder="Enter the dish name" />
          </Field>
          <Field label="Unit price (FCFA)" required htmlFor="stock-new-price">
            <input id="stock-new-price" inputMode="numeric" className={inputClass} value={f.newPrice} onChange={set("newPrice", true)} />
          </Field>
        </div>
      ) : null}
      <Field label="Plates added" required htmlFor="stock-plates">
        <input id="stock-plates" inputMode="numeric" className={inputClass} value={f.plates} onChange={set("plates", true)} placeholder="0" />
      </Field>
      {canBuy ? (
        <div className="rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={f.bought} onChange={(e) => setF({ ...f, bought: e.target.checked })} className="h-4 w-4" />
            This stock was bought (record a purchase too)
          </label>
          {f.bought ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Amount paid (FCFA)" required htmlFor="stock-paid">
                <input id="stock-paid" inputMode="numeric" className={inputClass} value={f.amountPaid} onChange={set("amountPaid", true)} />
              </Field>
              <Field label="Paid by" htmlFor="stock-method">
                <select id="stock-method" className={selectClass} value={f.paymentMethod} onChange={set("paymentMethod")}>
                  <option value="CASH">Cash (from the drawer)</option>
                  <option value="MOMO">Mobile Money</option>
                  <option value="BANK_TRANSFER">Bank</option>
                  <option value="CREDIT">Supplier credit (not paid yet)</option>
                </select>
              </Field>
              <Field label="Supplier" htmlFor="stock-supplier" className="sm:col-span-2">
                <input id="stock-supplier" className={inputClass} value={f.supplier} onChange={set("supplier")} placeholder="Who sold it (optional)" />
              </Field>
              <div className="sm:col-span-2">
                <ProofUpload departmentId={departmentId} value={f.attachmentIds} onChange={(ids) => setF({ ...f, attachmentIds: ids })} label="Attach the receipt (optional)" />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <Field label="Note" htmlFor="stock-note">
        <input id="stock-note" className={inputClass} value={f.note} onChange={set("note")} placeholder="Optional" />
      </Field>
      {valid ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {isNew ? f.newName : dish.name}: {isNew ? 0 : dish.available} → <strong>{(isNew ? 0 : dish.available) + plates}</strong> plates · stock value +{formatMoney(plates * price)}
          {f.bought ? <> · purchase of {formatMoney(f.amountPaid)}</> : null}
        </p>
      ) : null}
    </DialogShell>
  );
}

// ─── Correct a count ─────────────────────────────────────────────────────────
const REASONS = [
  { id: "COUNT", label: "Physical count" },
  { id: "SPOILED", label: "Spoiled / thrown away" },
  { id: "STAFF", label: "Given to staff" },
  { id: "OTHER", label: "Other (describe)" },
];

export function CorrectCountDialog({ open, onOpenChange, departmentId, dishes, initialDishId, dateKey, isToday }) {
  const router = useRouter();
  const [f, setF] = useState({ dishId: initialDishId || "", counted: "", reasonType: "COUNT", reasonText: "" });
  const [busy, setBusy] = useState(false);
  const dish = dishes.find((d) => d.dishId === f.dishId);
  const expected = dish ? (isToday ? dish.available : dish.closing) : 0;
  const diff = f.counted === "" ? 0 : Number(f.counted) - expected;
  const valid = dish && f.counted !== "" && diff !== 0 && (f.reasonType !== "OTHER" || f.reasonText.trim()) && !(f.reasonType === "SPOILED" && diff > 0);
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(correctDishCount({ departmentId, dateKey, ...f }), { success: "Count corrected." });
    setBusy(false);
    if (ok) {
      onOpenChange(false);
      router.refresh();
    }
  };
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Correct a count"
      description="Enter the plates you actually counted. The difference is recorded with its reason."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <SubmitButton busy={busy} disabled={!valid} onClick={submit}>Save the count</SubmitButton>
        </>
      }
    >
      <Field label="Dish" required htmlFor="count-dish">
        <select id="count-dish" className={selectClass} value={f.dishId} onChange={(e) => setF({ ...f, dishId: e.target.value })}>
          <option value="">Choose a dish…</option>
          {dishes.map((d) => (
            <option key={d.dishId} value={d.dishId}>{d.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="The system says">
          <div className="flex h-10 items-center rounded-md bg-slate-50 px-3 text-sm font-semibold">{dish ? <Plates value={expected} unit /> : "—"}</div>
        </Field>
        <Field label="You counted" required htmlFor="count-value">
          <input id="count-value" inputMode="numeric" className={inputClass} value={f.counted} onChange={(e) => setF({ ...f, counted: wholeNumber(e.target.value) })} />
        </Field>
      </div>
      <Field label="Reason" required htmlFor="count-reason">
        <select id="count-reason" className={selectClass} value={f.reasonType} onChange={(e) => setF({ ...f, reasonType: e.target.value })}>
          {REASONS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </Field>
      <Field label={f.reasonType === "OTHER" ? "Describe the reason" : "Details"} required={f.reasonType === "OTHER"} htmlFor="count-text">
        <input id="count-text" className={inputClass} value={f.reasonText} onChange={(e) => setF({ ...f, reasonText: e.target.value })} placeholder="Optional details" />
      </Field>
      {dish && f.counted !== "" ? (
        <p className={`rounded-md px-3 py-2 text-sm ${diff < 0 ? "bg-rose-50 text-rose-900" : diff > 0 ? "bg-emerald-50 text-emerald-900" : "bg-slate-50 text-slate-600"}`}>
          {diff === 0 ? "The count matches the system." : (
            <>
              Difference: <strong>{diff > 0 ? "+" : ""}{diff}</strong> plate(s), <Money value={diff * dish.unitPrice} signed /> of stock value.
              {f.reasonType === "SPOILED" && diff > 0 ? " Spoiled plates can only lower the count." : ""}
            </>
          )}
        </p>
      ) : null}
    </DialogShell>
  );
}

// ─── Opening stock ───────────────────────────────────────────────────────────
export function OpeningStockDialog({ open, onOpenChange, departmentId, rows, dateKey, dateLabel }) {
  const router = useRouter();
  const active = useMemo(() => rows.filter((r) => r.isActive), [rows]);
  const [values, setValues] = useState(() => Object.fromEntries(rows.filter((r) => r.isActive).map((r) => [r.dishId, String(r.opening)])));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const changed = active.filter((r) => values[r.dishId] !== undefined && values[r.dishId] !== "" && Number(values[r.dishId]) !== r.opening);
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(
      setDayOpeningStock({ departmentId, dateKey, reason, entries: changed.map((r) => ({ dishId: r.dishId, actual: Number(values[r.dishId]) })) }),
      { success: `Opening stock updated for ${changed.length} dish(es).` }
    );
    setBusy(false);
    if (ok) {
      onOpenChange(false);
      router.refresh();
    }
  };
  return (
    <DialogShell
      wide
      open={open}
      onOpenChange={onOpenChange}
      title={`Opening stock — ${dateLabel}`}
      description="The opening of a day is the closing of the day before. Change it only if your morning count is different; everything after it is recalculated."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <SubmitButton busy={busy} disabled={!changed.length || reason.trim().length < 3} onClick={submit}>
            Save {changed.length || ""} change{changed.length === 1 ? "" : "s"}
          </SubmitButton>
        </>
      }
    >
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Dish</th>
              <th className="px-3 py-2 text-right font-medium">Calculated opening</th>
              <th className="px-3 py-2 text-right font-medium">Actual opening</th>
              <th className="px-3 py-2 text-right font-medium">Difference</th>
            </tr>
          </thead>
          <tbody>
            {active.map((r) => {
              const v = values[r.dishId];
              const diff = v === undefined || v === "" ? 0 : Number(v) - r.opening;
              return (
                <tr key={r.dishId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.opening}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      aria-label={`Actual opening of ${r.name}`}
                      inputMode="numeric"
                      className={`${inputClass} h-9 w-24 text-right`}
                      value={v ?? ""}
                      onChange={(e) => setValues({ ...values, [r.dishId]: String(wholeNumber(e.target.value)) })}
                    />
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${diff < 0 ? "text-rose-700" : diff > 0 ? "text-emerald-700" : "text-slate-400"}`}>
                    {diff > 0 ? "+" : ""}
                    {diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Field label="Reason" required htmlFor="opening-reason">
        <input id="opening-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: morning count" />
      </Field>
    </DialogShell>
  );
}

// ─── History of a dish ───────────────────────────────────────────────────────
const MOVE_LABELS = {
  OPENING: "Opening plates", STOCK_ADDED: "Stock added", SOLD: "Sold", SPOILED: "Spoiled", CORRECTION: "Count corrected",
  OPENING_CORRECTION: "Opening stock set", REVERSAL: "Reversal", PREPARATION: "Stock added", USAGE: "Sold", WASTE: "Spoiled", DAMAGE: "Spoiled", ADJUSTMENT: "Count corrected", PURCHASE: "Stock added",
};

export function DishHistoryDialog({ open, onOpenChange, departmentId, dish, canManage }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    if (dish) getDishHistory({ departmentId, dishId: dish.dishId }).then((res) => alive && setRows(res?.success ? res.data : []));
    return () => {
      alive = false;
    };
  }, [dish, departmentId]);
  if (!dish) return null;
  return (
    <DialogShell wide open={open} onOpenChange={onOpenChange} title={`History — ${dish.name}`} description="Every change of plates, newest first, with who recorded it.">
      {rows === null ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No stock changes yet.</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-2 py-2 text-left font-medium">When</th>
                <th className="px-2 py-2 text-left font-medium">What</th>
                <th className="px-2 py-2 text-right font-medium">Plates</th>
                <th className="px-2 py-2 text-right font-medium">After</th>
                <th className="px-2 py-2 text-left font-medium">By</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const q = Number(m.quantity);
                const sign = ["SOLD", "SPOILED", "USAGE", "WASTE", "DAMAGE"].includes(m.type) ? -q : q;
                const ref = m.referenceNo || m.transaction?.referenceNo;
                const voidable = canManage && !m.voidedAt && ["STOCK_ADDED", "CORRECTION", "SPOILED", "OPENING_CORRECTION"].includes(m.type) && !m.purchaseId && !String(m.reason || "").startsWith("Void of");
                return (
                  <tr key={m.id} className={`border-b border-slate-100 ${m.voidedAt ? "opacity-50" : ""}`}>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500">{new Date(m.date).toLocaleString("en-GB", { timeZone: "Africa/Douala", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{MOVE_LABELS[m.type] || m.type} {ref ? <span className="text-xs text-slate-500">· {ref}</span> : null}</div>
                      {m.reason || m.notes ? <div className="text-xs text-slate-500">{m.reason || m.notes}</div> : null}
                      {m.voidedAt ? <StatusBadge status="VOIDED" /> : null}
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums ${sign < 0 ? "text-rose-700" : "text-emerald-700"}`}>{sign > 0 ? "+" : ""}{sign}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{Number(m.balanceAfter ?? 0)}</td>
                    <td className="px-2 py-2 text-xs">{m.user?.name}</td>
                    <td className="px-2 py-2 text-right">
                      {voidable ? <VoidButton what="stock record" reference={ref} action={(reason) => voidStockRecord({ departmentId, movementId: m.id, reason })} /> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DialogShell>
  );
}
