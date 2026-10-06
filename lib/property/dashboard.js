/**
 * The facts behind a property rental department's dashboard and alerts: contracts with their
 * accounts, offices, open maintenance, planned inspections, expenses waiting for approval →
 * warnings (lib/property/alert-math); payments due this week.
 */
import { db } from "@/lib/prisma";
import { addDaysToKey, toDateKey } from "@/lib/timezone";
import { dateKeyOf } from "@/lib/venue/dates";
import { leaseList } from "./lease-queries";
import { boardSummary, buildingsOf, unitBoard } from "./unit-queries";
import { propertyWarnings } from "./alert-math";

export async function propertyAttention({ departmentId, todayKey, timeZone, client = db }) {
  const [leases, units, buildings, maintenance, inspections, unvalidated] = await Promise.all([
    leaseList({ departmentId, todayKey, status: "all", client }),
    unitBoard({ departmentId, todayKey, client }),
    buildingsOf(departmentId, client),
    client.propertyMaintenance.findMany({ where: { departmentId, status: { in: ["REPORTED", "APPROVED", "IN_PROGRESS"] } }, include: { unit: { select: { name: true } } }, orderBy: { reportedAt: "asc" } }),
    client.propertyInspection.findMany({ where: { departmentId, doneAt: null }, include: { unit: { select: { name: true } } } }),
    client.transaction.aggregate({ where: { departmentId, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, status: { not: "VOIDED" }, validatedAt: null }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const live = leases.filter((l) => l.status !== "CANCELLED" && (l.status !== "ENDED" || l.account?.outstanding > 0 || l.deposit?.held > 0));
  const warnings = propertyWarnings({
    leases: live,
    units,
    maintenance,
    inspections: inspections.map((i) => ({ ...i, scheduledKey: dateKeyOf(i.scheduledFor) })),
    unvalidated: { count: unvalidated._count._all, amount: Math.round(Number(unvalidated._sum.amount || 0)) },
    todayKey,
  });
  return { leases, units, buildings, summary: boardSummary(units, buildings), warnings, maintenance, timeZone };
}

/** Dashboard: warnings, offices, tenants, payments due in the next 7 days, moves. */
export async function propertyDashboard({ departmentId, todayKey, timeZone, client = db }) {
  const a = await propertyAttention({ departmentId, todayKey, timeZone, client });
  const week = addDaysToKey(todayKey, 7);
  const active = a.leases.filter((l) => l.status === "ACTIVE");
  const withDebt = a.leases.filter((l) => l.status !== "CANCELLED" && l.account?.outstanding > 0);
  return {
    ...a,
    tenants: {
      total: new Set(active.map((l) => l.client.id)).size,
      owing: new Set(withDebt.map((l) => l.client.id)).size,
      overdue: new Set(withDebt.filter((l) => l.account.overdue > 0).map((l) => l.client.id)).size,
      paid: new Set(active.filter((l) => !l.account?.outstanding).map((l) => l.client.id)).size,
    },
    rentPerMonth: active.reduce((s, l) => s + l.rentNow, 0),
    dueThisWeek: active.filter((l) => l.account?.next && l.account.next.dueKey <= week).map((l) => ({ id: l.id, tenant: l.client.name, unit: l.unit, dueKey: l.account.next.dueKey, label: l.account.next.label, amount: l.account.next.balance })).sort((x, y) => x.dueKey.localeCompare(y.dueKey)),
    moves: a.leases.filter((l) => (l.status === "RESERVED" && l.startKey <= week) || (l.status === "ACTIVE" && l.endKey && l.endKey <= addDaysToKey(todayKey, 30))).map((l) => ({ id: l.id, tenant: l.client.name, unit: l.unit, kind: l.status === "RESERVED" ? "Moves in" : "Contract ends", dateKey: l.status === "RESERVED" ? l.startKey : l.endKey })),
    todayKey,
    renderedAt: toDateKey(new Date(), timeZone),
  };
}
