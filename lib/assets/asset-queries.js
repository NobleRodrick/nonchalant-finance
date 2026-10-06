/** Reading the asset register of a department with its computed values. */
import { db } from "@/lib/prisma";
import { dateKeyOf } from "@/lib/venue/dates";
import { assetValue, depreciationBetween, disposalResult } from "./depreciation";

/**
 * Every asset with its value on `asOfKey`: monthly charge, accumulated depreciation, book value,
 * remaining life. `status`: "active" (default), "disposed", "all".
 */
export async function assetRegister({ departmentId, asOfKey, status = "active", q = "", client = db }) {
  const term = String(q || "").trim();
  const rows = await client.fixedAsset.findMany({
    where: {
      departmentId,
      ...(status === "disposed" ? { disposedOn: { not: null } } : status === "all" ? {} : { disposedOn: null }),
      ...(term ? { OR: ["name", "code", "category", "supplier", "location", "responsibleName"].map((f) => ({ [f]: { contains: term, mode: "insensitive" } })) } : {}),
    },
    include: { rentalItem: { select: { id: true, name: true, code: true } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rows.map((a) => ({ ...a, purchaseDateKey: dateKeyOf(a.purchaseDate), disposedOnKey: dateKeyOf(a.disposedOn), value: assetValue(a, asOfKey), disposalResult: disposalResult(a) }));
}

/** Totals of a register: cost, accumulated depreciation, book value, monthly charge. */
export function registerTotals(assets) {
  const t = { count: 0, cost: 0, accumulated: 0, bookValue: 0, monthly: 0 };
  for (const a of assets) {
    if (a.disposedOn) continue;
    t.count += 1;
    t.cost += a.cost;
    t.accumulated += a.value.accumulated;
    t.bookValue += a.value.bookValue;
    t.monthly += a.value.monthly;
  }
  return t;
}

/**
 * Depreciation charged in [fromKey, toKey] by the department's assets, and gains / losses on
 * assets disposed of in that period (for the income statement).
 */
export async function depreciationOfPeriod({ departmentId, fromKey, toKey, client = db }) {
  const rows = await client.fixedAsset.findMany({ where: { departmentId, purchaseDate: { lte: new Date(`${toKey}T00:00:00Z`) } } });
  let depreciation = 0;
  let disposals = 0;
  for (const a of rows) {
    depreciation += depreciationBetween(a, fromKey, toKey);
    const d = dateKeyOf(a.disposedOn);
    if (d && d >= fromKey && d <= toKey) disposals += disposalResult(a);
  }
  return { depreciation, disposals };
}

/** Book value of the department's assets on a date (for the balance sheet). */
export async function assetBookValue({ departmentId, asOfKey, client = db }) {
  const rows = await client.fixedAsset.findMany({ where: { departmentId, purchaseDate: { lte: new Date(`${asOfKey}T00:00:00Z`) } } });
  return rows.filter((a) => !a.disposedOn || dateKeyOf(a.disposedOn) > asOfKey).reduce((s, a) => s + assetValue(a, asOfKey).bookValue, 0);
}
