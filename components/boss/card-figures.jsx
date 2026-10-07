import { Money } from "@/components/kit/primitives";
import { formatDateKey } from "@/lib/timezone";
import { countOf } from "@/lib/format";

const Line = ({ label, children }) => (
  <div className="flex justify-between gap-2"><span>{label}</span><span className="text-right">{children}</span></div>
);

const Handed = ({ c }) => (
  <Line label="Cash handed over"><Money value={c.handedOver} />{c.handoverPending ? <span className="text-xs text-amber-700"> · <Money value={c.handoverPending} suffix={false} /> to confirm</span> : null}</Line>
);

/** Restaurant: stock, customers' debts, cash handed over. */
function RestaurantFigures({ c }) {
  return (
    <>
      <Line label="Stock value"><Money value={c.stockValue} /> <span className="text-xs text-slate-400">({countOf(c.plates, "plate")})</span></Line>
      <Line label="Owed by customers"><Money value={c.debts} /></Line>
      <Handed c={c} />
      {c.outOfStock ? <div className="text-xs text-rose-700">{c.outOfStock === 1 ? "1 dish" : `${c.outOfStock} dishes`} out of stock</div> : null}
    </>
  );
}

/** Event venue: money received, owed by clients, cash to hand over, discrepancies, next event. */
function VenueFigures({ c }) {
  const v = c.venue;
  if (!v) return null;
  return (
    <>
      <Line label="Received from clients"><Money value={v.receivedFromClients} /></Line>
      <Line label="Owed by clients"><Money value={v.outstanding} /></Line>
      <Line label="Cash to hand over"><Money value={v.toHandOver} /></Line>
      <Handed c={c} />
      {v.discrepancies ? <div className="text-xs font-medium text-rose-700">Cash discrepancies: <Money value={v.discrepancies} /></div> : null}
      <div className="pt-1 text-xs text-slate-500">
        {v.nextEvent ? <>Next event {formatDateKey(v.nextEvent.dateKey, { weekday: false })} · {v.nextEvent.client} · {countOf(v.upcoming, "booking")} upcoming</> : "No upcoming booking"}
        {v.leads.open ? ` · ${countOf(v.leads.open, "open lead")}` : ""}
      </div>
    </>
  );
}

/** Guest house: occupancy, money from guests, what they owe, cash to hand over, repairs, expenses to validate. */
function RoomsFigures({ c }) {
  const r = c.rooms;
  if (!r) return null;
  return (
    <>
      <Line label="Occupied tonight">{r.occupied} / {r.rooms} <span className="text-xs text-slate-400">({r.rateTonight}%)</span></Line>
      <Line label="Next 7 nights">{r.rateWeek}% occupancy</Line>
      <Line label="Arrivals · departures">{r.arrivals} · {r.departures}</Line>
      <Line label="Received from guests"><Money value={r.receivedFromClients} /></Line>
      <Line label="Owed by guests"><Money value={r.outstanding} /></Line>
      <Line label="Cash to hand over"><Money value={r.toHandOver} /></Line>
      <Handed c={c} />
      {r.discrepancies ? <div className="text-xs font-medium text-rose-700">Cash discrepancies: <Money value={r.discrepancies} /></div> : null}
      <div className="pt-1 text-xs text-slate-500">
        {[r.pendingRepairs ? countOf(r.pendingRepairs, "repair") + " pending" : null, r.unvalidated ? `${countOf(r.unvalidated, "expense")} to validate` : null, r.complimentaryTonight ? `${countOf(r.complimentaryTonight, "apartment")} free with a venue package tonight` : null].filter(Boolean).join(" · ") || "No repair pending"}
      </div>
    </>
  );
}

/** Event rental: events today, money from customers, what they owe, cash to hand over, items out, warnings. */
function RentalFigures({ c }) {
  const r = c.rental;
  if (!r) return null;
  const urgent = r.warnings.filter((w) => w.tone === "bad");
  return (
    <>
      <Line label="Events today">{r.events}</Line>
      <Line label="Received from customers"><Money value={r.receivedFromClients} /></Line>
      <Line label="Owed by customers"><Money value={r.outstanding} />{r.overdue ? <span className="text-xs text-rose-700"> · <Money value={r.overdue} suffix={false} /> overdue</span> : null}</Line>
      <Line label="Cash to hand over"><Money value={r.toHandOver} /></Line>
      <Handed c={c} />
      <Line label="Items out at events">{r.unitsOut}</Line>
      {r.discrepancies ? <div className="text-xs font-medium text-rose-700">Cash discrepancies: <Money value={r.discrepancies} /></div> : null}
      {urgent.map((w) => <div key={w.key} className="text-xs font-medium text-rose-700">{w.title}</div>)}
      <div className="pt-1 text-xs text-slate-500">
        {[r.openIncidents ? `${countOf(r.openIncidents, "damage")} to settle` : null, r.unvalidated ? `${countOf(r.unvalidated, "expense")} to approve` : null, r.warnings.length - urgent.length ? `${countOf(r.warnings.length - urgent.length, "other point")} to look at` : null].filter(Boolean).join(" · ") || "Nothing else to look at"}
      </div>
    </>
  );
}

