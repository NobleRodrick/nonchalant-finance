/**
 * What needs attention in a property rental department today (the dashboard's alerts, the morning
 * alert and the daily report use this list). Pure (unit-tested).
 *
 * `leases`: contracts shaped by lease-queries (status, client, unit, endKey, expiring, account,
 * deposit); `units`: the office board (status); `maintenance`: open requests; `inspections`:
 * planned ones; `unvalidated`: expenses waiting for approval { count, amount }.
 */
import { addDaysToKey } from "@/lib/timezone";
import { unitTitle } from "./unit-math";

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);

export function propertyWarnings({ leases = [], units = [], maintenance = [], inspections = [], unvalidated = { count: 0, amount: 0 }, todayKey, soonDays = 5, expiryDays = 60 }) {
  const out = [];
  const add = (w) => w.count && out.push(w);
  const soon = addDaysToKey(todayKey, soonDays);
  const row = (l, extra = {}) => ({ id: l.id, label: `${l.client.name} · ${unitTitle(l.unit)}`, href: `/contracts/${l.id}`, ...extra });

  const overdueRent = leases.filter((l) => l.account && l.account.rentOutstanding > 0 && l.account.overdue > 0);
  add({ key: "overdue-rent", tone: "bad", count: overdueRent.length, amount: sum(overdueRent, (l) => l.account.rentOutstanding), title: `${plural(overdueRent.length, "tenant")} with overdue rent`, detail: "Rent past its due date: remind them, or agree a payment plan.", href: "/arrears?kind=rent", rows: overdueRent.sort((a, b) => b.account.daysOverdue - a.account.daysOverdue).map((l) => row(l, { amount: l.account.rentOutstanding, note: `${l.account.monthsOwed} month(s)` })) });

  const utilities = leases.filter((l) => l.account && l.account.utilitiesOutstanding > 0 && l.account.overdue > 0);
  add({ key: "unpaid-utilities", tone: "warn", count: utilities.length, amount: sum(utilities, (l) => l.account.utilitiesOutstanding), title: `${plural(utilities.length, "tenant")} owing electricity, water or other charges`, detail: "Utility bills and charges past their due date.", href: "/arrears?kind=utilities", rows: utilities.map((l) => row(l, { amount: l.account.utilitiesOutstanding })) });

  const dueSoon = leases.filter((l) => l.status === "ACTIVE" && l.account?.next && l.account.next.dueKey <= soon && !l.account.outstanding);
  add({ key: "rent-due", tone: "info", count: dueSoon.length, amount: sum(dueSoon, (l) => l.account.next.balance), title: `${plural(dueSoon.length, "payment")} due in the next ${soonDays} days`, detail: "Send a reminder before the due date.", href: "/calendar", rows: dueSoon.map((l) => row(l, { amount: l.account.next.balance, note: l.account.next.dueKey })) });

  const expiring = leases.filter((l) => l.expiring);
  add({ key: "expiring", tone: "warn", count: expiring.length, title: `${plural(expiring.length, "contract")} ending within ${expiryDays} days`, detail: "Renew them, or plan the move-out and the next tenant.", href: "/contracts", rows: expiring.sort((a, b) => a.endKey.localeCompare(b.endKey)).map((l) => row(l, { note: `ends ${l.endKey}` })) });

  const vacant = units.filter((u) => u.status === "AVAILABLE" || u.status === "AWAITING_HANDOVER");
  add({ key: "vacant", tone: "info", count: vacant.length, amount: sum(vacant, (u) => u.listRent), title: `${plural(vacant.length, "vacant office")} (rent not earned a month)`, detail: vacant.some((u) => u.status === "AWAITING_HANDOVER") ? "Some wait for their handover: confirm they are ready." : "Free for a new tenant.", href: "/offices?status=AVAILABLE", rows: vacant.map((u) => ({ id: u.id, label: `${u.name} · ${u.building.name}`, note: u.status === "AWAITING_HANDOVER" ? "awaiting handover" : "available", href: `/offices/${u.id}` })) });

  const depositMissing = leases.filter((l) => ["ACTIVE", "RESERVED"].includes(l.status) && l.deposit && l.deposit.required > l.deposit.received);
  const depositToSettle = leases.filter((l) => l.status === "ENDED" && l.deposit && l.deposit.held > 0);
  add({ key: "deposits", tone: "warn", count: depositMissing.length + depositToSettle.length, title: `${plural(depositMissing.length + depositToSettle.length, "deposit")} requiring action`, detail: `${depositMissing.length} not fully paid, ${depositToSettle.length} still held for tenants who left (refund or use it).`, href: "/contracts?status=all", rows: [...depositToSettle.map((l) => row(l, { amount: l.deposit.held, note: "held after move-out" })), ...depositMissing.map((l) => row(l, { amount: l.deposit.required - l.deposit.received, note: "still to receive" }))] });

  const urgent = maintenance.filter((m) => m.priority === "URGENT");
  add({ key: "maintenance", tone: urgent.length ? "bad" : "warn", count: maintenance.length, title: `${plural(maintenance.length, "maintenance request")} open${urgent.length ? ` (${urgent.length} urgent)` : ""}`, detail: `${maintenance.filter((m) => m.status === "REPORTED").length} waiting for approval.`, href: "/maintenance", rows: maintenance.map((m) => ({ id: m.id, label: `${m.referenceNo} · ${m.unit.name}: ${m.title}`, note: m.priority === "URGENT" ? "urgent" : m.status.toLowerCase().replace("_", " "), href: "/maintenance" })) });

  const due = inspections.filter((i) => i.scheduledKey && i.scheduledKey <= addDaysToKey(todayKey, 2));
  add({ key: "inspections", tone: "info", count: due.length, title: `${plural(due.length, "inspection")} to do`, detail: "Planned for today, the next two days, or late.", href: "/inspections?state=planned", rows: due.map((i) => ({ id: i.id, label: `${i.referenceNo} · ${i.unit.name}`, note: i.scheduledKey, href: "/inspections?state=planned" })) });

  add({ key: "approvals", tone: "info", count: unvalidated.count, amount: unvalidated.amount, title: `${plural(unvalidated.count, "expense")} waiting for approval`, detail: "Recorded by one person, approved by another.", href: "/money?pending=1", rows: [] });

  return out;
}

export function warningsLine(warnings) {
  return warnings.map((w) => w.title).join(" · ");
}
