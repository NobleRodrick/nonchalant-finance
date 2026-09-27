"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2, Printer, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Banner, Field, KeyValues, Money, StatusBadge, inputClass, textareaClass } from "@/components/kit/primitives";
import { runWithToast, useLiveRefresh, wholeNumber } from "@/components/kit/client";
import { formatMoney } from "@/lib/format";
import { saveReportDraft, sendReportToBoss } from "@/actions/daily-report";

/** Print, count the cash, add notes and send the day's report to the Boss. */
export function ReportToolbar({ departmentId, dateKey, status, locked, canSubmit, cash, totals, notes: savedNotes, reviewNotes }) {
  useLiveRefresh(locked ? 600 : 30);
  const router = useRouter();
  const [open, setOpen] = useState(null); // "count" | "send"
  const [counted, setCounted] = useState(cash.counted === null ? "" : String(cash.counted));
  const [notes, setNotes] = useState(savedNotes || "");
  const [busy, setBusy] = useState(false);
  const countedNum = counted === "" ? null : Number(counted);
  const variance = countedNum === null ? null : countedNum - cash.shouldRemain;

  const save = async () => {
    setBusy(true);
    const ok = await runWithToast(saveReportDraft({ departmentId, dateKey, countedCash: counted, notes }), { success: "Cash count saved." });
    setBusy(false);
    if (ok) {
      setOpen(null);
      router.refresh();
    }
  };
  const send = async () => {
    setBusy(true);
    const ok = await runWithToast(sendReportToBoss({ departmentId, dateKey, countedCash: counted, notes }), { success: (d) => `Report ${d.referenceNo} sent to the Boss.` });
    setBusy(false);
    if (ok) {
      setOpen(null);
      router.refresh();
    }
  };

  return (
    <div className="print:hidden">
      {reviewNotes ? (
        <Banner tone="warn">
          <strong>Returned by the Boss:</strong> “{reviewNotes}”. Make the corrections, then send the report again.
        </Banner>
      ) : null}
      {locked ? (
        <Banner tone="info">
          <span className="mr-2"><StatusBadge status={status} /></span>
          This report was sent to the Boss. The day is locked; the Boss can return it if something must change.
        </Banner>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        {canSubmit && !locked ? (
          <>
            <Button variant="outline" onClick={() => setOpen("count")}>
              <Calculator className="h-4 w-4" /> {cash.counted === null ? "Count the cash" : `Counted: ${formatMoney(cash.counted)}`}
            </Button>
            <Button onClick={() => setOpen("send")}>
              <Send className="h-4 w-4" /> Send report to Boss
            </Button>
          </>
        ) : null}
      </div>

      <Dialog open={open === "count"} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Count the cash in the drawer</DialogTitle>
            <DialogDescription>Count the notes and coins and enter the total. It is compared with what the drawer should hold.</DialogDescription>
          </DialogHeader>
          <KeyValues rows={[{ label: "The drawer should hold", value: <Money value={cash.shouldRemain} />, strong: true }]} />
          <Field label="Cash counted (FCFA)" required htmlFor="counted-cash">
            <input id="counted-cash" inputMode="numeric" className={inputClass} value={counted} onChange={(e) => setCounted(String(wholeNumber(e.target.value)))} />
          </Field>
          {variance !== null ? (
            <p className={`rounded-md px-3 py-2 text-sm font-medium ${variance === 0 ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
              {variance === 0 ? "Balanced." : `${variance < 0 ? "Shortage" : "Surplus"} of ${formatMoney(Math.abs(variance))}.`}
            </p>
          ) : null}
          <Field label="Notes for the Boss" htmlFor="report-notes">
            <textarea id="report-notes" className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the Boss should know (optional)" />
          </Field>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
            <Button disabled={busy || counted === ""} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "send"} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send the report to the Boss?</DialogTitle>
            <DialogDescription>After sending, nothing on this day can change unless the Boss returns the report.</DialogDescription>
          </DialogHeader>
          <KeyValues
            rows={[
              { label: "Money in", value: <Money value={totals.moneyIn} /> },
              { label: "Money out", value: <Money value={totals.moneyOut} /> },
              { label: "Result", value: <Money value={totals.result} />, strong: true },
              { label: "Closing stock value", value: <Money value={totals.stockValue} /> },
              { label: "Owed by customers", value: <Money value={totals.debts} /> },
              { label: "Cash that should remain", value: <Money value={cash.shouldRemain} /> },
            ]}
          />
          <Field label="Cash counted (FCFA)" required htmlFor="send-counted" error={counted === "" ? "Count the cash before sending." : null}>
            <input id="send-counted" inputMode="numeric" className={inputClass} value={counted} onChange={(e) => setCounted(String(wholeNumber(e.target.value)))} />
          </Field>
          {variance !== null ? (
            <p className={`text-sm font-medium ${variance === 0 ? "text-emerald-700" : "text-rose-700"}`}>
              Variance: {variance === 0 ? "balanced" : `${variance > 0 ? "+" : ""}${formatMoney(variance)}`}
            </p>
          ) : null}
          <Field label="Notes for the Boss" htmlFor="send-notes">
            <textarea id="send-notes" className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
            <Button disabled={busy || counted === ""} onClick={send}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to Boss</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
