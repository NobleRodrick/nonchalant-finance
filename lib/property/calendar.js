/**
 * The property rental calendar of a month: rent due dates (of each contract's schedule, with what
 * is still owed), charges due, contract expiries, move-ins and move-outs, maintenance appointments,
 * planned inspections. Each entry: { dateKey, kind, label, detail, href, tone, amount }.
 */
import { db } from "@/lib/prisma";
import { monthGrid } from "@/lib/venue/calendar";
import { toDateKey } from "@/lib/timezone";
import { dateKeyOf } from "@/lib/venue/dates";
import { loadAccounts } from "./accounts";
import { unitTitle } from "./unit-math";

export const CALENDAR_KINDS = {
  RENT_DUE: { label: "Rent due", tone: "amber" },
  CHARGE_DUE: { label: "Charges due", tone: "sky" },
  EXPIRY: { label: "Contract ends", tone: "rose" },
  MOVE_IN: { label: "Move-in", tone: "emerald" },
  MOVE_OUT: { label: "Move-out", tone: "violet" },
  MAINTENANCE: { label: "Maintenance", tone: "cyan" },
  INSPECTION: { label: "Inspection", tone: "slate" },
};

export async function propertyCalendar({ departmentId, monthKey, todayKey, timeZone, client = db }) {
  const grid = monthGrid(monthKey);
  const inGrid = (k) => k && k >= grid.start && k <= grid.end;
  const [leases, maintenance, inspections] = await Promise.all([
    client.propertyLease.findMany({ where: { departmentId, status: { not: "CANCELLED" } }, include: { client: { select: { name: true } }, unit: { select: { name: true, building: { select: { name: true } } } } } }),
    client.propertyMaintenance.findMany({ where: { departmentId, scheduledFor: { not: null }, status: { in: ["REPORTED", "APPROVED", "IN_PROGRESS"] } }, include: { unit: { select: { name: true, building: { select: { name: true } } } } } }),
    client.propertyInspection.findMany({ where: { departmentId, doneAt: null, scheduledFor: { not: null } }, include: { unit: { select: { name: true, building: { select: { name: true } } } } } }),
  ]);
  const accounts = await loadAccounts({ leases: leases.filter((l) => ["ACTIVE", "ENDED"].includes(l.status)), todayKey, ahead: 3, client });
  const entries = [];
  const base = `/d/${departmentId}`;
  for (const l of leases) {
    const who = `${l.client.name} · ${unitTitle(l.unit)}`;
    const href = `${base}/contracts/${l.id}`;
    const a = accounts.get(l.id);
    if (a) {
      const byDue = new Map();
      for (const i of a.items) {
        if (!inGrid(i.dueKey)) continue;
        const k = `${i.dueKey}:${i.kind === "RENT" ? "RENT_DUE" : "CHARGE_DUE"}`;
        const e = byDue.get(k) || { dateKey: i.dueKey, kind: i.kind === "RENT" ? "RENT_DUE" : "CHARGE_DUE", label: who, detail: [], href, amount: 0, owed: 0 };
        e.detail.push(i.label);
        e.amount += i.amount;
        e.owed += i.balance;
        byDue.set(k, e);
      }
      for (const e of byDue.values()) entries.push({ ...e, detail: e.detail.join(", "), paid: e.owed === 0 });
    }
    if (["ACTIVE", "RESERVED"].includes(l.status) && inGrid(dateKeyOf(l.endDate))) entries.push({ dateKey: dateKeyOf(l.endDate), kind: "EXPIRY", label: who, detail: l.referenceNo, href });
    const inKey = dateKeyOf(l.moveInDate) || (l.status === "RESERVED" ? dateKeyOf(l.startDate) : null);
    if (inGrid(inKey)) entries.push({ dateKey: inKey, kind: "MOVE_IN", label: who, detail: l.status === "RESERVED" ? "Reserved: expected move-in" : l.referenceNo, href });
    if (inGrid(dateKeyOf(l.moveOutDate))) entries.push({ dateKey: dateKeyOf(l.moveOutDate), kind: "MOVE_OUT", label: who, detail: l.referenceNo, href });
  }
  for (const m of maintenance) {
    const k = toDateKey(m.scheduledFor, timeZone);
    if (inGrid(k)) entries.push({ dateKey: k, kind: "MAINTENANCE", label: `${m.referenceNo} · ${unitTitle(m.unit)}`, detail: [m.title, m.assignedTo, m.technician].filter(Boolean).join(" · "), href: `${base}/maintenance` });
  }
  for (const i of inspections) {
    const k = dateKeyOf(i.scheduledFor);
    if (inGrid(k)) entries.push({ dateKey: k, kind: "INSPECTION", label: `${i.referenceNo} · ${unitTitle(i.unit)}`, detail: i.kind.replace("_", "-").toLowerCase(), href: `${base}/inspections` });
  }
  entries.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.kind.localeCompare(b.kind));
  return { grid, days: grid.keys.map((dateKey) => ({ dateKey, entries: entries.filter((e) => e.dateKey === dateKey) })), entries };
}
