/**
 * One search box across a property rental department: tenants (name, phone, e-mail, company,
 * identification), offices (name, building, floor, category), contracts, payments and receipts
 * (number, MoMo / bank reference, payer), charges, maintenance and inspections. "owing more than
 * 100000" (or "> 100000") lists the tenants who owe more than that amount.
 */
import { db } from "@/lib/prisma";
import { categoryLabel } from "@/data/categories";
import { toDateKey } from "@/lib/timezone";
import { searchQuery } from "@/lib/rental/search";
import { arrears } from "./lease-queries";
import { LEASE_STATUS_LABELS, MAINTENANCE_STATUS_LABELS, unitTitle } from "./unit-math";
import { owingThreshold } from "./search-query";

const like = (q) => ({ contains: q, mode: "insensitive" });

export { owingThreshold };

export async function propertySearch({ departmentId, q: raw, todayKey, timeZone, take = 20, client = db }) {
  const q = searchQuery(raw);
  if (!q) return null;
  const threshold = owingThreshold(q);
  if (threshold) {
    const a = await arrears({ departmentId, todayKey, minAmount: threshold + 1, client });
    const owing = a.rows.map((r) => ({ id: r.id, title: `${r.tenant.name} · ${unitTitle(r.unit)}`, detail: `${r.monthsOwed} month(s) of rent · ${r.daysOverdue} days overdue`, amount: r.balance, href: `/contracts/${r.id}` }));
    return { q, groups: { owing }, total: owing.length, threshold };
  }
  const digits = q.replace(/\D/g, "");
  const [tenants, units, leases, money, charges, maintenance, inspections] = await Promise.all([
    client.venueClient.findMany({ where: { departmentId, OR: [{ name: like(q) }, { company: like(q) }, { email: like(q) }, { identification: like(q) }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }, { phoneAlt: { contains: digits } }] : [])] }, select: { id: true, name: true, phone: true, company: true, _count: { select: { propertyLeases: true } } }, orderBy: { name: "asc" }, take }),
    client.propertyUnit.findMany({ where: { departmentId, OR: [{ name: like(q) }, { floor: like(q) }, { category: like(q) }, { building: { name: like(q) } }] }, select: { id: true, name: true, floor: true, category: true, isActive: true, building: { select: { name: true } } }, orderBy: { name: "asc" }, take }),
    client.propertyLease.findMany({ where: { departmentId, OR: [{ referenceNo: like(q) }, { client: { name: like(q) } }, { unit: { name: like(q) } }] }, select: { id: true, referenceNo: true, status: true, startDate: true, client: { select: { name: true } }, unit: { select: { name: true, building: { select: { name: true } } } } }, orderBy: { startDate: "desc" }, take }),
    client.transaction.findMany({ where: { departmentId, OR: [{ referenceNo: like(q) }, { counterparty: like(q) }, { description: like(q) }, { reference: like(q) }, { receivedByName: like(q) }] }, select: { id: true, referenceNo: true, type: true, category: true, amount: true, date: true, status: true, counterparty: true, leaseId: true }, orderBy: { date: "desc" }, take }),
    client.propertyCharge.findMany({ where: { departmentId, OR: [{ referenceNo: like(q) }, { label: like(q) }] }, select: { id: true, referenceNo: true, label: true, amount: true, monthKey: true, leaseId: true, voidedAt: true }, orderBy: { date: "desc" }, take }),
    client.propertyMaintenance.findMany({ where: { departmentId, OR: [{ referenceNo: like(q) }, { title: like(q) }, { technician: like(q) }] }, select: { id: true, referenceNo: true, title: true, status: true, unit: { select: { name: true } } }, orderBy: { reportedAt: "desc" }, take }),
    client.propertyInspection.findMany({ where: { departmentId, referenceNo: like(q) }, select: { id: true, referenceNo: true, kind: true, unitId: true, unit: { select: { name: true } } }, take }),
  ]);
  const groups = {
    tenants: tenants.map((c) => ({ id: c.id, title: c.name, detail: [c.company, c.phone, `${c._count.propertyLeases} contract(s)`].filter(Boolean).join(" · "), href: `/tenants/${c.id}` })),
    offices: units.map((u) => ({ id: u.id, title: `${u.name} · ${u.building.name}`, detail: [u.floor && `Floor ${u.floor}`, u.category, !u.isActive && "archived"].filter(Boolean).join(" · "), href: `/offices/${u.id}` })),
    contracts: leases.map((l) => ({ id: l.id, title: `${l.referenceNo} · ${l.client.name}`, detail: `${unitTitle(l.unit)} · ${LEASE_STATUS_LABELS[l.status]}`, href: `/contracts/${l.id}` })),
    money: money.map((t) => ({ id: t.id, title: `${t.referenceNo} · ${categoryLabel(t.category)}`, detail: [toDateKey(t.date, timeZone), t.counterparty, t.status === "VOIDED" ? "void" : null].filter(Boolean).join(" · "), amount: Number(t.amount), href: t.leaseId && ["lease-payment", "lease-deposit"].includes(t.category) && t.status !== "VOIDED" ? `/contracts/${t.leaseId}/documents/receipt?t=${t.id}` : `/money?ref=${encodeURIComponent(t.referenceNo)}` })),
    records: [
      ...charges.map((c) => ({ id: c.id, title: `${c.referenceNo} · ${c.label}`, detail: `${c.monthKey}${c.voidedAt ? " · void" : ""}`, amount: c.amount, href: `/contracts/${c.leaseId}` })),
      ...maintenance.map((m) => ({ id: m.id, title: `${m.referenceNo} · ${m.title}`, detail: `${m.unit.name} · ${MAINTENANCE_STATUS_LABELS[m.status]}`, href: "/maintenance?status=all" })),
      ...inspections.map((i) => ({ id: i.id, title: `${i.referenceNo} · inspection`, detail: `${i.unit.name} · ${i.kind.toLowerCase().replace("_", "-")}`, href: `/offices/${i.unitId}` })),
    ],
  };
  return { q, groups, total: Object.values(groups).reduce((s, g) => s + g.length, 0) };
}
