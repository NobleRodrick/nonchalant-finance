"use client";

import { useState } from "react";
import { Loader2, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { textareaClass } from "@/components/kit/primitives";
import { formatMoney } from "@/lib/format";
import { useRecorder } from "@/lib/offline/react";
import { voidSpec } from "@/lib/offline/specs";
import { cn } from "@/lib/utils";

export const UNDO_REASONS = ["Entered by mistake", "Wrong dish", "Wrong quantity", "Wrong payment method", "Customer cancelled"];

/**
 * Undo a sale recorded by mistake. Nothing is deleted: the sale stays in History marked
 * "Void" with the reason, its plates go back to stock, its money leaves the day's totals and
 * a debt it opened is cancelled. "Undo and fix" also puts its dishes back in the basket so the
 * sale can be recorded again correctly.
 *
 * Works offline too: the undo is saved on this computer and sent after the sale itself.
 *
 * `sale`: { id, referenceNo, net, gross, discount, lines: [{ dishId, name, quantity }], method, debtRef, debtId, customer }
 */
export function UndoSaleDialog({ sale, departmentId, dateKey, onClose, onUndone, onFix }) {
  const record = useRecorder();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(null);
  if (!sale) return null;
  const plates = sale.lines?.filter((l) => l.quantity > 0) || [];
  const name = sale.pending || sale.referenceNo === "Not sent yet" ? "" : ` ${sale.referenceNo}`;

  const run = async (fix) => {
    setBusy(fix ? "fix" : "undo");
    const out = await record(voidSpec({ departmentId, dateKey, row: { ...sale, type: "SALE" }, type: "SALE", reason }), {
      success: fix ? `Sale${name} undone. Its dishes are back in the basket: correct it and record it again.` : `Sale${name} undone.`,
    });
    setBusy(null);
    if (!out) return;
    if (fix && onFix) onFix(sale);
    onUndone?.(sale, out);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Undo sale{name}?</DialogTitle>
          <DialogDescription>Use this when the sale was a mistake. It stays in History marked “Void”, with your reason.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-700" data-testid="undo-effects">
          {plates.length ? <li>Plates go back to stock: {plates.map((l) => `${l.quantity} × ${l.name}`).join(", ")}</li> : null}
          <li>{formatMoney(sale.net)} is removed from today&apos;s money{sale.method === "CASH" ? " and from the cash drawer" : ""}.</li>
          {sale.debtRef ? <li>Debt {sale.debtRef}{sale.customer ? ` of ${sale.customer}` : ""} is cancelled.</li> : null}
        </ul>
        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">Why? <span className="text-rose-600">*</span></div>
          <div className="mb-2 flex flex-wrap gap-2">
            {UNDO_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r} className={cn("rounded-full border px-3 py-1 text-xs", reason === r ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50")}>
                {r}
              </button>
            ))}
          </div>
          <textarea aria-label="Reason" className={textareaClass} rows={2} placeholder="Or write the reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>Keep the sale</Button>
          <div className="flex flex-wrap gap-2">
            {onFix && plates.length ? (
              <Button variant="outline" disabled={Boolean(busy) || reason.trim().length < 3} onClick={() => run(true)}>
                {busy === "fix" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Undo and fix
              </Button>
            ) : null}
            <Button variant="destructive" disabled={Boolean(busy) || reason.trim().length < 3} onClick={() => run(false)}>
              {busy === "undo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Undo sale
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
