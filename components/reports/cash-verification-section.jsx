import { formatDateKey } from "@/lib/timezone";
import { DataTable, KeyValues, Money, Section } from "@/components/kit/primitives";
import { CashCountForm } from "@/components/departments/cash-count-form";

const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank"], ["OTHER", "Other"]];
const date = (k) => formatDateKey(k, { weekday: false });

/**
 * Cash verification of a period (lib/departments/cash-verification): who received the money and
 * how, the counts, what was handed over and what remains — and, for today, the count form.
 * Shared by the reports of every department with a drawer (venue, rental …). `countKind` is the
 * department's cash count operation.
 */
export function CashVerificationSection({ verification: v, cashFlow: cf, drawer, todayKey, departmentId, canCount, includesToday, countKind }) {
  const lastCount = v.counts.at(-1) || null;
  const methods = METHODS.filter(([k]) => k !== "OTHER" || v.byPerson.some((p) => p.OTHER));
  return (
    <Section id="cash" title="Cash verification" description="Who received the money and how, what was counted, handed over and what remains">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DataTable
            dense
            rowKey={(p) => p.receivedBy}
            columns={[
              { key: "receivedBy", label: "Received by" },
              ...methods.map(([k, l]) => ({ key: k, label: l, align: "right", render: (p) => <Money value={p[k] || 0} suffix={false} /> })),
              { key: "count", label: "Payments", align: "right" },
              { key: "total", label: "Total", align: "right", render: (p) => <Money value={p.total} className="font-semibold" /> },
            ]}
            rows={v.byPerson}
            empty="No customer payment in this period."
          />
        </div>
        <KeyValues
          rows={[
            { label: "Recorded as received", value: <Money value={v.recorded} /> },
            { label: "Of which in cash", value: <Money value={v.recordedCash} />, indent: true },
            { label: "Handed over", value: <Money value={v.handedOver} /> },
            cf.handoverPending ? { label: "Waiting for the Boss to confirm", value: <Money value={cf.handoverPending} />, indent: true } : null,
            v.disputed ? { label: "Disputed handovers", value: <Money value={v.disputed} tone="out" />, indent: true } : null,
            { label: "Counted vs expected", value: <Money value={v.countVariance} signed tone={v.countVariance ? "out" : "auto"} /> },
            { label: "Discrepancies", value: <Money value={v.discrepancies} tone={v.discrepancies ? "out" : "auto"} />, strong: true },
            { label: "Remaining to hand over (now)", value: <Money value={v.toHandOver} />, strong: true },
          ]}
        />
      </div>
      {v.counts.length ? (
        <div className="mt-5">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Cash counts</h3>
          <DataTable
            dense
            rowKey={(c) => c.dateKey}
            columns={[
              { key: "dateKey", label: "Date", render: (c) => date(c.dateKey) },
              { key: "countedCash", label: "Counted", align: "right", render: (c) => <Money value={c.countedCash} /> },
              { key: "expectedCash", label: "Expected", align: "right", render: (c) => <Money value={c.expectedCash} /> },
              { key: "variance", label: "Difference", align: "right", render: (c) => <Money value={c.variance} signed tone={c.variance ? "out" : "auto"} /> },
              { key: "notes", label: "Explanation", render: (c) => <span className="text-slate-600">{c.notes || "—"}</span> },
            ]}
            rows={v.counts}
          />
        </div>
      ) : null}
      {canCount && includesToday ? (
        <CashCountForm kind={countKind} departmentId={departmentId} expected={Math.max(0, Math.round(drawer.shouldRemain))} todayKey={todayKey} lastCount={lastCount?.dateKey === todayKey ? lastCount : null} />
      ) : null}
    </Section>
  );
}
