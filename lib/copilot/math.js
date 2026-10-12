/**
 * Finance Copilot: the calculations behind its tools. Pure functions (no database, no model), so
 * every figure the agent quotes comes from here and is unit-tested; the language model only
 * chooses which tool to call and explains the result.
 */
import { addDaysToKey } from "@/lib/timezone";

const round = (v) => Math.round(Number(v) || 0);

/** Day of the week of a "YYYY-MM-DD" key (0 = Sunday). */
function weekday(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

/**
 * Cash-flow forecast from the recent cash movements of the business.
 *
 * `history`: one entry per day of the look-back window (days without records count as zero),
 * { dateKey, cashIn, cashOut }. The projection uses the average net cash of each day of the week
 * (a restaurant sells more on Saturday than on Monday), applied day by day from `startingCash`.
 * A cautious scenario takes 15 % less cash in and 10 % more cash out. Known future payments
 * (`scheduled`: { dateKey, amount, label }, amount negative for money out) are added on their day.
 */
export function forecastCashFlow({ history = [], startingCash = 0, days = 30, todayKey, scheduled = [] }) {
  const horizon = Math.min(Math.max(Math.round(days) || 30, 7), 90);
  const byWeekday = Array.from({ length: 7 }, () => ({ in: 0, out: 0, n: 0 }));
  let totalIn = 0;
  let totalOut = 0;
  for (const d of history) {
    const w = byWeekday[weekday(d.dateKey)];
    w.in += d.cashIn || 0;
    w.out += d.cashOut || 0;
    w.n += 1;
    totalIn += d.cashIn || 0;
    totalOut += d.cashOut || 0;
  }
  const n = history.length || 1;
  const avgIn = totalIn / n;
  const avgOut = totalOut / n;
  const dayIn = (wd) => (byWeekday[wd].n ? byWeekday[wd].in / byWeekday[wd].n : avgIn);
  const dayOut = (wd) => (byWeekday[wd].n ? byWeekday[wd].out / byWeekday[wd].n : avgOut);

  const run = (inFactor, outFactor) => {
    let balance = startingCash;
    let lowest = { dateKey: todayKey, balance: round(startingCash) };
    let firstNegative = null;
    const points = [];
    for (let i = 1; i <= horizon; i += 1) {
      const dateKey = addDaysToKey(todayKey, i);
      const wd = weekday(dateKey);
      balance += dayIn(wd) * inFactor - dayOut(wd) * outFactor;
      for (const s of scheduled) if (s.dateKey === dateKey) balance += s.amount;
      if (balance < lowest.balance) lowest = { dateKey, balance: round(balance) };
      if (balance < 0 && !firstNegative) firstNegative = dateKey;
      if (i % 7 === 0 || i === horizon) points.push({ dateKey, balance: round(balance) });
    }
    return { endBalance: round(balance), lowest, firstNegative, points };
  };

  const base = run(1, 1);
  const cautious = run(0.85, 1.1);
  const avgNet = avgIn - avgOut;
  return {
    startingCash: round(startingCash),
    days: horizon,
    lookbackDays: history.length,
    avgDailyCashIn: round(avgIn),
    avgDailyCashOut: round(avgOut),
    avgDailyNet: round(avgNet),
    runwayDays: avgNet < 0 ? Math.floor(Math.max(startingCash, 0) / -avgNet) : null,
    expected: base,
    cautious,
    confidence: history.length >= 56 ? "medium" : history.length >= 28 ? "low" : "very low",
    alert: base.firstNegative ? "CASH_SHORTFALL_EXPECTED" : cautious.firstNegative ? "CASH_SHORTFALL_POSSIBLE" : null,
  };
}

/** Days between two date keys (b − a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * Money customers still owe, by age: days since the debt was made (or past its due date when
 * one was set). `debts`: { dateKey, dueDateKey?, outstanding, name }.
 */
export function ageReceivables(debts, todayKey) {
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const byName = new Map();
  let total = 0;
  for (const d of debts) {
    if (!(d.outstanding > 0)) continue;
    const age = d.dueDateKey ? Math.max(0, daysBetween(d.dueDateKey, todayKey)) : daysBetween(d.dateKey, todayKey);
    const b = age <= 30 ? "0-30" : age <= 60 ? "31-60" : age <= 90 ? "61-90" : "90+";
    buckets[b] += d.outstanding;
    total += d.outstanding;
    const who = byName.get(d.name) || { name: d.name, outstanding: 0, oldestDays: 0, debts: 0 };
    who.outstanding += d.outstanding;
    who.oldestDays = Math.max(who.oldestDays, age);
    who.debts += 1;
    byName.set(d.name, who);
  }
  const top = [...byName.values()].sort((a, b) => b.outstanding - a.outstanding).slice(0, 10);
  return {
    total: round(total),
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, round(v)])),
    overdueOver30: round(buckets["31-60"] + buckets["61-90"] + buckets["90+"]),
    topDebtors: top.map((t) => ({ ...t, outstanding: round(t.outstanding) })),
  };
}

