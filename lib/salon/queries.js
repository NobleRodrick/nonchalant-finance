/**
 * Read side of a salon, spa or gym: appointments of a day (per staff member), membership plans,
 * memberships with their state, the dashboard and what needs attention.
 */
import { db } from "@/lib/prisma";
import { formatTimeInZone, rangeBounds, toDateKey } from "@/lib/timezone";
import { appointmentEnd, membershipState, renewalDue, salonWarnings } from "./salon-math";

export { salonWarnings };

const dk = (d) => (d ? d.toISOString().slice(0, 10) : null);

/** Appointments of a day, by start time. */
export async function appointmentsOfDay({ departmentId, dateKey, timeZone, client = db }) {
  const { start, end } = rangeBounds(dateKey, dateKey, timeZone);
  const rows = await client.appointment.findMany({ where: { departmentId, startAt: { gte: start, lte: end } }, include: { worker: { select: { name: true } } }, orderBy: { startAt: "asc" } });
  const tickets = await client.serviceTicket.findMany({ where: { id: { in: rows.map((a) => a.ticketId).filter(Boolean) } }, select: { id: true, status: true, referenceNo: true } });
  return rows.map((a) => ({
    id: a.id,
    referenceNo: a.referenceNo,
    customer: a.customerName,
    phone: a.customerPhone,
    itemId: a.itemId,
    service: a.serviceLabel,
    workerId: a.workerId,
    worker: a.worker?.name || null,
    startAt: a.startAt.toISOString(),
    time: formatTimeInZone(a.startAt, timeZone),
    endTime: formatTimeInZone(new Date(appointmentEnd(a)), timeZone),
    minutes: a.minutes,
    status: a.status,
    note: a.note,
    cancelReason: a.cancelReason,
    ticket: tickets.find((t) => t.id === a.ticketId) || null,
  }));
}

export async function planList({ departmentId, client = db }) {
  const plans = await client.membershipPlan.findMany({ where: { departmentId }, include: { _count: { select: { memberships: true } } }, orderBy: [{ isActive: "desc" }, { price: "asc" }] });
  return plans.map((p) => ({ id: p.id, name: p.name, kind: p.kind, days: p.days, sessions: p.sessions, price: p.price, isActive: p.isActive, sold: p._count.memberships }));
}

/** Memberships with their state on `todayKey` (most recent first); `q` name, phone, MB-… */
export async function membershipList({ departmentId, todayKey, timeZone, q, client = db }) {
  const text = String(q || "").trim().slice(0, 60);
  const rows = await client.membership.findMany({
    where: { departmentId, ...(text ? { OR: [{ customerName: { contains: text, mode: "insensitive" } }, { customerPhone: { contains: text } }, { referenceNo: { contains: text, mode: "insensitive" } }] } : {}) },
    include: { plan: { select: { name: true, kind: true } }, visits: { where: { voidedAt: null }, select: { id: true, date: true }, orderBy: { date: "desc" } }, records: { select: { id: true, referenceNo: true, status: true, paymentMethod: true } } },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return rows.map((m) => {
    const startKey = dk(m.startDate);
    const endKey = dk(m.endDate);
    const state = membershipState({ status: m.status, startKey, endKey, sessionsTotal: m.sessionsTotal }, m.visits.length, todayKey);
    const sale = m.records.find((r) => r.status !== "VOIDED") || m.records[0] || null;
    return {
      id: m.id,
      referenceNo: m.referenceNo,
      customer: m.customerName,
      phone: m.customerPhone,
      clientId: m.clientId,
      planId: m.planId,
      plan: m.plan.name,
      kind: m.plan.kind,
      startKey,
      endKey,
      sessionsTotal: m.sessionsTotal,
      used: m.visits.length,
      lastVisit: m.visits[0] ? `${toDateKey(m.visits[0].date, timeZone)} ${formatTimeInZone(m.visits[0].date, timeZone)}` : null,
      price: m.price,
      onCredit: sale?.paymentMethod === "CREDIT",
      sale: sale ? { id: sale.id, referenceNo: sale.referenceNo } : null,
      cancelReason: m.cancelReason,
      state,
      renew: renewalDue(state),
    };
  });
}

/** The salon / gym part of the dashboard: today's appointments, members, sales of memberships. */
export async function salonDashboard({ department, todayKey, timeZone, now = new Date(), client = db }) {
  const { start, end } = rangeBounds(todayKey, todayKey, timeZone);
  const monthFrom = `${todayKey.slice(0, 7)}-01`;
  const month = rangeBounds(monthFrom, todayKey, timeZone);
  const [appointments, memberships, visitsToday, soldMonth] = await Promise.all([
    appointmentsOfDay({ departmentId: department.id, dateKey: todayKey, timeZone, client }),
    membershipList({ departmentId: department.id, todayKey, timeZone, client }),
    client.membershipVisit.count({ where: { voidedAt: null, date: { gte: start, lte: end }, membership: { departmentId: department.id } } }),
    client.transaction.aggregate({ where: { departmentId: department.id, category: "membership-sale", status: { not: "VOIDED" }, date: { gte: month.start, lte: month.end } }, _sum: { amount: true }, _count: true }),
  ]);
  return {
    appointments,
    members: { active: memberships.filter((m) => m.state.status === "ACTIVE").length, renew: memberships.filter((m) => m.renew).length, checkIns: visitsToday },
    memberships: { soldMonth: Math.round(Number(soldMonth._sum.amount || 0)), countMonth: soldMonth._count },
    renewals: memberships.filter((m) => m.renew).slice(0, 10),
    warnings: salonWarnings({ memberships, appointments, nowIso: now.toISOString() }),
  };
}

/** Appointments, memberships and check-ins of a period (the Reports page). */
export async function salonReport({ departmentId, fromKey, toKey, timeZone, client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [appointments, sold, visits, plans] = await Promise.all([
    client.appointment.groupBy({ by: ["status"], where: { departmentId, startAt: { gte: start, lte: end } }, _count: true }),
    client.membership.findMany({ where: { departmentId, createdAt: { gte: start, lte: end } }, select: { planId: true, price: true, status: true } }),
    client.membershipVisit.count({ where: { voidedAt: null, date: { gte: start, lte: end }, membership: { departmentId } } }),
    client.membershipPlan.findMany({ where: { departmentId }, select: { id: true, name: true } }),
  ]);
  const count = (s) => appointments.find((a) => a.status === s)?._count || 0;
  const total = appointments.reduce((s, a) => s + a._count, 0);
  const live = sold.filter((m) => m.status !== "CANCELLED");
  const byPlan = plans.map((p) => ({ name: p.name, sold: live.filter((m) => m.planId === p.id).length, amount: live.filter((m) => m.planId === p.id).reduce((s, m) => s + m.price, 0) })).filter((p) => p.sold).sort((a, b) => b.amount - a.amount);
  return {
    appointments: { total, arrived: count("ARRIVED"), noShow: count("NO_SHOW"), cancelled: count("CANCELLED"), noShowPct: total - count("CANCELLED") ? Math.round((count("NO_SHOW") / (total - count("CANCELLED"))) * 1000) / 10 : 0 },
    memberships: { sold: live.length, amount: live.reduce((s, m) => s + m.price, 0), cancelled: sold.length - live.length, byPlan },
    checkIns: visits,
  };
}
