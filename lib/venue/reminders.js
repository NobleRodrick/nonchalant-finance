/**
 * The venue's morning reminders (run daily by lib/inngest): reservations whose hold is over
 * (they keep their date until someone decides — never released silently) and events of the next
 * days with a balance still owed. Heads get them in the app; the Boss too.
 */
import { db } from "@/lib/prisma";
import { addDaysToKey, formatDateKey, toDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { departmentHeadIds, notifyBosses, notifyUsers } from "@/lib/notifications";
import { expiredHolds, upcomingBookings } from "./booking-queries";

/** What to remind for one venue department on `todayKey` (pure read). */
export async function venueReminders({ departmentId, todayKey, soonDays = 3, client = db }) {
  const [holds, upcoming] = await Promise.all([expiredHolds({ departmentId, todayKey, client }), upcomingBookings({ departmentId, todayKey, take: 20, client })]);
  const soon = upcoming.filter((b) => b.eventDateKey <= addDaysToKey(todayKey, soonDays) && b.figures.balance > 0);
  return { holds, soon };
}

/** Sends the reminders of every venue department of an organization. Returns how many were sent. */
export async function sendVenueReminders({ organizationId, timeZone, client = db }) {
  const venues = await client.department.findMany({ where: { organizationId, domain: "EVENT_VENUE", isActive: true }, select: { id: true, name: true } });
  const todayKey = toDateKey(new Date(), timeZone);
  let sent = 0;
  for (const d of venues) {
    const { holds, soon } = await venueReminders({ departmentId: d.id, todayKey, client });
    const heads = await departmentHeadIds(client, d.id);
    const notes = [];
    if (holds.length) {
      notes.push({
        kind: "VENUE_HOLD_EXPIRED",
        title: `${d.name}: ${holds.length === 1 ? "1 reservation's hold is" : `${holds.length} reservations' holds are`} over without a deposit`,
        body: `${holds.map((b) => `${formatDateKey(b.eventDateKey)} (${b.client.name})`).join(", ")}. The dates stay held until you confirm, extend or cancel.`,
        href: `/d/${d.id}/bookings?status=RESERVED`,
      });
    }
    if (soon.length) {
      notes.push({
        kind: "VENUE_BALANCE_DUE",
        title: `${d.name}: ${soon.length === 1 ? "1 event" : `${soon.length} events`} in the next days with a balance owed`,
        body: soon.map((b) => `${formatDateKey(b.eventDateKey)} ${b.client.name}: ${formatMoney(b.figures.balance)}`).join(" · "),
        href: `/d/${d.id}/bookings`,
      });
    }
    for (const n of notes) {
      sent += await notifyUsers(client, { organizationId, userIds: heads, departmentId: d.id, ...n });
      sent += await notifyBosses(client, { organizationId, departmentId: d.id, ...n });
    }
  }
  return sent;
}
