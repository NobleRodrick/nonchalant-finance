"use client";

import { useMemo } from "react";
import { CloudOff } from "lucide-react";
import { Banner } from "@/components/kit/primitives";
import { DailyReportDocument } from "@/components/reports/daily-report-document";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { usePendingEffects } from "@/lib/offline/react";
import { overlayReport } from "@/lib/offline/overlay";
import { countOf } from "@/lib/format";

const LOCKED = ["SUBMITTED", "REVIEWED", "APPROVED"];

/**
 * Today's report as the department head sees it: the server's live report plus the records this
 * computer made that are not on the server yet (a frozen, sent report is shown as it was sent).
 */
export function LiveReport({ departmentId, dateKey, renderedAt, model, frozen, canSubmit, notes, reviewNotes }) {
  const effects = usePendingEffects(departmentId, renderedAt);
  const view = useMemo(() => (frozen ? model : overlayReport(model, effects, { dateKey })), [frozen, model, effects, dateKey]);
  return (
    <>
      {view.pendingCount ? (
        <Banner tone="warn">
          <CloudOff className="mr-1.5 inline h-4 w-4 align-[-3px]" />
          These figures include {countOf(view.pendingCount, "record")} made on this computer that {view.pendingCount === 1 ? "is" : "are"} not on the server yet. A report sent now reaches the Boss after them, with them.
        </Banner>
      ) : null}
      <ReportToolbar
        departmentId={departmentId}
        dateKey={dateKey}
        status={view.status}
        locked={Boolean(frozen) || LOCKED.includes(view.status)}
        pendingSend={!frozen && view.locked && !LOCKED.includes(model.status)}
        canSubmit={canSubmit}
        cash={view.cash}
        totals={{ moneyIn: view.money.moneyIn, moneyOut: view.money.moneyOut, result: view.money.result, stockValue: view.stock.totals.value, debts: view.debts.closing }}
        notes={notes}
        reviewNotes={reviewNotes}
      />
      <DailyReportDocument model={view} />
    </>
  );
}
