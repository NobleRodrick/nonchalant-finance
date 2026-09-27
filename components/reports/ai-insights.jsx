"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateInsights } from "@/actions/insights";

/** On-demand AI reading of the statement on screen (only the recorded figures are sent). */
export function AiInsights({ departmentIds, fromKey, toKey }) {
  const [state, setState] = useState({ loading: false, insights: null, error: null, forKey: null });
  const key = `${departmentIds.join(",")}|${fromKey}|${toKey}`;
  const current = state.forKey === key ? state : { loading: state.loading, insights: null, error: null };

  async function run() {
    setState({ loading: true, insights: null, error: null, forKey: key });
    const res = await generateInsights({ departmentIds, fromKey, toKey });
    if (!res.success) return setState({ loading: false, insights: null, error: res.error?.message || "Could not generate insights.", forKey: key });
    setState({ loading: false, insights: res.data.insights, error: res.data.error || null, forKey: key });
  }

  return (
    <section className="mt-6 rounded-xl border border-violet-200 bg-violet-50/50 p-5 print:hidden" data-testid="ai-insights">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-900"><Sparkles className="h-4 w-4" /> AI insights</h3>
          <p className="text-xs text-violet-800/80">A short reading of these figures: sales, costs, cash and debts. Only the totals above are used.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={run} disabled={current.loading}>
          {current.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {current.insights ? "Refresh" : "Get insights"}
        </Button>
      </div>
      {current.error ? <p className="mt-3 text-sm text-amber-800" role="status">{current.error}</p> : null}
      {current.insights?.length ? (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-800">
          {current.insights.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