/** Monthly instalment of a loan (annuity), `rate` per month. */
export function instalment(amount, months, rate) {
  if (!rate) return round(amount / months);
  return round((amount * rate) / (1 - (1 + rate) ** -months));
}

/**
 * Kinds of financing a small business in Cameroon can use. The monthly rates are ASSUMPTIONS for
 * an affordability check (indicative orders of magnitude), not offers: the owner checks the real
 * terms with the lender. The agent says so every time.
 */
export const FINANCING_KINDS = [
  { id: "collect-receivables", label: "Collect what customers owe first", rate: 0, minMonths: 0, maxMonths: 3, purposes: ["working-capital", "stock", "emergency", "other"], note: "No cost and no debt: money already earned." },
  { id: "own-cash", label: "Use cash already held by the business", rate: 0, minMonths: 0, maxMonths: 0, purposes: ["working-capital", "stock", "equipment", "expansion", "emergency", "other"], note: "Only if a safety cushion remains (at least two weeks of cash out)." },
  { id: "supplier-credit", label: "Supplier credit (pay suppliers in 30–60 days)", rate: 0, minMonths: 1, maxMonths: 2, purposes: ["stock", "working-capital"], note: "Negotiated with regular suppliers; keeps cash for operations." },
  { id: "savings-group", label: "Rotating savings group (njangi / tontine)", rate: 0, minMonths: 1, maxMonths: 12, purposes: ["stock", "equipment", "emergency", "other", "working-capital"], maxAmount: 2_000_000, note: "Requires membership and regular contributions." },
  { id: "microfinance", label: "Microfinance working-capital loan", rate: 0.02, minMonths: 3, maxMonths: 24, purposes: ["working-capital", "stock", "equipment", "expansion"], minHistoryMonths: 6, note: "Usually asks for 6+ months of activity, a guarantor or savings; records from this app help." },
  { id: "bank-sme", label: "Bank SME loan or overdraft", rate: 0.012, minMonths: 6, maxMonths: 60, purposes: ["equipment", "expansion", "working-capital"], minHistoryMonths: 12, minAmount: 1_000_000, note: "Asks for financial statements (Full accounting produces them), guarantees and a bank account history." },
  { id: "leasing", label: "Equipment leasing", rate: 0.015, minMonths: 12, maxMonths: 48, purposes: ["equipment"], minAmount: 500_000, note: "The equipment itself is the guarantee." },
  { id: "mobile-nano", label: "Mobile-money nano-loan", rate: 0.08, minMonths: 1, maxMonths: 1, purposes: ["emergency"], maxAmount: 150_000, note: "Very expensive: for a short emergency only." },
];

export const PURPOSES = ["working-capital", "stock", "equipment", "expansion", "emergency", "other"];

/**
 * Matches financing kinds to a need, using the business's own figures:
 * `profile`: { avgMonthlyCashIn, avgMonthlyNet, receivablesOpen, cashOnHand, monthsOfHistory,
 * avgMonthlyCashOut }. A loan is "affordable" when its instalment stays within 40 % of the
 * average monthly net cash (a common prudence rule). Returns the kinds sorted by fit.
 */
