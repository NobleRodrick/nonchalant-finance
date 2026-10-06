/**
 * Reading contracts and tenants: lists with what each owes, a contract with its whole account
 * (months, charges, payments and what they paid, deposit, inspections, maintenance, documents),
 * a tenant with all their contracts and statement, the rent arrears dashboard.
 */
import { db } from "@/lib/prisma";
import { attachmentUrl } from "@/lib/attachments-url";
import { categoryLabel } from "@/data/categories";
import { toDateKey } from "@/lib/timezone";
import { dateKeyOf } from "@/lib/venue/dates";
import { loadAccounts } from "./accounts";
import { CHARGE_KIND_LABELS, depositStatus } from "./account";
import { monthLabel, monthOf, rateFor } from "./rent-schedule";
import { tenantStatement } from "./statement";
import { expiresSoon } from "./unit-math";

const UNIT = { select: { id: true, name: true, floor: true, buildingId: true, building: { select: { id: true, name: true } } } };
const CLIENT = { select: { id: true, name: true, company: true, phone: true, phoneAlt: true, email: true, address: true, identification: true, notes: true } };

function shape(l, account, todayKey) {
  const thisMonth = monthOf(todayKey);
  return {
    ...l,
    startKey: dateKeyOf(l.startDate),
    endKey: dateKeyOf(l.endDate),
    moveInKey: dateKeyOf(l.moveInDate),
    moveOutKey: dateKeyOf(l.moveOutDate),
    rentNow: account ? rateFor(account.terms.rates, thisMonth, l.rent) : l.rent,
    expiring: expiresSoon({ status: l.status, endKey: dateKeyOf(l.endDate) }, todayKey, 60),
    account: account ? { outstanding: account.outstanding, overdue: account.overdue, monthsOwed: account.monthsOwed, daysOverdue: account.daysOverdue, oldestDueKey: account.oldestDueKey, status: account.status, byKind: account.byKind, rentOutstanding: account.rentOutstanding, utilitiesOutstanding: account.utilitiesOutstanding, credit: account.credit, paidAhead: account.paidAhead, dueTotal: account.dueTotal, paidTotal: account.paidTotal, next: account.next ? { label: account.next.label, dueKey: account.next.dueKey, balance: account.next.balance } : null } : null,
    deposit: account?.deposit || null,
    depositStatus: account ? depositStatus(account.deposit) : null,
  };
}

/** Contracts (filters: status "live" | a status | "all", buildingId, q), newest first. */
export async function leaseList({ departmentId, todayKey, status = "live", buildingId = "", q = "", client = db }) {
  const term = String(q || "").trim();
  const rows = await client.propertyLease.findMany({
    where: {
      departmentId,
      ...(status === "live" ? { status: { in: ["ACTIVE", "RESERVED"] } } : status && status !== "all" ? { status } : {}),
      ...(buildingId ? { unit: { buildingId } } : {}),
      ...(term ? { OR: [{ referenceNo: { contains: term, mode: "insensitive" } }, { client: { name: { contains: term, mode: "insensitive" } } }, { client: { phone: { contains: term } } }, { unit: { name: { contains: term, mode: "insensitive" } } }] } : {}),
    },
    include: { unit: UNIT, client: CLIENT },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    take: 1000,
  });
  const accounts = await loadAccounts({ leases: rows, todayKey, client });
  return rows.map((l) => shape(l, accounts.get(l.id), todayKey));
}

/**
 * The rent arrears dashboard: every contract that owes, with rent due, paid, balance, months
 * owed, days overdue, what is owed by kind. Filters: buildingId, unitId, minAmount, minMonths,
 * minDays, kind ("rent" | "utilities").
 */
