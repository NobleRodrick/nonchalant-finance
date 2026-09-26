"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewDailyReport } from "@/actions/daily-report";
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
  FileCheck,
  CheckCircle2,
  XCircle,
  Eye,
  Building2,
  Calendar,
  Loader2,
  Send,
  AlertTriangle,
  ArrowRight,
  Printer,
} from "lucide-react";

export function ReportInboxClient({ initialReports = [], departments = [] }) {
  const router = useRouter();
  const [reports, setReports] = useState(initialReports);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionType, setActionType] = useState("APPROVED");
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");

  const openReviewModal = (report, action) => {
    setSelectedReport(report);
    setActionType(action);
    setReviewNotes(report.reviewNotes || "");
    setReviewModalOpen(true);
  };

  const handleReview = async (e) => {
    e.preventDefault();
    if (!selectedReport) return;

    setSubmitting(true);
    try {
      const res = await reviewDailyReport({
        reportId: selectedReport.id,
        status: actionType,
        reviewNotes,
      });

      if (res.success) {
        toast.success(`Report marked as ${actionType}!`);
        setReviewModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to update report status");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (deptFilter !== "ALL" && r.departmentId !== deptFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2.5">
            <FileCheck className="h-7 w-7 text-emerald-600" />
            Executive Report Review Inbox
          </h1>
          <p className="text-xs text-muted-foreground">
            Review, audit, approve, or return daily departmental closing submissions from operational managers.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2 text-xs">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-2 rounded-md border border-slate-200 bg-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUBMITTED">Awaiting Review (Submitted)</option>
            <option value="APPROVED">Approved</option>
            <option value="RETURNED">Returned for Correction</option>
          </select>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 px-2 rounded-md border border-slate-200 bg-white"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredReports.length === 0 ? (
        <Card className="border-dashed border-2 bg-slate-50/50 py-12 text-center text-xs text-muted-foreground">
          No daily reports matching the selected filters.
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => {
            const metrics = report.totalsJson || {};
            const isAwaiting = report.status === "SUBMITTED";

            return (
              <Card
                key={report.id}
                className={`border transition-shadow hover:shadow-md ${
                  isAwaiting ? "border-blue-300 bg-blue-50/20" : "border-slate-200 bg-white"
                }`}
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900">
                            {report.department?.name}
                          </h3>
                          <Badge
                            className={`text-[10px] font-bold ${
                              report.status === "APPROVED"
                                ? "bg-emerald-600 text-white"
                                : report.status === "SUBMITTED"
                                ? "bg-blue-600 text-white"
                                : "bg-amber-600 text-white"
                            }`}
                          >
                            {report.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>Date: {new Date(report.reportDate).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>Submitted by: {report.submittedBy?.name || "Manager"}</span>
                          {report.submittedAt && (
                            <>
                              <span>•</span>
                              <span>{new Date(report.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReviewModal(report, "RETURNED")}
                        className="text-xs border-amber-300 text-amber-800 hover:bg-amber-50 h-8"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1 text-amber-600" />
                        Return with Notes
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => openReviewModal(report, "APPROVED")}
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-8"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Approve Report
                      </Button>
                    </div>
                  </div>

                  {/* Financial Metrics Summary Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Net Sales</span>
                      <span className="font-extrabold text-slate-900 font-mono text-sm">
                        {Number(metrics.netSales || 0).toLocaleString()} FCFA
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Cash Handover</span>
                      <span className="font-extrabold text-purple-700 font-mono text-sm">
                        {Number(metrics.actualHandover || 0).toLocaleString()} FCFA
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Remaining in Drawer</span>
                      <span className="font-extrabold text-blue-700 font-mono text-sm">
                        {Number(metrics.cashRemaining || 0).toLocaleString()} FCFA
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Stock Value</span>
                      <span className="font-extrabold text-slate-900 font-mono text-sm">
                        {Number(metrics.totalStockValue || 0).toLocaleString()} FCFA
                      </span>
                    </div>
                  </div>

                  {/* Notes if provided */}
                  {report.notes && (
                    <div className="text-xs text-slate-600 bg-white p-2.5 rounded-md border border-slate-100">
                      <strong className="text-slate-800">Operator Notes:</strong> {report.notes}
                    </div>
                  )}

                  {report.reviewNotes && (
                    <div className="text-xs text-amber-900 bg-amber-50 p-2.5 rounded-md border border-amber-200">
                      <strong>CEO Review Notes:</strong> {report.reviewNotes}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === "APPROVED" ? "Approve Daily Close" : "Return Report for Correction"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "APPROVED"
                ? `You are confirming and approving the financial close for ${selectedReport?.department?.name}.`
                : `Send feedback or instructions back to ${selectedReport?.department?.name} to reconcile discrepancies.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReview} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Reviewer Notes (Optional for approval, required for return)</label>
              <textarea
                rows={3}
                required={actionType === "RETURNED"}
                placeholder={
                  actionType === "APPROVED"
                    ? "e.g. Verified and confirmed cash deposit."
                    : "e.g. Please explain 5,000 FCFA cash variance in evening shift drawer."
                }
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full p-2.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setReviewModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className={`text-white font-bold ${
                  actionType === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : actionType === "APPROVED" ? "Confirm Approval" : "Return Report"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
