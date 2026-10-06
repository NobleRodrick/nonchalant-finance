/** The billing sheet of a month: what each active contract is billed (meters, fixed, shares) and what is already billed. */
import { db } from "@/lib/prisma";
import { dateKeyOf } from "@/lib/venue/dates";
import { CHARGE_KIND_LABELS } from "./account";

export async function billingSheet({ departmentId, monthKey, client = db }) {
  const [leases, charges] = await Promise.all([
    client.propertyLease.findMany({ where: { departmentId, status: "ACTIVE" }, include: { client: { select: { name: true } }, unit: { include: { building: { select: { id: true, name: true, sortOrder: true } }, chargeSettings: true } } }, orderBy: [{ unit: { building: { sortOrder: "asc" } } }, { unit: { name: "asc" } }] }),
    client.propertyCharge.findMany({ where: { departmentId, monthKey }, include: { lease: { select: { referenceNo: true, client: { select: { name: true } } } }, unit: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const billed = (leaseId, kind) => charges.find((c) => c.leaseId === leaseId && c.kind === kind && !c.voidedAt);
  const lastReadings = await client.propertyCharge.findMany({ where: { departmentId, voidedAt: null, currentReading: { not: null }, unitId: { in: leases.map((l) => l.unitId) } }, select: { unitId: true, kind: true, currentReading: true, date: true }, orderBy: { date: "desc" } });
  const rows = [];
  for (const l of leases) {
    if (dateKeyOf(l.startDate) > `${monthKey}-31`) continue;
    for (const s of l.unit.chargeSettings) {
      if (s.method === "INCLUDED") continue;
      const done = billed(l.id, s.kind);
      const last = lastReadings.find((r) => r.unitId === l.unitId && r.kind === s.kind);
      rows.push({
        leaseId: l.id,
        referenceNo: l.referenceNo,
        tenant: l.client.name,
        unit: { id: l.unitId, name: l.unit.name, building: l.unit.building },
        kind: s.kind,
        kindLabel: s.kind === "OTHER" ? s.label || "Other" : CHARGE_KIND_LABELS[s.kind],
        method: s.method,
        rate: s.rate,
        meterNumber: s.meterNumber,
        previousReading: last?.currentReading ?? s.lastReading ?? null,
        amount: s.method === "FIXED" ? Math.round(s.rate) : null,
        billed: done ? { referenceNo: done.referenceNo, amount: done.amount } : null,
      });
    }
  }
  const shareKinds = [...new Set(rows.filter((r) => r.method === "SHARE").map((r) => `${r.unit.building.id}:${r.kind}`))].map((k) => {
    const [buildingId, kind] = k.split(":");
    const r = rows.find((x) => x.unit.building.id === buildingId && x.kind === kind);
    return { buildingId, building: r.unit.building.name, kind, kindLabel: r.kindLabel, shares: rows.filter((x) => x.unit.building.id === buildingId && x.kind === kind && x.method === "SHARE").reduce((s, x) => s + x.rate, 0) };
  });
  return {
    monthKey,
    rows,
    shareKinds,
    charges: charges.map((c) => ({ ...c, dueKey: dateKeyOf(c.dueDate), kindLabel: CHARGE_KIND_LABELS[c.kind] })),
    total: charges.filter((c) => !c.voidedAt).reduce((s, c) => s + c.amount, 0),
  };
}
