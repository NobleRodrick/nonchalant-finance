import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatAmount, formatMoney, formatPlates, formatStatementAmount } from "@/lib/format";

/** Money on screen: "45 000 FCFA" (suffix optional), tabular digits, red when negative. */
export function Money({ value, className, signed = false, suffix = true, tone = "auto" }) {
  const n = Math.round(Number(value) || 0);
  const color = tone === "auto" ? (n < 0 ? "text-rose-700" : "") : tone === "in" ? "text-emerald-700" : tone === "out" ? "text-rose-700" : "";
  return (
    <span className={cn("tabular-nums whitespace-nowrap", color, className)}>
      {signed && n > 0 ? "+" : ""}
      {suffix ? formatMoney(n) : formatAmount(n)}
    </span>
  );
}

/** Statement figure: negatives in brackets. */
export function StatementAmount({ value, className }) {
  return <span className={cn("tabular-nums whitespace-nowrap", Number(value) < 0 && "text-rose-700", className)}>{formatStatementAmount(value)}</span>;
}

export function Plates({ value, className, unit = false }) {
  const n = Number(value) || 0;
  return (
    <span className={cn("tabular-nums", n < 0 && "text-rose-700", className)}>
      {formatPlates(n)}
      {unit ? <span className="text-slate-500"> plate{Math.abs(n) === 1 ? "" : "s"}</span> : null}
    </span>
  );
}

export function PageHeader({ title, description, actions, eyebrow, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:mb-3">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div> : null}
    </div>
  );
}

const TONES = {
  default: "border-slate-200 bg-white",
  in: "border-emerald-200 bg-emerald-50/60",
  out: "border-rose-200 bg-rose-50/50",
  warn: "border-amber-200 bg-amber-50/60",
  info: "border-sky-200 bg-sky-50/60",
  dark: "border-slate-800 bg-slate-900 text-white",
};

