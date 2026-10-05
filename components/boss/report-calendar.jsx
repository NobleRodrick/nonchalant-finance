import Link from "next/link";
import { cn } from "@/lib/utils";

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", timeZone: "UTC" });

const CELL = {
  APPROVED: ["✓", "bg-emerald-500 text-white", "Approved"],
  SUBMITTED: ["●", "bg-sky-500 text-white", "Sent, waiting for you"],
  REVIEWED: ["●", "bg-sky-500 text-white", "Sent, waiting for you"],
  RETURNED: ["↺", "bg-amber-400 text-slate-900", "Returned"],
  DRAFT: ["·", "bg-slate-100 text-slate-500", "Not sent yet"],
  MISSING: ["·", "bg-slate-100 text-slate-500", "Not sent yet"],
  LATE: ["!", "bg-rose-500 text-white", "Missing"],
  FUTURE: ["", "bg-white", ""],
};

const dayLabel = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return DAY_LABEL.format(new Date(Date.UTC(y, m - 1, d)));
};

/** Departments × days grid of daily report statuses. */
export function ReportCalendar({ calendar }) {
  if (!calendar.rows.length) return <p className="text-sm text-slate-500">No restaurant departments.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="py-1 pr-2 text-left font-medium">Department</th>
            {calendar.days.map((k) => (
              <th key={k} className="px-1 py-1 text-center font-medium">{dayLabel(k)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendar.rows.map((r) => (
            <tr key={r.departmentId}>
              <td className="whitespace-nowrap py-1 pr-2 font-medium">{r.name}</td>
              {r.cells.map((c) => {
                const [sym, cls, label] = CELL[c.status] || CELL.MISSING;
                const cell = (
                  <span title={`${r.name} · ${c.dateKey} · ${label}`} className={cn("mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold", cls)}>
                    {sym}
                  </span>
                );
                return (
                  <td key={c.dateKey} className="px-1 py-1 text-center">
                    {c.reportId ? <Link href={`/boss/daily-reports/${c.reportId}`} aria-label={`${r.name} ${c.dateKey} ${label}`}>{cell}</Link> : cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        {["APPROVED", "SUBMITTED", "RETURNED", "LATE", "DRAFT"].map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn("flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold", CELL[s][1])}>{CELL[s][0]}</span>
            {CELL[s][2]}
          </span>
        ))}
      </div>
    </div>
  );
}
