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

const FIGURES = { RESTAURANT: RestaurantFigures, EVENT_VENUE: VenueFigures, ROOM_RENTAL: RoomsFigures };

/** The figures of a department card on the Boss overview, by department type (lib/domains). */
export function CardFigures({ card }) {
  const Figures = FIGURES[card.domain];
  return Figures ? <div className="mt-3 space-y-1 text-sm text-slate-600"><Figures c={card} /></div> : null;
}
