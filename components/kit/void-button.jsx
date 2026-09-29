"use client";

import { useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { textareaClass } from "@/components/kit/primitives";

/**
 * Void with a mandatory reason. Nothing is deleted: the record stays visible as "Void" and
 * its effects (money, plates, debts) are reversed. `onVoid(reason)` records the void (and shows
 * its message); it resolves truthy when done.
 */
export function VoidButton({ onVoid, reference, what = "record", label = "Void", size = "sm", variant = "ghost" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const ok = await onVoid(reason.trim());
    setBusy(false);
    if (ok) {
      setOpen(false);
      setReason("");
    }
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => setOpen(true)} aria-label={`${label} ${reference || what}`}>
        <Ban className="h-3.5 w-3.5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void {reference || `this ${what}`}?</DialogTitle>
            <DialogDescription>
              The {what} stays in the history marked "Void" and is removed from every total. Plates, money and debts it changed are put back.
              To correct a mistake, void it and record it again.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium text-slate-700" htmlFor="void-reason">
            Reason <span className="text-rose-600">*</span>
          </label>
          <textarea id="void-reason" className={textareaClass} placeholder="Why is it voided?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={submit}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