/** Property rental: occupancy, rent collected today, what tenants owe, deposits held, cash, alerts. */
function PropertyFigures({ c }) {
  const r = c.property;
  if (!r) return null;
  const urgent = r.warnings.filter((w) => w.tone === "bad");
  return (
    <>
      <Line label="Occupied">{r.occupied} / {r.offices} <span className="text-xs text-slate-400">({r.vacant} vacant)</span></Line>
      <Line label="Rent collected today"><Money value={r.collected} /></Line>
      <Line label="Owed by tenants"><Money value={r.owed} />{r.overdue ? <span className="text-xs text-rose-700"> · <Money value={r.overdue} suffix={false} /> overdue</span> : null}</Line>
      <Line label="Deposits held"><Money value={r.depositsHeld} /></Line>
      <Line label="Cash to hand over"><Money value={r.toHandOver} /></Line>
      <Handed c={c} />
      {r.discrepancies ? <div className="text-xs font-medium text-rose-700">Cash discrepancies: <Money value={r.discrepancies} /></div> : null}
      {urgent.map((w) => <div key={w.key} className="text-xs font-medium text-rose-700">{w.title}</div>)}
      <div className="pt-1 text-xs text-slate-500">
        {[r.maintenanceOpen ? `${countOf(r.maintenanceOpen, "maintenance request")} open` : null, r.unvalidated ? `${countOf(r.unvalidated, "expense")} to approve` : null, r.warnings.length - urgent.length ? `${countOf(r.warnings.length - urgent.length, "other point")} to look at` : null].filter(Boolean).join(" · ") || "Nothing else to look at"}
      </div>
    </>
  );
}

/** Shop, bar, other: sales of the day, stock, customers' debts, tabs and crates; jobs (job tickets). */
function TradeFigures({ c }) {
  const t = c.trade;
  const j = c.services;
  return (
    <>
      {t ? <Line label="Sales today"><Money value={t.sales} /> <span className="text-xs text-slate-400">({countOf(t.salesCount, "sale")})</span></Line> : null}
      {t ? <Line label="Stock value"><Money value={t.stockValue} /></Line> : null}
      {t || c.debts ? <Line label="Owed by customers"><Money value={c.debts + (j?.owing || 0)} /></Line> : null}
      {j ? <Line label={c.domain === "CAR_WASH" ? "Washed today" : "Collected today"}>{j.collectedToday} · <Money value={j.revenueToday} /></Line> : null}
      {j ? <Line label={c.domain === "CAR_WASH" ? "In the queue" : "In the shop"}>{j.open} <span className="text-xs text-slate-400">({j.ready} ready)</span></Line> : null}
      {j && j.owing && !t ? <Line label="Left without paying"><Money value={j.owing} /></Line> : null}
      <Handed c={c} />
      {t?.tabs ? <div className="text-xs text-sky-700">{countOf(t.tabs, "tab")} open</div> : null}
      {t?.cratesOwed ? <div className="text-xs text-slate-500">{countOf(t.cratesOwed, "crate")} to give back to suppliers</div> : null}
      {t?.empty ? <div className="text-xs font-medium text-rose-700">{countOf(t.empty, "product")} out of stock</div> : null}
      {t?.low ? <div className="text-xs text-amber-700">{countOf(t.low, "product")} running low</div> : null}
      {j?.late ? <div className="text-xs font-medium text-rose-700">{countOf(j.late, "ticket")} late</div> : null}
    </>
  );
}

const FIGURES = { RESTAURANT: RestaurantFigures, EVENT_VENUE: VenueFigures, ROOM_RENTAL: RoomsFigures, MATERIAL_RENTAL: RentalFigures, PROPERTY_RENTAL: PropertyFigures, SHOP: TradeFigures, BAR: TradeFigures, PRESSING: TradeFigures, CAR_WASH: TradeFigures, OTHER: TradeFigures, PRODUCTION: TradeFigures, FARM: TradeFigures, SALON: TradeFigures };

/** The figures of a department card on the Boss overview, by department type (lib/domains). */
export function CardFigures({ card }) {
  const Figures = FIGURES[card.domain];
  return Figures ? <div className="mt-3 space-y-1 text-sm text-slate-600"><Figures c={card} /></div> : null;
}
