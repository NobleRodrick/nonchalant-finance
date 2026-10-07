"use client";

import { useState } from "react";
import { Ban, Bird, Egg, HandCoins, Lock, NotebookPen, Pill as PillIcon, Plus, RotateCcw, Scale, Skull, Wheat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { CheckoutFields, checkoutInput, checkoutReady } from "@/components/trade/pos";
import { useRecorder } from "@/lib/offline/react";
import { farmBatchSpec, farmCloseSpec, farmEventSpec, farmSellSpec } from "@/lib/production/specs";
import { BATCH_KINDS, EVENT_LABELS, eventKindsFor } from "@/lib/farm/farm-math";
import { formatMoney } from "@/lib/format";

const decimal = (v) => String(v ?? "").replace(",", ".").replace(/[^0-9.]/g, "");
const ICONS = { MORTALITY: Skull, FEED: Wheat, TREATMENT: PillIcon, WEIGHT: Scale, PRODUCE: Egg, ADDITION: Bird, NOTE: NotebookPen };

/** A new batch (band, field, pond) or its details. */
export function BatchDialog({ departmentId, batch = null, todayKey, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState(() => ({ kind: batch?.kind || "POULTRY", name: batch?.name || "", location: batch?.location || "", breed: batch?.breed || "", unit: batch?.unit || "", initialCount: batch ? String(batch.initialCount) : "", startKey: batch?.startKey || todayKey, expectedEndKey: batch?.expectedEndKey || "", note: batch?.note || "" }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: k === "initialCount" ? decimal(e.target.value) : e.target.value });
  const k = BATCH_KINDS[f.kind];
  const submit = async () => {
    setBusy(true);
    const out = await record(farmBatchSpec(departmentId, { ...(batch ? { id: batch.id } : {}), ...f, name: f.name.trim(), unit: f.unit.trim() || k.unit, initialCount: Number(f.initialCount) || 0, expectedEndKey: f.expectedEndKey || null }), { success: batch ? "Batch saved." : `${f.name.trim()} started.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={batch ? batch.name : "Start a batch"} description="A band of chickens or pigs, a field and its season, or a fish pond's cycle: its costs, deaths, produce and sales are followed until it is closed." footer={<SubmitButton busy={busy} disabled={!f.name.trim() || f.initialCount === ""} onClick={submit}>{batch ? "Save" : "Start the batch"}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="What" htmlFor="fb-k"><select id="fb-k" className={selectClass} value={f.kind} onChange={set("kind")} disabled={Boolean(batch)}>{Object.entries(BATCH_KINDS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}</select></Field>
        <Field label="Name" required htmlFor="fb-n" className="sm:col-span-2"><input id="fb-n" className={inputClass} value={f.name} onChange={set("name")} placeholder={f.kind === "CROP" ? "Maize field A – season 1" : f.kind === "FISH" ? "Pond 2 – tilapia" : "Broilers house 2 – October"} /></Field>
        <Field label={k.live ? `Number put in` : "Area"} required htmlFor="fb-c"><input id="fb-c" className={inputClass} inputMode="decimal" value={f.initialCount} onChange={set("initialCount")} /></Field>
        <Field label="Counted in" htmlFor="fb-u"><input id="fb-u" className={inputClass} value={f.unit} onChange={set("unit")} placeholder={k.unit} /></Field>
        <Field label={f.kind === "CROP" ? "Crop / variety" : "Breed / species"} htmlFor="fb-b"><input id="fb-b" className={inputClass} value={f.breed} onChange={set("breed")} placeholder={f.kind === "CROP" ? "Maize CMS 8704" : f.kind === "FISH" ? "Tilapia" : "Cobb 500"} /></Field>
        <Field label={f.kind === "CROP" ? "Field" : f.kind === "FISH" ? "Pond" : "House / pen"} htmlFor="fb-l"><input id="fb-l" className={inputClass} value={f.location} onChange={set("location")} /></Field>
        {!batch ? <Field label="Started on" htmlFor="fb-s"><input id="fb-s" type="date" className={inputClass} value={f.startKey} onChange={set("startKey")} /></Field> : null}
        <Field label="Expected end (sale, harvest)" htmlFor="fb-e"><input id="fb-e" type="date" className={inputClass} value={f.expectedEndKey} onChange={set("expectedEndKey")} /></Field>
        <Field label="Notes" htmlFor="fb-no" className="sm:col-span-3"><textarea id="fb-no" rows={2} className={textareaClass} value={f.note} onChange={set("note")} /></Field>
      </div>
    </FormDialog>
  );
}

/** One record of the batch: deaths, feed, treatment, weighing, produce, animals added, note. */
function EventDialog({ departmentId, batch, kind, inputs, produce, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ quantity: "", unit: "", productId: "", note: "" });
  const [busy, setBusy] = useState(false);
  const products = kind === "PRODUCE" ? produce : ["FEED", "TREATMENT"].includes(kind) ? inputs : [];
  const product = products.find((p) => p.id === f.productId);
  const over = product && kind !== "PRODUCE" && Number(f.quantity) > product.quantity;
  const valid = (kind === "NOTE" ? f.note.trim() : Number(f.quantity) > 0) && !over;
  const submit = async () => {
    setBusy(true);
    const out = await record(farmEventSpec(departmentId, batch, { kind, quantity: Number(f.quantity) || 0, unit: f.unit.trim() || null, productId: f.productId || null, note: f.note.trim() || null }, EVENT_LABELS[kind].toLowerCase()), { success: "Recorded." });
    setBusy(false);
    if (out) onClose();
  };
  const unitHint = product?.unit || (kind === "MORTALITY" || kind === "ADDITION" ? batch.unit : kind === "WEIGHT" ? "kg (average)" : kind === "FEED" ? "kg, bags" : kind === "PRODUCE" ? "trays, kg, litres" : "");
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`${EVENT_LABELS[kind]} · ${batch.name}`} description={kind === "FEED" || kind === "TREATMENT" ? "Taken from the stock of inputs: its cost goes to this batch. Without a product it is only noted (record its expense on the batch)." : kind === "PRODUCE" ? "Eggs, harvest, milk, fish caught. Into the stock of a product, it can be sold at the till." : undefined} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {products.length ? (
          <Field label={kind === "PRODUCE" ? "Into the stock of" : "From the stock of"} htmlFor="fe-p" className="sm:col-span-2"><select id="fe-p" className={selectClass} value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}><option value="">{kind === "PRODUCE" ? "Not into stock (only noted)" : "Not from stock (only noted)"}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.quantity} {p.unit})</option>)}</select></Field>
        ) : null}
        {kind !== "NOTE" ? <Field label={`Quantity${unitHint ? ` (${unitHint})` : ""}`} required htmlFor="fe-q"><input id="fe-q" autoFocus className={inputClass} inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: decimal(e.target.value) })} /></Field> : null}
        {kind !== "NOTE" && !product ? <Field label="Unit" htmlFor="fe-u"><input id="fe-u" className={inputClass} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder={unitHint} /></Field> : null}
        <Field label={kind === "MORTALITY" ? "Cause (if known)" : "Note"} required={kind === "NOTE"} htmlFor="fe-n" className="sm:col-span-2"><input id="fe-n" className={inputClass} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      {over ? <p className="text-sm text-rose-700">Only {product.quantity} {product.unit} in stock.</p> : null}
    </FormDialog>
  );
}

function SellDialog({ departmentId, batch, debtors, onClose }) {
  const record = useRecorder();
  const live = BATCH_KINDS[batch.kind].live;
  const [f, setF] = useState({ quantity: "", unit: live ? batch.unit : "kg", amount: "", buyer: "" });
  const [pay, setPay] = useState({ paymentMethod: "CASH", tendered: "", reference: "", debtorId: "", debtorName: "", debtorPhone: "", discount: "", discountReason: "" });
  const [busy, setBusy] = useState(false);
  const over = live && Number(f.quantity) > batch.figures.alive;
  const valid = Number(f.quantity) > 0 && Number(f.amount) > 0 && !over && checkoutReady(pay, Number(f.amount));
  const submit = async () => {
    setBusy(true);
    const c = checkoutInput(pay);
    const out = await record(farmSellSpec(departmentId, batch, { quantity: Number(f.quantity), unit: f.unit.trim() || null, amount: Number(f.amount), buyer: f.buyer.trim() || null, paymentMethod: c.paymentMethod, reference: c.reference, ...(c.debtorId ? { debtorId: c.debtorId } : c.debtor ? { debtor: c.debtor } : {}) }), { success: (d) => `Sale ${d?.referenceNo || ""} recorded.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Sell from ${batch.name}`} description={live ? `${batch.figures.alive} ${batch.unit} alive. Eggs and produce in stock are sold at the till.` : "Harvest sold directly from the field."} footer={<><span className="mr-auto text-sm">{Number(f.quantity) > 0 && Number(f.amount) > 0 ? <>≈ <strong className="tabular-nums">{formatMoney(Math.round(Number(f.amount) / Number(f.quantity)))}</strong> per {f.unit || "unit"}</> : null}</span><SubmitButton busy={busy} disabled={!valid} onClick={submit}><HandCoins className="h-4 w-4" /> Record the sale</SubmitButton></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Quantity sold" required htmlFor="fs-q"><input id="fs-q" autoFocus className={inputClass} inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: decimal(e.target.value) })} /></Field>
        <Field label="Unit" htmlFor="fs-u"><input id="fs-u" className={inputClass} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
        <Field label="Total amount (FCFA)" required htmlFor="fs-a"><input id="fs-a" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} /></Field>
        <Field label="Buyer" htmlFor="fs-b" className="sm:col-span-3"><input id="fs-b" className={inputClass} value={f.buyer} onChange={(e) => setF({ ...f, buyer: e.target.value })} placeholder="Market trader, restaurant…" /></Field>
      </div>
      {over ? <p className="text-sm text-rose-700">Only {batch.figures.alive} {batch.unit} are alive.</p> : null}
      <CheckoutFields value={pay} onChange={setPay} total={Number(f.amount) || 0} debtors={debtors} canDiscount={false} discountLimit={0} idPrefix="fs" />
    </FormDialog>
  );
}

function CloseDialog({ departmentId, batch, onClose }) {
  const record = useRecorder();
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = batch.figures.live && batch.figures.alive > 0;
  const submit = async () => {
    setBusy(true);
    const out = await record(farmCloseSpec(departmentId, batch, { note: note.trim() || null, force }), { success: `${batch.name} closed.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Close ${batch.name}`} description={`Profit of the batch: ${formatMoney(batch.figures.profit)}. A closed batch takes no more records (it can be reopened).`} footer={<SubmitButton busy={busy} disabled={alive && !force} onClick={submit}><Lock className="h-4 w-4" /> Close the batch</SubmitButton>}>
      {alive ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> {batch.figures.alive} {batch.unit} are still counted alive: close anyway</label> : null}
      <Field label="Note" htmlFor="fc-n"><input id="fc-n" className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="All sold, harvest done…" /></Field>
    </FormDialog>
  );
}

/** Every action on a batch, by its kind and status. */
export function BatchActions({ departmentId, batch, inputs, produce, debtors, perms, todayKey }) {
  const record = useRecorder();
  const [dialog, setDialog] = useState(null);
  const active = batch.status === "ACTIVE";
  return (
    <div className="flex flex-wrap gap-2" data-testid="batch-actions">
      {active && perms.sell ? eventKindsFor(batch.kind).map((k) => {
        const Icon = ICONS[k];
        return <Button key={k} variant="outline" onClick={() => setDialog({ kind: "event", event: k })}><Icon className="h-4 w-4" /> {EVENT_LABELS[k]}</Button>;
      }) : null}
      {active && perms.sell ? <Button onClick={() => setDialog({ kind: "sell" })}><HandCoins className="h-4 w-4" /> Sell</Button> : null}
      {perms.manageStock ? <Button variant="ghost" onClick={() => setDialog({ kind: "edit" })}><Plus className="h-4 w-4" /> Details</Button> : null}
      {perms.manageStock ? (active ? <Button variant="ghost" onClick={() => setDialog({ kind: "close" })}><Ban className="h-4 w-4" /> Close</Button> : <Button variant="ghost" onClick={() => record(farmCloseSpec(departmentId, batch, { reopen: true }), { success: "Reopened." })}><RotateCcw className="h-4 w-4" /> Reopen</Button>) : null}
      {dialog?.kind === "event" ? <EventDialog departmentId={departmentId} batch={batch} kind={dialog.event} inputs={inputs} produce={produce} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "sell" ? <SellDialog departmentId={departmentId} batch={batch} debtors={debtors} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "close" ? <CloseDialog departmentId={departmentId} batch={batch} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "edit" ? <BatchDialog departmentId={departmentId} batch={batch} todayKey={todayKey} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

/** The "Start a batch" button of the batches page. */
export function NewBatchButton({ departmentId, todayKey }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Start a batch</Button>
      {open ? <BatchDialog departmentId={departmentId} todayKey={todayKey} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
