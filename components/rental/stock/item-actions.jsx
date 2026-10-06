"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ClipboardCheck, MapPin, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { itemAdjustSpec, itemArchiveSpec } from "@/lib/rental/specs";
import { ItemDialog } from "./item-dialog";

function CountDialog({ departmentId, item, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ counted: String(item.inStock), reason: "" });
  const [busy, setBusy] = useState(false);
  const change = f.counted === "" ? 0 : Number(f.counted) - item.inStock;
  const submit = async () => {
    setBusy(true);
    const out = await record(itemAdjustSpec(departmentId, item, { kind: "count", counted: Number(f.counted), reason: f.reason.trim() }), { success: `${item.name}: count corrected.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Correct the count of ${item.name}`} description={`The app expects ${item.inStock} in the store (${item.owned} owned: ${item.out} out, ${item.damaged} damaged, ${item.inRepair} in repair, ${item.missing} missing).`} footer={<SubmitButton busy={busy} disabled={f.counted === "" || !change || f.reason.trim().length < 3} onClick={submit}>Save the count</SubmitButton>}>
      <Field label="Good units counted in the store" required htmlFor="ct-n" hint={change ? `${change > 0 ? "+" : ""}${change} on the units owned` : "Same as expected"}><input id="ct-n" className={inputClass} inputMode="numeric" value={f.counted} onChange={(e) => setF({ ...f, counted: wholeNumber(e.target.value) })} /></Field>
      <Field label="Reason" required htmlFor="ct-r"><input id="ct-r" className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. stock count of 30 September" /></Field>
    </FormDialog>
  );
}

function PlaceDialog({ departmentId, item, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ toLocation: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(itemAdjustSpec(departmentId, item, { kind: "transfer", toLocation: f.toLocation.trim(), reason: f.reason.trim() }), { success: `${item.name} moved to ${f.toLocation.trim()}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Move ${item.name}`} description={`Kept now: ${item.location || "no place recorded"}.`} footer={<SubmitButton busy={busy} disabled={!f.toLocation.trim()} onClick={submit}>Move</SubmitButton>}>
      <Field label="New storage place" required htmlFor="pl-to"><input id="pl-to" className={inputClass} value={f.toLocation} onChange={(e) => setF({ ...f, toLocation: e.target.value })} /></Field>
      <Field label="Note" htmlFor="pl-r"><input id="pl-r" className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
    </FormDialog>
  );
}

function ArchiveDialog({ departmentId, item, onClose }) {
  const record = useRecorder();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const restore = Boolean(item.archivedAt);
  const submit = async () => {
    setBusy(true);
    const out = await record(itemArchiveSpec(departmentId, item, restore ? { restore: true } : { reason: reason.trim() }), { success: restore ? `${item.name} is back in the stock.` : `${item.name} archived.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={restore ? `Bring back ${item.name}` : `Archive ${item.name}?`} description={restore ? "It will be offered in bookings again." : "It will no longer be offered in bookings. Nothing is deleted: its history stays."} footer={<SubmitButton busy={busy} variant={restore ? "default" : "destructive"} disabled={!restore && reason.trim().length < 3} onClick={submit}>{restore ? "Bring back" : "Archive"}</SubmitButton>}>
      {!restore ? <Field label="Reason" required htmlFor="ar-r"><input id="ar-r" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. all sold, no longer rented" /></Field> : null}
    </FormDialog>
  );
}

/** The buttons of a stock line (edit, correct the count, move, archive / bring back). */
export function ItemActions({ departmentId, item, categories, canManage, canArchive }) {
  const router = useRouter();
  const [open, setOpen] = useState(null);
  const close = () => {
    setOpen(null);
    router.refresh();
  };
  if (!canManage && !canArchive) return null;
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {canManage && !item.archivedAt ? (
        <>
          <Button size="sm" variant="outline" onClick={() => setOpen("edit")}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          <Button size="sm" variant="outline" onClick={() => setOpen("count")}><ClipboardCheck className="h-3.5 w-3.5" /> Correct the count</Button>
          <Button size="sm" variant="outline" onClick={() => setOpen("place")}><MapPin className="h-3.5 w-3.5" /> Move</Button>
        </>
      ) : null}
      {canArchive ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen("archive")}>{item.archivedAt ? <><ArchiveRestore className="h-3.5 w-3.5" /> Bring back</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}</Button>
      ) : null}
      {open === "edit" ? <ItemDialog departmentId={departmentId} item={item} categories={categories} onClose={close} /> : null}
      {open === "count" ? <CountDialog departmentId={departmentId} item={item} onClose={close} /> : null}
      {open === "place" ? <PlaceDialog departmentId={departmentId} item={item} onClose={close} /> : null}
      {open === "archive" ? <ArchiveDialog departmentId={departmentId} item={item} onClose={close} /> : null}
    </div>
  );
}
