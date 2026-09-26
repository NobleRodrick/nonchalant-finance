"use client";

import { useState } from "react";
import { recordCashHandover } from "@/actions/restaurant";
import { submitDailyReport } from "@/actions/daily-report";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  HandCoins,
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Building2,
  Loader2,
  DollarSign,
  Send,
  Printer,
} from "lucide-react";

export function DailyCloseTab({
  dailyCloseData,
  accounts = [],
  departmentId,
  onRefresh,
}) {
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [submitReportModalOpen, setSubmitReportModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Handover form
  const [handoverAmount, setHandoverAmount] = useState("");
  const [recipientName, setRecipientName] = useState("CEO");
  const [reference, setReference] = useState("");
  const [handoverAccountId, setHandoverAccountId] = useState(accounts[0]?.id || "");

  // Daily report submit form
  const [reportNotes, setReportNotes] = useState("");
  const [countedCash, setCountedCash] = useState("");

  const metrics = dailyCloseData?.metrics || {};
  const status = dailyCloseData?.status || "DRAFT";
  const existingReport = dailyCloseData?.existingReport;

  const handleRecordHandover = async (e) => {
    e.preventDefault();
    const amount = Number(handoverAmount);
    if (!amount || amount <= 0) {
      toast.error("Valid handover amount is required");
      return;
    }

    setLoading(true);
    try {
      const res = await recordCashHandover({
        departmentId,
        amount,
        recipientName,
        reference,
        accountId: handoverAccountId || null,
      });

      if (res.success) {
        toast.success(`Cash handover of ${amount.toLocaleString()} FCFA recorded!`);
        setHandoverModalOpen(false);
        setHandoverAmount("");
        setReference("");
        onRefresh();
      } else {
        toast.error(res.error || "Failed to record handover");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitDailyReport = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await submitDailyReport({
        departmentId,
        date: dailyCloseData?.reportDate,
        notes: reportNotes,
        countedCash: countedCash ? Number(countedCash) : null,
      });

      if (res.success) {
        toast.success("Daily close report submitted to Boss successfully!");
        setSubmitReportModalOpen(false);
        onRefresh();
      } else {
        toast.error(res.error || "Failed to submit report");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case "APPROVED":
        return <Badge className="bg-emerald-600 text-white font-bold">APPROVED BY BOSS</Badge>;
      case "SUBMITTED":
        return <Badge className="bg-blue-600 text-white font-bold">SUBMITTED (AWAITING REVIEW)</Badge>;
      case "RETURNED":
        return <Badge className="bg-amber-600 text-white font-bold">RETURNED FOR CORRECTION</Badge>;
      default:
        return <Badge variant="outline" className="text-slate-600">DRAFT (NOT SUBMITTED)</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with status and main action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Daily Kitchen & Operations Close
            </h2>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-muted-foreground">
            Reconcile all cash movements, plate sales, and handover cash to the CEO before daily closing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setHandoverModalOpen(true)}
            className="border-slate-300 text-slate-800 text-xs font-semibold h-9"
          >
            <HandCoins className="h-4 w-4 mr-1 text-blue-600" />
            Hand Over Cash to CEO
          </Button>

          <Button
            onClick={() => setSubmitReportModalOpen(true)}
            disabled={status === "SUBMITTED" || status === "APPROVED"}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 shadow-sm"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {status === "SUBMITTED" ? "Report Submitted" : status === "APPROVED" ? "Close Approved" : "Submit Daily Close to Boss"}
          </Button>
        </div>
      </div>

      {/* Review Notes Alert if returned */}
      {status === "RETURNED" && existingReport?.reviewNotes && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs space-y-1">
          <span className="font-bold flex items-center gap-1.5 text-amber-800">
            <AlertCircle className="h-4 w-4" /> Boss Feedback / Return Notes:
          </span>
          <p>{existingReport.reviewNotes}</p>
        </div>
      )}

      {/* Key Cash Reconciliation Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Cash Received</span>
            <span className="text-2xl font-extrabold text-emerald-700 font-mono block">
              {(metrics.totalCashIn || 0).toLocaleString()} FCFA
            </span>
            <span className="text-[11px] text-muted-foreground">
              Cash Sales ({(metrics.cashSales || 0).toLocaleString()}) + Recovered Debts ({(metrics.debtPaymentsReceived || 0).toLocaleString()})
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cash Outflows (Paid)</span>
            <span className="text-2xl font-extrabold text-rose-700 font-mono block">
              {(metrics.totalCashOut || 0).toLocaleString()} FCFA
            </span>
            <span className="text-[11px] text-muted-foreground">
              Purchases ({(metrics.cashPurchases || 0).toLocaleString()}) + Opex ({(metrics.operatingExpenses || 0).toLocaleString()})
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs bg-blue-50/40 border-blue-200/60">
          <CardContent className="p-4 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Expected Cash Available</span>
            <span className="text-2xl font-extrabold text-blue-900 font-mono block">
              {(metrics.expectedCashAvailable || 0).toLocaleString()} FCFA
            </span>
            <span className="text-[11px] text-blue-700/80">
              Drawer Balance Before CEO Handover
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Handed Over to CEO</span>
            <span className="text-2xl font-extrabold text-purple-700 font-mono block">
              {(metrics.actualHandover || 0).toLocaleString()} FCFA
            </span>
            <span className="text-[11px] font-semibold text-slate-700">
              Drawer Remaining: {(metrics.cashRemaining || 0).toLocaleString()} FCFA
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Detail Breakdown Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dishes Sold Today */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold">Dishes Sold Today</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {dailyCloseData?.dishSummary?.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No dishes configured.</div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                {dailyCloseData?.dishSummary?.map((d) => (
                  <div key={d.id} className="p-3 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{d.name}</span>
                      <span className="text-muted-foreground block text-[11px]">
                        {d.sellingPrice?.toLocaleString()} FCFA / plate
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-emerald-700 font-mono text-sm block">
                        {d.platesSold} plates sold
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {d.salesValue?.toLocaleString()} FCFA
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CEO Handovers Today */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold">CEO Cash Handovers Today</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHandoverModalOpen(true)}
              className="h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" /> Log Handover
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {dailyCloseData?.handovers?.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No handovers logged yet today. Remember to log cash given to the CEO.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                {dailyCloseData?.handovers?.map((h) => (
                  <div key={h.id} className="p-3 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">Handover to {h.recipientName}</span>
                      {h.reference && (
                        <span className="text-muted-foreground block text-[11px]">Ref: {h.reference}</span>
                      )}
                    </div>
                    <span className="font-extrabold font-mono text-purple-700 text-sm">
                      {Number(h.amount || 0).toLocaleString()} FCFA
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Handover Modal */}
      <Dialog open={handoverModalOpen} onOpenChange={setHandoverModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Cash Handover to CEO</DialogTitle>
            <DialogDescription>
              Record the physical cash handed over from this department&apos;s drawer to executive management.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordHandover} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Handover Amount (FCFA) *</label>
              <Input
                type="number"
                required
                min="100"
                placeholder="e.g. 50000"
                value={handoverAmount}
                onChange={(e) => setHandoverAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Recipient *</label>
              <Input
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Receipt / Reference</label>
              <Input
                placeholder="e.g. Mid-day deposit slip #102"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            {accounts.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Deduct from Drawer / Account</label>
                <select
                  value={handoverAccountId}
                  onChange={(e) => setHandoverAccountId(e.target.value)}
                  className="w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-xs"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({Number(acc.balance || 0).toLocaleString()} FCFA)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setHandoverModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Handover"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Submit Daily Report Modal */}
      <Dialog open={submitReportModalOpen} onOpenChange={setSubmitReportModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Daily Closing Report</DialogTitle>
            <DialogDescription>
              This packages an immutable financial snapshot of today&apos;s sales, debts, purchases, and cash handovers and sends it to the Boss&apos;s Review Inbox.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitDailyReport} className="space-y-4 py-2 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Net Sales:</span>
                <span className="font-bold font-mono">{(metrics.netSales || 0).toLocaleString()} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Cash Handed Over:</span>
                <span className="font-bold font-mono text-purple-700">
                  {(metrics.actualHandover || 0).toLocaleString()} FCFA
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Expected Remaining:</span>
                <span className="font-bold font-mono text-blue-700">
                  {(metrics.cashRemaining || 0).toLocaleString()} FCFA
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Physical Counted Cash in Drawer (Optional)</label>
              <Input
                type="number"
                placeholder="Counted cash amount"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Enter your physical cash count to calculate any drawer variance.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Shift Notes & Observations</label>
              <Input
                placeholder="Notes for the CEO/Boss regarding today's shift"
                value={reportNotes}
                onChange={(e) => setReportNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setSubmitReportModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-bold" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit to Boss Inbox"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
