import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONES = {
  bad: { icon: OctagonAlert, box: "border-rose-200 bg-rose-50/70", icolor: "text-rose-600", label: "Urgent" },
  warn: { icon: AlertTriangle, box: "border-amber-200 bg-amber-50/70", icolor: "text-amber-600", label: "Soon" },
  info: { icon: Info, box: "border-sky-200 bg-sky-50/60", icolor: "text-sky-600", label: "For information" },
};

/**
 * What needs attention (any department): warnings [{ key, tone: bad | warn | info, title, detail,
 * amount, href, rows: [{ id, label, note, amount, href }] }], hrefs relative to `base`. Each warning
 * carries an icon and a word for its tone (never color alone); up to `rowsShown` rows each.
 */
export function AttentionList({ warnings, base = "", rowsShown = 3, empty = "Nothing needs attention: every booking, payment and item is in order." }) {
  if (!warnings.length) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> {empty}
      </p>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2" data-testid="attention-list">
      {warnings.map((w) => {
        const t = TONES[w.tone] || TONES.info;
        const Icon = t.icon;
        return (
          <li key={w.key} className={cn("rounded-lg border p-3", t.box)} data-warning={w.key}>
            <div className="flex items-start gap-2">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.icolor)} aria-label={t.label} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  {w.href ? <Link href={`${base}${w.href}`} className="text-sm font-semibold text-slate-900 hover:underline">{w.title}</Link> : <span className="text-sm font-semibold text-slate-900">{w.title}</span>}
                  {w.amount ? <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">{formatMoney(w.amount)}</span> : null}
                </div>
                {w.detail ? <p className="text-xs text-slate-600">{w.detail}</p> : null}
                {w.rows?.length ? (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {w.rows.slice(0, rowsShown).map((r) => (
                      <li key={r.id} className="flex justify-between gap-2">
                        {r.href ? <Link href={`${base}${r.href}`} className="truncate text-slate-800 hover:underline">{r.label}</Link> : <span className="truncate text-slate-800">{r.label}</span>}
                        <span className="whitespace-nowrap tabular-nums text-slate-600">{r.amount ? formatMoney(r.amount) : r.note}</span>
                      </li>
                    ))}
                    {w.rows.length > rowsShown ? <li className="text-slate-500">and {w.rows.length - rowsShown} more</li> : null}
                  </ul>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
