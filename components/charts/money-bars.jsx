"use client";

import { Bar, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAmount, formatMoney } from "@/lib/format";

const short = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};
const axis = (v) => (Math.abs(v) >= 1e6 ? `${Math.round(v / 1e5) / 10}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 100) / 10}k` : String(v));

/** Money in vs money out per day, with the result as a line. */
export function MoneyBars({ data, height = 260 }) {
  const rows = data.map((d) => ({ ...d, label: short(d.dateKey) }));
  if (!rows.some((r) => r.moneyIn || r.moneyOut)) {
    return <div className="flex h-40 items-center justify-center text-sm text-slate-500">No money recorded in this period.</div>;
  }
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="#64748b" />
          <YAxis tickFormatter={axis} tickLine={false} axisLine={false} fontSize={12} stroke="#64748b" width={44} />
          <Tooltip formatter={(v, n) => [formatMoney(v), n]} labelStyle={{ fontWeight: 600 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="moneyIn" name="Money in" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="moneyOut" name="Money out" fill="#f43f5e" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line dataKey="result" name="Result" stroke="#0f172a" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars (e.g. sales by dish, expenses by category). */
export function HBars({ rows, valueKey = "value", labelKey = "label", color = "#0f172a", format = formatAmount }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r[labelKey]} className="text-sm">
          <div className="flex justify-between"><span className="truncate text-slate-700">{r[labelKey]}</span><span className="tabular-nums text-slate-900">{format(r[valueKey])}</span></div>
          <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${(r[valueKey] / max) * 100}%`, backgroundColor: color }} /></div>
        </div>
      ))}
    </div>
  );
}