/** Big-number card. */
export function StatCard({ label, value, hint, tone = "default", href, icon: Icon, className }) {
  const dark = tone === "dark";
  const body = (
    <div className={cn("h-full rounded-xl border p-4 shadow-xs", TONES[tone] || TONES.default, href && "transition hover:-translate-y-0.5 hover:shadow-md", className)}>
      <div className={cn("flex items-center justify-between text-xs font-medium", dark ? "text-slate-300" : "text-slate-500")}>
        <span>{label}</span>
        {Icon ? <Icon className={cn("h-4 w-4", dark ? "text-slate-400" : "text-slate-400")} /> : null}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", dark ? "text-white" : "text-slate-900")}>{value}</div>
      {hint ? <div className={cn("mt-1 text-xs", dark ? "text-slate-400" : "text-slate-500")}>{hint}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Section({ title, description, actions, children, className, bodyClassName, id }) {
  return (
    <section id={id} className={cn("rounded-xl border border-slate-200 bg-white shadow-xs print:break-inside-avoid print:shadow-none", className)}>
      {title || actions ? (
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-slate-900">{title}</h2> : null}
            {description ? <p className="text-xs text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, action, icon: Icon }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
      {Icon ? <Icon className="mx-auto mb-2 h-6 w-6 text-slate-400" /> : null}
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

const STATUS = {
  DRAFT: ["Not sent", "bg-slate-100 text-slate-700 ring-slate-200"],
  MISSING: ["Not sent", "bg-slate-100 text-slate-700 ring-slate-200"],
  LATE: ["Missing", "bg-rose-100 text-rose-800 ring-rose-200"],
  SUBMITTED: ["Sent to Boss", "bg-sky-100 text-sky-800 ring-sky-200"],
  REVIEWED: ["Sent to Boss", "bg-sky-100 text-sky-800 ring-sky-200"],
  APPROVED: ["Approved", "bg-emerald-100 text-emerald-800 ring-emerald-200"],
  RETURNED: ["Returned", "bg-amber-100 text-amber-900 ring-amber-200"],
  RECORDED: ["Waiting for Boss", "bg-sky-100 text-sky-800 ring-sky-200"],
  CONFIRMED: ["Confirmed", "bg-emerald-100 text-emerald-800 ring-emerald-200"],
  DISPUTED: ["Disputed", "bg-rose-100 text-rose-800 ring-rose-200"],
  VOIDED: ["Void", "bg-slate-200 text-slate-600 ring-slate-300"],
  UNPAID: ["Unpaid", "bg-rose-100 text-rose-800 ring-rose-200"],
  PARTIALLY_PAID: ["Partly paid", "bg-amber-100 text-amber-900 ring-amber-200"],
  PARTLY_PAID: ["Deposit / partly paid", "bg-amber-100 text-amber-900 ring-amber-200"],
  PAID: ["Paid", "bg-emerald-100 text-emerald-800 ring-emerald-200"],
  CANCELLED: ["Cancelled", "bg-slate-200 text-slate-600 ring-slate-300"],
  OPEN: ["Open", "bg-emerald-100 text-emerald-800 ring-emerald-200"],
  CLOSED: ["Closed", "bg-slate-200 text-slate-700 ring-slate-300"],
  ACTIVE: ["Active", "bg-emerald-100 text-emerald-800 ring-emerald-200"],
  INACTIVE: ["Inactive", "bg-slate-200 text-slate-600 ring-slate-300"],
  COMING_SOON: ["Coming soon", "bg-violet-100 text-violet-800 ring-violet-200"],
  // Event venue: bookings, payments, leads
  RESERVED: ["Reserved", "bg-amber-100 text-amber-900 ring-amber-200"],
  COMPLETED: ["Completed", "bg-slate-200 text-slate-700 ring-slate-300"],
  OVERPAID: ["Overpaid", "bg-violet-100 text-violet-800 ring-violet-200"],
  REFUNDED: ["Refunded", "bg-slate-200 text-slate-600 ring-slate-300"],
  NEW: ["New", "bg-sky-100 text-sky-800 ring-sky-200"],
  CONTACTED: ["Contacted", "bg-cyan-100 text-cyan-800 ring-cyan-200"],
  FOLLOW_UP: ["Follow-up required", "bg-amber-100 text-amber-900 ring-amber-200"],
  NEGOTIATING: ["Negotiating", "bg-violet-100 text-violet-800 ring-violet-200"],
  BOOKED: ["Booked", "bg-emerald-100 text-emerald-800 ring-emerald-200"],
  LOST: ["Lost", "bg-rose-100 text-rose-800 ring-rose-200"],
};

export function StatusBadge({ status, label, className }) {
  const [text, style] = STATUS[status] || [String(status || "").replace(/_/g, " ").toLowerCase(), "bg-slate-100 text-slate-700 ring-slate-200"];
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", style, className)}>{label || text}</span>;
}

/** Small colored label, e.g. a department type or a money type. */
export function Pill({ children, tone = "slate", className }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-800",
    rose: "bg-rose-100 text-rose-800",
    amber: "bg-amber-100 text-amber-900",
    sky: "bg-sky-100 text-sky-800",
    violet: "bg-violet-100 text-violet-800",
    cyan: "bg-cyan-100 text-cyan-800",
    orange: "bg-orange-100 text-orange-800",
    indigo: "bg-indigo-100 text-indigo-800",
    pink: "bg-pink-100 text-pink-800",
  };
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium", tones[tone] || tones.slate, className)}>{children}</span>;
}

export function Field({ label, hint, children, required, className, htmlFor, error }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="text-rose-600"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-xs outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50";
export const selectClass = inputClass;
export const textareaClass =
  "min-h-[76px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

/**
 * Table with optional totals row. columns: [{ key, label, align, render, className, hideOnPrint }]
 */
export function DataTable({ columns, rows, empty = "Nothing to show.", footer, rowKey = (r, i) => r.id || i, rowClassName, dense = false, stickyHeader = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className={cn(stickyHeader && "sticky top-0 z-10 bg-white")}>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            {columns.map((c) => (
              <th key={c.key} className={cn("whitespace-nowrap px-3 py-2 font-medium", c.align === "right" && "text-right", c.align === "center" && "text-center", c.hideOnPrint && "print:hidden", c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-slate-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={rowKey(r, i)} className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50/60", rowClassName?.(r))}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 align-middle", dense ? "py-1.5" : "py-2.5", c.align === "right" && "text-right", c.align === "center" && "text-center", c.hideOnPrint && "print:hidden", c.className)}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer ? <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">{footer}</tfoot> : null}
      </table>
    </div>
  );
}

/** A row of label/value pairs for summaries ("Opening + In − Out = Expected"). */
export function Equation({ items, className }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", className)}>
      {items.map((it, i) => (
        <span key={i} className={cn("inline-flex items-center gap-1", it.op && "text-slate-400")}>
          {it.op ? it.op : (
            <>
              <span className="text-slate-500">{it.label}</span>
              <span className={cn("font-semibold tabular-nums", it.strong && "text-slate-900")}>{it.value}</span>
            </>
          )}
        </span>
      ))}
    </div>
  );
}

/** Two-column key/value list. */
export function KeyValues({ rows, className }) {
  return (
    <dl className={cn("divide-y divide-slate-100 text-sm", className)}>
      {rows.filter(Boolean).map((r) => (
        <div key={r.label} className={cn("flex items-center justify-between gap-4 py-2", r.strong && "font-semibold")}>
          <dt className={cn("text-slate-600", r.indent && "pl-4", r.strong && "text-slate-900")}>{r.label}</dt>
          <dd className="text-right">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Banner({ tone = "info", children, action, className }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-rose-200 bg-rose-50 text-rose-900",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={cn("mb-4 flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between print:hidden", tones[tone], className)}>
      <div>{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
