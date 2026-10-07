/**
 * Figures that are not plain money records, by department type: an event venue's events are
 * revenue on their date, a guest house's nights on theirs; money kept from cancelled bookings is
 * income; assets lost are a cost. The company statements and the Boss's overview add them to the
 * money records. A new department type with such figures adds its provider here.
 */
import { db } from "@/lib/prisma";
import { venueStatementFigures } from "@/lib/venue/reports";
import { stayStatementFigures } from "@/lib/rooms/reports";
import { rentalStatementFigures } from "@/lib/rental/reports";
import { propertyStatementFigures } from "@/lib/property/reports";
import { debtRecognitions } from "@/lib/accounting/recognitions";
import { tradeStatementFigures } from "@/lib/trade/accrual";
import { serviceStatementFigures } from "@/lib/services/accrual";

/** Debts written off in the period (cancelled while still owed, the sale kept): a cost of every department type. */
async function writeOffFigures({ departments, fromKey, toKey, timeZone, client }) {
  const out = {};
  await Promise.all(
    departments.map(async (d) => {
      const list = await debtRecognitions({ department: d, fromKey, toKey, timeZone, client });
      const days = {};
      let badDebts = 0;
      for (const r of list) {
        if (r.kind !== "write-off") continue;
        badDebts += r.amount;
        (days[r.dateKey] ||= { revenue: 0, assetLosses: 0, badDebts: 0 }).badDebts += r.amount;
      }
      if (badDebts) out[d.id] = { badDebts, days };
    })
  );
  return out;
}

const PROVIDERS = [venueStatementFigures, stayStatementFigures, rentalStatementFigures, propertyStatementFigures, tradeStatementFigures, serviceStatementFigures];

/** { [departmentId]: { eventsRevenue?, staysRevenue?, cancellationIncome, assetLosses } } for [fromKey, toKey]. */
export async function accrualFigures(args) {
  const [writeOffs, ...parts] = await Promise.all([writeOffFigures({ client: db, ...args }), ...PROVIDERS.map((p) => p(args))]);
  // A department may get figures from two providers (other activity: sales & stock and job tickets).
  const out = {};
  for (const part of parts) {
    for (const [id, f] of Object.entries(part)) {
      if (!out[id]) out[id] = f;
      else {
        const days = { ...(out[id].days || {}) };
        for (const [k, v] of Object.entries(f.days || {})) {
          const d = days[k] || {};
          days[k] = Object.fromEntries([...new Set([...Object.keys(d), ...Object.keys(v)])].map((x) => [x, (d[x] || 0) + (v[x] || 0)]));
        }
        const merged = { ...out[id] };
        for (const [k, v] of Object.entries(f)) if (k !== "days") merged[k] = (merged[k] || 0) + v;
        out[id] = { ...merged, days };
      }
    }
  }
  // A department's write-offs join its own figures (a restaurant has no other provider).
  for (const [id, w] of Object.entries(writeOffs)) {
    const own = out[id] || {};
    const days = { ...(own.days || {}) };
    for (const [k, v] of Object.entries(w.days)) days[k] = { ...(days[k] || { revenue: 0, assetLosses: 0 }), badDebts: v.badDebts };
    out[id] = { ...own, badDebts: w.badDebts, days };
  }
  return out;
}

/**
 * Accrual figures of several departments added up; revenue = events + nights + office rent and
 * tenant charges + kept from
 * cancellations + gains on assets sold; costs = assets lost + depreciation.
 */
export function sumAccrual(list) {
  const t = { eventsRevenue: 0, staysRevenue: 0, rentRevenue: 0, servicesRevenue: 0, cancellationIncome: 0, assetGains: 0, assetLosses: 0, depreciation: 0, badDebts: 0, stockChange: 0 };
  for (const v of list) for (const k of Object.keys(t)) t[k] += v?.[k] || 0;
  return { ...t, revenue: t.eventsRevenue + t.staysRevenue + t.rentRevenue + t.servicesRevenue + t.cancellationIncome + t.assetGains, costs: t.assetLosses + t.depreciation + t.badDebts + t.stockChange };
}

/** Accrual figures of every department by date key: { [dateKey]: { revenue, assetLosses } }. */
export function accrualByDay(figures) {
  const out = {};
  for (const f of Object.values(figures)) {
    for (const [k, v] of Object.entries(f?.days || {})) {
      out[k] ||= { revenue: 0, assetLosses: 0 };
      out[k].revenue += v.revenue || 0;
      out[k].assetLosses += (v.assetLosses || 0) + (v.badDebts || 0) + (v.costs || 0);
    }
  }
  return out;
}
