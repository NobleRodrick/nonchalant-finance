/**
 * Reading buildings and offices: the board (every office with its status, tenant, rent and what
 * is owed), one office with its whole history.
 */
import { db } from "@/lib/prisma";
import { attachmentUrl } from "@/lib/attachments-url";
import { dateKeyOf } from "@/lib/venue/dates";
import { loadAccounts } from "./accounts";
import { monthOf, rateFor } from "./rent-schedule";
import { statusCounts, unitStatus } from "./unit-math";

export async function buildingsOf(departmentId, client = db) {
  return client.propertyBuilding.findMany({ where: { departmentId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

const LEASE_SELECT = { id: true, referenceNo: true, status: true, startDate: true, endDate: true, moveInDate: true, moveOutDate: true, rent: true, dueDay: true, monthsPerBill: true, depositRequired: true, client: { select: { id: true, name: true, company: true, phone: true, email: true } } };

/**
 * Every office (archived ones with `archived`), with: status, its building, the current list
 * rent, the live contract (tenant, rent, end) and that contract's account (owed, overdue, months
 * owed, deposit). Filters: buildingId, status, q (office, floor, category, tenant).
 */
export async function unitBoard({ departmentId, todayKey, buildingId = "", status = "", q = "", archived = false, client = db }) {
  const term = String(q || "").trim();
  const units = await client.propertyUnit.findMany({
    where: {
      departmentId,
      isActive: !archived,
      ...(buildingId ? { buildingId } : {}),
      ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { floor: { contains: term, mode: "insensitive" } }, { category: { contains: term, mode: "insensitive" } }, { leases: { some: { status: { in: ["ACTIVE", "RESERVED"] }, client: { name: { contains: term, mode: "insensitive" } } } } }] } : {}),
    },
    include: {
      building: { select: { id: true, name: true, sortOrder: true } },
      rates: { select: { fromMonth: true, amount: true } },
      chargeSettings: { select: { kind: true, label: true, method: true, rate: true } },
      leases: { where: { status: { in: ["ACTIVE", "RESERVED"] } }, select: LEASE_SELECT },
    },
    orderBy: [{ building: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const leases = units.flatMap((u) => u.leases);
  const accounts = await loadAccounts({ leases, todayKey, client });
  const thisMonth = monthOf(todayKey);
  const rows = units.map((u) => {
    const lease = u.leases.find((l) => l.status === "ACTIVE") || u.leases[0] || null;
    const account = lease ? accounts.get(lease.id) : null;
    return {
      id: u.id,
      name: u.name,
      floor: u.floor,
      category: u.category,
      size: u.size,
      condition: u.condition,
      building: u.building,
      state: u.state,
      stateNote: u.stateNote,
      availableFromKey: dateKeyOf(u.availableFrom),
      status: unitStatus(u, u.leases),
      listRent: rateFor(u.rates, thisMonth, u.listRent),
      depositRequired: u.depositRequired,
      charges: u.chargeSettings,
      lease: lease ? { ...lease, startKey: dateKeyOf(lease.startDate), endKey: dateKeyOf(lease.endDate), rentNow: account ? rateFor(account.terms.rates, thisMonth, lease.rent) : lease.rent } : null,
      account: account ? { outstanding: account.outstanding, overdue: account.overdue, monthsOwed: account.monthsOwed, daysOverdue: account.daysOverdue, status: account.status, credit: account.credit, deposit: account.deposit, byKind: account.byKind } : null,
    };
  });
  return status ? rows.filter((r) => r.status === status) : rows;
}

/** Counts by status, per building and for the whole business. */
export function boardSummary(rows, buildings) {
  return {
    all: statusCounts(rows),
    byBuilding: buildings.map((b) => ({ ...b, counts: statusCounts(rows.filter((r) => r.building.id === b.id)), expected: rows.filter((r) => r.building.id === b.id && r.lease?.status === "ACTIVE").reduce((s, r) => s + r.lease.rentNow, 0), owed: rows.filter((r) => r.building.id === b.id).reduce((s, r) => s + (r.account?.outstanding || 0), 0) })),
  };
}

/** One office: details, charge settings, price history, every contract, photos. */
export async function unitDetail({ departmentId, unitId, todayKey, client = db }) {
  const u = await client.propertyUnit.findFirst({
    where: { id: unitId, departmentId },
    include: {
      building: true,
      chargeSettings: { orderBy: { kind: "asc" } },
      rates: { orderBy: { fromMonth: "desc" } },
      leases: { select: { ...LEASE_SELECT, endedAt: true, endReason: true, cancelledAt: true, cancelReason: true }, orderBy: { startDate: "desc" } },
    },
  });
  if (!u) return null;
  const [photos, accounts] = await Promise.all([
    client.attachment.findMany({ where: { entityType: "PropertyUnit", entityId: u.id }, select: { id: true, fileName: true, mimeType: true }, orderBy: { createdAt: "asc" } }),
    loadAccounts({ leases: u.leases.filter((l) => l.status !== "CANCELLED"), todayKey, client }),
  ]);
  const thisMonth = monthOf(todayKey);
  const live = u.leases.filter((l) => ["ACTIVE", "RESERVED"].includes(l.status));
  return {
    ...u,
    status: unitStatus(u, live),
    listRentNow: rateFor(u.rates, thisMonth, u.listRent),
    availableFromKey: dateKeyOf(u.availableFrom),
    photos: photos.filter((p) => String(p.mimeType || "").startsWith("image/")).map((p) => ({ ...p, url: attachmentUrl(p.id) })),
    leases: u.leases.map((l) => {
      const a = accounts.get(l.id);
      return { ...l, rentNow: a ? rateFor(a.terms.rates, thisMonth, l.rent) : l.rent, startKey: dateKeyOf(l.startDate), endKey: dateKeyOf(l.endDate), moveInKey: dateKeyOf(l.moveInDate), moveOutKey: dateKeyOf(l.moveOutDate), account: a ? { outstanding: a.outstanding, overdue: a.overdue, monthsOwed: a.monthsOwed, status: a.status, deposit: a.deposit, paid: a.paidTotal, due: a.dueTotal } : null };
    }),
  };
}
