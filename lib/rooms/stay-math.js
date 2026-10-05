/**
 * Nights and occupancy of rooms, as pure functions (pages, the server and tests share them).
 * A stay runs from its check-in date (its first night) to its check-out date (not a night).
 */
import { addDaysToKey, daysBetweenKeys, listDateKeys } from "@/lib/timezone";

export const STAY_STATUS_LABELS = { RESERVED: "Reserved", CONFIRMED: "Confirmed", CHECKED_IN: "In the room", CHECKED_OUT: "Checked out", CANCELLED: "Cancelled" };

/** Stays that occupy their room (a cancelled one frees it). */
export const OCCUPYING = ["RESERVED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"];

export function nightsOf(checkInKey, checkOutKey) {
  return Math.max(0, daysBetweenKeys(checkInKey, checkOutKey));
}

/** Do [aIn, aOut) and [bIn, bOut) share a night? */
export function overlaps(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

/** The nights a stay occupies (date keys). */
export function nightsList(checkInKey, checkOutKey) {
  return checkOutKey > checkInKey ? listDateKeys(checkInKey, addDaysToKey(checkOutKey, -1)) : [];
}

/**
 * Occupancy grid: for each room, each date of [fromKey, toKey] → the stay occupying that night or
 * null. `stays`: [{ roomId, checkInKey, checkOutKey, status, … }].
 */
export function occupancyGrid(rooms, stays, fromKey, toKey) {
  const keys = listDateKeys(fromKey, toKey);
  return rooms.map((room) => {
    const mine = stays.filter((s) => s.roomId === room.id && OCCUPYING.includes(s.status));
    return { room, nights: keys.map((k) => ({ dateKey: k, stay: mine.find((s) => s.checkInKey <= k && k < s.checkOutKey) || null })) };
  });
}

/** Rooms occupied a night ÷ rooms available, as a percentage (0 decimals). */
export function occupancyRate(grid) {
  const cells = grid.flatMap((r) => r.nights);
  if (!cells.length) return 0;
  return Math.round((cells.filter((c) => c.stay).length / cells.length) * 100);
}

export const ROOM_STATE_LABELS = { AVAILABLE: "Available", RESERVED: "Reserved", OCCUPIED: "Occupied", MAINTENANCE: "Under maintenance", UNAVAILABLE: "Unavailable" };
export const BOOKING_TYPE_LABELS = { NIGHT: "By the night", WEEK: "By the week", MONTH: "By the month", OTHER: "Special price" };

/** The views of the bookings list: upcoming, current (in the apartment), completed, cancelled. */
export const STAY_VIEWS = {
  upcoming: { label: "Upcoming", statuses: ["RESERVED", "CONFIRMED"] },
  current: { label: "Current", statuses: ["CHECKED_IN"] },
  completed: { label: "Completed", statuses: ["CHECKED_OUT"] },
  cancelled: { label: "Cancelled", statuses: ["CANCELLED"] },
};

const int = (v) => Math.round(Number(v) || 0);

/**
 * The suggested price of a stay: whole months at the monthly rate, whole weeks at the weekly
 * rate, the remaining nights at the nightly rate (a rate not set is replaced by nights at the
 * nightly rate). The price stays editable on every booking.
 */
export function suggestedPrice(room, nights, bookingType = "NIGHT") {
  const n = Math.max(0, int(nights));
  const night = int(room?.nightlyRate);
  if (bookingType === "MONTH" && room?.monthlyRate) return Math.floor(n / 30) * int(room.monthlyRate) + suggestedPrice(room, n % 30, "WEEK");
  if ((bookingType === "WEEK" || bookingType === "MONTH") && room?.weeklyRate) return Math.floor(n / 7) * int(room.weeklyRate) + (n % 7) * night;
  return n * night;
}

/**
 * Revenue of each night of a stay (owner's decision: revenue per night stayed): the price spread
 * evenly over the nights, the remainder on the first nights, so the nights add up to the price.
 * → [{ dateKey, amount }]
 */
export function nightlyRevenue({ checkInKey, checkOutKey, totalPrice }) {
  const nights = nightsList(checkInKey, checkOutKey);
  if (!nights.length) return [];
  const total = int(totalPrice);
  const base = Math.floor(total / nights.length);
  let rest = total - base * nights.length;
  return nights.map((dateKey) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { dateKey, amount: base + extra };
  });
}

/**
 * Revenue of a stay earned between [fromKey, toKey] (nights with their date in the period). A
 * night counts once the guest has checked in (or out); a cancelled or complimentary stay earns
 * nothing (money kept from a cancellation is income of its cancellation day).
 */
export function stayRevenueBetween(stay, fromKey, toKey) {
  if (!["CHECKED_IN", "CHECKED_OUT"].includes(stay.status) || stay.complimentary) return { revenue: 0, nights: 0 };
  let revenue = 0;
  let nights = 0;
  for (const n of nightlyRevenue(stay)) {
    if (n.dateKey >= fromKey && n.dateKey <= toKey) {
      revenue += n.amount;
      nights += 1;
    }
  }
  return { revenue, nights };
}

/**
 * The state of an apartment tonight (`todayKey`): occupied (a guest checked in), reserved (a
 * booking covers tonight and the guest has not arrived yet), under maintenance / unavailable (set
 * by the head, or a repair that blocks it), otherwise available (a later booking is shown as
 * "next", the apartment is free until then).
 */
export function apartmentState(room, stays, todayKey) {
  const mine = stays.filter((s) => s.roomId === room.id);
  if (mine.some((s) => s.status === "CHECKED_IN")) return "OCCUPIED";
  if (room.state === "MAINTENANCE" || room.state === "UNAVAILABLE") return room.state;
  if (mine.some((s) => ["RESERVED", "CONFIRMED"].includes(s.status) && s.checkInKey <= todayKey && s.checkOutKey > todayKey)) return "RESERVED";
  return "AVAILABLE";
}
