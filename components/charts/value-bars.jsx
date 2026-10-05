"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";

const axis = (v) => (Math.abs(v) >= 1e6 ? `${Math.round(v / 1e5) / 10}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 100) / 10}k` : String(v));

/**
 * One measure per category (revenue by month, by day of the week): thin bars rounded at the top,
 * a recessive grid, the value and its detail (data[detailKey], a string) on hover. A single series: the title names it.
 */
export function ValueBars({ data, valueKey = "value", labelKey = "label", detailKey = "detail", height = 220, empty = "Nothing in this period.", color = "#059669" }) {
  if (!data.some((d) => d[valueKey])) return <div className="flex h-32 items-center justify-center text-sm text-slate-500">{empty}</div>;
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={data.map((d) => `${d[labelKey]}: ${formatMoney(d[valueKey])}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey={labelKey} tickLine={false} axisLine={false} fontSize={12} stroke="#64748b" interval={data.length > 12 ? "preserveStartEnd" : 0} minTickGap={8} />
          <YAxis tickFormatter={axis} tickLine={false} axisLine={false} fontSize={12} stroke="#64748b" width={44} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => [formatMoney(v), ""]} labelFormatter={(l, p) => (p?.[0]?.payload?.[detailKey] ? `${l} · ${p[0].payload[detailKey]}` : l)} labelStyle={{ fontWeight: 600 }} separator="" />
          <Bar dataKey={valueKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
