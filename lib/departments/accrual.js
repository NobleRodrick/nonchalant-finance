/**
 * Figures that are not plain money records, by department type: an event venue's events are
 * revenue on their date, a guest house's nights on theirs; money kept from cancelled bookings is
 * income; assets lost are a cost. The company statements and the Boss's overview add them to the
 * money records. A new department type with such figures adds its provider here.
 */
import { venueStatementFigures } from "@/lib/venue/reports";
import { stayStatementFigures } from "@/lib/rooms/reports";

const PROVIDERS = [venueStatementFigures, stayStatementFigures];

/** { [departmentId]: { eventsRevenue?, staysRevenue?, cancellationIncome, assetLosses } } for [fromKey, toKey]. */
export async function accrualFigures(args) {
  const parts = await Promise.all(PROVIDERS.map((p) => p(args)));
  return Object.assign({}, ...parts);
}

/** Accrual figures of several departments added up; revenue = events + nights + kept from cancellations. */
export function sumAccrual(list) {
  const t = { eventsRevenue: 0, staysRevenue: 0, cancellationIncome: 0, assetLosses: 0 };
  for (const v of list) for (const k of Object.keys(t)) t[k] += v?.[k] || 0;
  return { ...t, revenue: t.eventsRevenue + t.staysRevenue + t.cancellationIncome };
}

/** Accrual figures of every department by date key: { [dateKey]: { revenue, assetLosses } }. */
export function accrualByDay(figures) {
  const out = {};
  for (const f of Object.values(figures)) {
    for (const [k, v] of Object.entries(f?.days || {})) {
      out[k] ||= { revenue: 0, assetLosses: 0 };
      out[k].revenue += v.revenue;
      out[k].assetLosses += v.assetLosses;
    }
  }
  return out;
}