export function matchFinancing({ amount, months, purpose = "other", profile }) {
  const need = round(amount);
  const term = Math.min(Math.max(Math.round(months) || 1, 1), 60);
  const p = { avgMonthlyNet: 0, receivablesOpen: 0, cashOnHand: 0, monthsOfHistory: 0, avgMonthlyCashOut: 0, ...profile };
  const capacity = Math.max(0, p.avgMonthlyNet) * 0.4;
  const options = [];
  for (const k of FINANCING_KINDS) {
    const reasons = [];
    let status = "fits";
    if (!k.purposes.includes(purpose)) continue;
    if (k.id === "collect-receivables") {
      if (p.receivablesOpen <= 0) continue;
      const covers = Math.min(1, p.receivablesOpen / need);
      reasons.push(`Customers owe ${p.receivablesOpen} FCFA (${Math.round(covers * 100)} % of the need).`);
      if (covers < 0.3) status = "partial";
      options.push({ id: k.id, label: k.label, status, covers: round(Math.min(need, p.receivablesOpen)), monthlyCost: 0, totalCost: 0, reasons, note: k.note });
      continue;
    }
    if (k.id === "own-cash") {
      const cushion = (p.avgMonthlyCashOut / 30) * 14;
      const free = p.cashOnHand - cushion;
      if (free <= 0) continue;
      reasons.push(`About ${round(free)} FCFA is free after a two-week cushion of ${round(cushion)} FCFA.`);
      if (free < need) status = "partial";
      options.push({ id: k.id, label: k.label, status, covers: round(Math.min(need, free)), monthlyCost: 0, totalCost: 0, reasons, note: k.note });
      continue;
    }
    if (k.maxAmount && need > k.maxAmount) {
      status = "partial";
      reasons.push(`Usually limited to about ${k.maxAmount} FCFA.`);
    }
    if (k.minAmount && need < k.minAmount) {
      status = "unlikely";
      reasons.push(`Usually for ${k.minAmount} FCFA or more.`);
    }
    if (k.minHistoryMonths && p.monthsOfHistory < k.minHistoryMonths) {
      status = "unlikely";
      reasons.push(`Lenders usually want ${k.minHistoryMonths}+ months of records; the business has ${p.monthsOfHistory}.`);
    }
    const n = Math.min(Math.max(term, k.minMonths || 1), k.maxMonths || term);
    const covered = k.maxAmount ? Math.min(need, k.maxAmount) : need;
    const monthly = instalment(covered, n, k.rate);
    const total = round(monthly * n - covered);
    if (k.rate > 0) {
      if (monthly > capacity) {
        if (status === "fits") status = "stretch";
        reasons.push(`Instalment ${monthly} FCFA/month over ${n} months is above 40 % of the average monthly net cash (${round(capacity)} FCFA).`);
      } else {
        reasons.push(`Instalment ${monthly} FCFA/month over ${n} months fits within 40 % of the average monthly net cash (${round(capacity)} FCFA).`);
      }
    }
    options.push({ id: k.id, label: k.label, status, covers: round(covered), months: n, assumedMonthlyRate: k.rate, monthlyCost: monthly, totalCost: total, reasons, note: k.note });
  }
  const order = { fits: 0, partial: 1, stretch: 2, unlikely: 3 };
  options.sort((a, b) => order[a.status] - order[b.status] || a.totalCost - b.totalCost);
  return {
    need,
    months: term,
    purpose,
    repaymentCapacityPerMonth: round(capacity),
    options,
    disclaimer: "Indicative only: assumed rates, not offers. Confirm terms with the lender. Not financial advice.",
  };
}

/**
 * What the model receives from a tool: business records are DATA. Text typed by people (names,
 * notes, descriptions) could contain instructions aimed at the agent ("ignore your rules…"), so
 * every string is cut short, control characters are removed, lists are capped, and the whole
 * result is wrapped with a marker the system prompt tells the model to treat as untrusted data.
 */
export function asUntrustedData(value, { maxString = 160, maxItems = 25, depth = 0 } = {}) {
  if (depth > 6) return null;
  if (typeof value === "string") {
    // eslint-disable-next-line no-control-regex
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    return clean.length > maxString ? `${clean.slice(0, maxString)}…` : clean;
  }
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  if (typeof value !== "object" || value === null) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, maxItems).map((v) => asUntrustedData(v, { maxString, maxItems, depth: depth + 1 }));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = asUntrustedData(v, { maxString, maxItems, depth: depth + 1 });
  return out;
}