export async function arrears({ departmentId, todayKey, buildingId = "", unitId = "", minAmount = 0, minMonths = 0, minDays = 0, kind = "", client = db }) {
  const leases = await leaseList({ departmentId, todayKey, status: "all", buildingId, client });
  const rows = leases
    .filter((l) => l.status !== "CANCELLED" && l.account && l.account.outstanding > 0)
    .filter((l) => !unitId || l.unitId === unitId)
    .filter((l) => (kind === "rent" ? l.account.rentOutstanding > 0 : kind === "utilities" ? l.account.utilitiesOutstanding > 0 : true))
    .filter((l) => l.account.outstanding >= Number(minAmount || 0) && l.account.monthsOwed >= Number(minMonths || 0) && l.account.daysOverdue >= Number(minDays || 0))
    .map((l) => ({ id: l.id, referenceNo: l.referenceNo, status: l.status, tenant: l.client, unit: l.unit, rentNow: l.rentNow, due: l.account.dueTotal, paid: l.account.paidTotal, balance: l.account.outstanding, overdue: l.account.overdue, rent: l.account.rentOutstanding, utilities: l.account.utilitiesOutstanding, byKind: l.account.byKind, monthsOwed: l.account.monthsOwed, daysOverdue: l.account.daysOverdue, oldestDueKey: l.account.oldestDueKey, deposit: l.deposit }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance);
  const totals = { tenants: new Set(rows.map((r) => r.tenant.id)).size, contracts: rows.length, balance: 0, overdue: 0, rent: 0, utilities: 0, byKind: {} };
  for (const r of rows) {
    totals.balance += r.balance;
    totals.overdue += r.overdue;
    totals.rent += r.rent;
    totals.utilities += r.utilities;
    for (const [k, v] of Object.entries(r.byKind)) totals.byKind[k] = (totals.byKind[k] || 0) + v;
  }
  const buckets = [["0–30 days", 0, 30], ["31–60 days", 31, 60], ["61–90 days", 61, 90], ["Over 90 days", 91, 1e9]].map(([label, a, b]) => ({ label, amount: rows.filter((r) => r.daysOverdue >= a && r.daysOverdue <= b).reduce((s, r) => s + r.balance, 0), count: rows.filter((r) => r.daysOverdue >= a && r.daysOverdue <= b).length }));
  return { rows, totals, buckets };
}

/** Credits of a contract for its statement: payments, deposit used, forgiven, refunds. */
async function creditsOf(client, leaseId, timeZone) {
  const [money, deposits, waivers] = await Promise.all([
    client.transaction.findMany({ where: { leaseId, status: { not: "VOIDED" }, category: { in: ["lease-payment", "lease-refund"] } }, select: { referenceNo: true, amount: true, date: true, category: true, paymentMethod: true } }),
    client.propertyDeposit.findMany({ where: { leaseId, voidedAt: null, kind: { in: ["APPLIED_RENT", "APPLIED_CHARGES", "APPLIED_DAMAGE"] } }, select: { amount: true, date: true, kind: true } }),
    client.propertyAllocation.findMany({ where: { leaseId, voidedAt: null, source: "WAIVER" }, select: { amount: true, date: true, note: true, monthKey: true } }),
  ]);
  return [
    ...money.map((m) => ({ dateKey: toDateKey(m.date, timeZone), referenceNo: m.referenceNo, amount: Number(m.amount), kind: m.category === "lease-refund" ? "REFUND" : "PAYMENT", label: m.category === "lease-refund" ? "Refund" : "Payment" })),
    ...deposits.map((d) => ({ dateKey: toDateKey(d.date, timeZone), amount: d.amount, kind: "DEPOSIT", label: `Deposit used for ${d.kind === "APPLIED_RENT" ? "rent" : d.kind === "APPLIED_DAMAGE" ? "damages" : "charges"}` })),
    ...waivers.map((w) => ({ dateKey: toDateKey(w.date, timeZone), amount: w.amount, kind: "WAIVER", label: `Forgiven${w.monthKey ? ` (rent ${monthLabel(w.monthKey, true)})` : ""}: ${w.note || ""}` })),
  ];
}

/** One contract with everything about it. */
export async function leaseDetail({ departmentId, leaseId, todayKey, timeZone, client = db }) {
  const l = await client.propertyLease.findFirst({ where: { id: leaseId, departmentId }, include: { unit: { include: { building: true, chargeSettings: true } }, client: CLIENT, createdBy: { select: { name: true } }, rates: { orderBy: { fromMonth: "desc" } } } });
  if (!l) return null;
  const [accounts, charges, money, deposits, allocations, inspections, maintenance, docs, credits] = await Promise.all([
    loadAccounts({ leases: [l], todayKey, ahead: 3, client }),
    client.propertyCharge.findMany({ where: { leaseId: l.id }, orderBy: [{ monthKey: "desc" }, { date: "desc" }] }),
    client.transaction.findMany({ where: { leaseId: l.id }, orderBy: { date: "desc" }, select: { id: true, referenceNo: true, type: true, category: true, amount: true, paymentMethod: true, reference: true, receivedByName: true, date: true, status: true, voidReason: true, description: true, user: { select: { name: true } } } }),
    client.propertyDeposit.findMany({ where: { leaseId: l.id }, orderBy: { date: "asc" } }),
    client.propertyAllocation.findMany({ where: { leaseId: l.id, voidedAt: null }, select: { transactionId: true, depositId: true, monthKey: true, chargeId: true, amount: true, source: true } }),
    client.propertyInspection.findMany({ where: { leaseId: l.id }, orderBy: { createdAt: "desc" } }),
    client.propertyMaintenance.findMany({ where: { leaseId: l.id }, orderBy: { reportedAt: "desc" } }),
    client.attachment.findMany({ where: { entityType: "PropertyLease", entityId: l.id }, select: { id: true, fileName: true } }),
    creditsOf(client, l.id, timeZone),
  ]);
  const account = accounts.get(l.id);
  const chargeLabel = new Map(charges.map((c) => [c.id, c.label]));
  const coveredBy = (txId) => allocations.filter((a) => a.transactionId === txId).map((a) => ({ label: a.chargeId ? chargeLabel.get(a.chargeId) : `Rent ${monthLabel(a.monthKey)}`, amount: a.amount }));
  const shaped = shape(l, account, todayKey);
  const due = account ? account.items.filter((i) => i.due) : [];
  return {
    ...shaped,
    unit: l.unit,
    items: account?.items || [],
    statement: tenantStatement({ items: due, credits }),
    charges: charges.map((c) => ({ ...c, dueKey: dateKeyOf(c.dueDate), kindLabel: CHARGE_KIND_LABELS[c.kind] })),
    payments: money.map((m) => ({ ...m, amount: Number(m.amount), dateKey: toDateKey(m.date, timeZone), what: categoryLabel(m.category), covered: coveredBy(m.id) })),
    depositLedger: deposits.map((d) => ({ ...d, dateKey: toDateKey(d.date, timeZone) })),
    inspections: inspections.map((i) => ({ ...i, scheduledKey: dateKeyOf(i.scheduledFor), doneKey: i.doneAt ? toDateKey(i.doneAt, timeZone) : null })),
    maintenance,
    documents: docs.map((d) => ({ ...d, url: attachmentUrl(d.id) })),
  };
}

/** Tenants (customers with contracts): offices, what they owe, deposit held, last payment. */
export async function tenantList({ departmentId, todayKey, q = "", client = db }) {
  const leases = await leaseList({ departmentId, todayKey, status: "all", q, client });
  const by = new Map();
  for (const l of leases) {
    if (l.status === "CANCELLED") continue;
    const t = by.get(l.client.id) || { ...l.client, contracts: 0, live: [], owed: 0, overdue: 0, monthsOwed: 0, depositHeld: 0, rent: 0 };
    t.contracts += 1;
    if (["ACTIVE", "RESERVED"].includes(l.status)) {
      t.live.push({ id: l.id, unit: l.unit, status: l.status, endKey: l.endKey });
      if (l.status === "ACTIVE") t.rent += l.rentNow;
    }
    t.owed += l.account?.outstanding || 0;
    t.overdue += l.account?.overdue || 0;
    t.monthsOwed += l.account?.monthsOwed || 0;
    t.depositHeld += l.deposit?.held || 0;
    by.set(l.client.id, t);
  }
  return [...by.values()].map((t) => ({ ...t, status: t.overdue ? "OVERDUE" : t.owed ? "OWES" : "PAID" })).sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
}

/** One tenant: profile, every contract with its account, payments and statement. */
export async function tenantDetail({ departmentId, clientId, todayKey, timeZone, client = db }) {
  const c = await client.venueClient.findFirst({ where: { id: clientId, departmentId } });
  if (!c) return null;
  const leases = await client.propertyLease.findMany({ where: { clientId: c.id, departmentId }, select: { id: true }, orderBy: { startDate: "desc" } });
  const details = (await Promise.all(leases.map((l) => leaseDetail({ departmentId, leaseId: l.id, todayKey, timeZone, client })))).filter(Boolean);
  const live = details.filter((d) => d.status !== "CANCELLED");
  return {
    ...c,
    leases: details,
    owed: live.reduce((s, d) => s + (d.account?.outstanding || 0), 0),
    overdue: live.reduce((s, d) => s + (d.account?.overdue || 0), 0),
    depositHeld: live.reduce((s, d) => s + (d.deposit?.held || 0), 0),
    paid: live.reduce((s, d) => s + d.payments.filter((p) => p.status !== "VOIDED" && p.category === "lease-payment").reduce((x, p) => x + p.amount, 0), 0),
  };
}
