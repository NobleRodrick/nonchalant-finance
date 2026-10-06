/**
 * The cash counted in a department's drawer (event venue, guest house …), against what it should
 * hold now (opening + cash in − cash out − handed over). The difference is a discrepancy the
 * reports and the Boss see. One count per day; counting again the same day replaces it. Run by the
 * operations venue.cash.count, rooms.cash.count and rental.cash.count. (The table is named venue_cash_counts: it was
 * first made for event venues and holds the counts of every such department.)
 */
import { recordAudit } from "@/lib/audit";
import { invalid } from "@/lib/errors";
import { notifyBosses } from "@/lib/notifications";
import { drawerNow } from "@/lib/finance/posting-service";
import { formatMoney } from "@/lib/format";
import { toDateKey } from "@/lib/timezone";
import { dbDate } from "@/lib/venue/dates";

export async function recordCashCount(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const counted = Number(input?.countedCash);
  if (!Number.isInteger(counted) || counted < 0) throw invalid("Enter the cash counted in the drawer (a whole number of francs).");
  const dateKey = toDateKey(ctx.date || ctx.now, timeZone);
  const drawer = await drawerNow(tx, { organizationId: user.organizationId, departmentId: department.id, timeZone, at: ctx.date || ctx.now });
  const expected = Math.round(drawer.shouldRemain);
  const variance = counted - expected;
  const notes = String(input.notes ?? "").trim().slice(0, 500) || null;
  if (variance !== 0 && !notes) throw invalid(`The count differs from what the drawer should hold (${formatMoney(expected)}) by ${formatMoney(variance)}: explain it in the notes.`);
  const data = { countedCash: counted, expectedCash: expected, variance, notes, countedById: user.id };
  const row = await tx.venueCashCount.upsert({
    where: { departmentId_date: { departmentId: department.id, date: dbDate(dateKey) } },
    create: { ...data, organizationId: user.organizationId, departmentId: department.id, date: dbDate(dateKey) },
    update: data,
  });
  if (variance !== 0) {
    await notifyBosses(tx, {
      organizationId: user.organizationId,
      departmentId: department.id,
      kind: "CASH_DISCREPANCY",
      title: `${department.name}: cash ${variance < 0 ? "short" : "over"} by ${formatMoney(Math.abs(variance))}`,
      body: `Counted ${formatMoney(counted)}, the drawer should hold ${formatMoney(expected)}. ${notes || ""}`.trim(),
      href: `/d/${department.id}/reports`,
    });
  }
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_CASH_COUNTED", entityType: "VenueCashCount", entityId: row.id, after: { dateKey, counted, expected, variance, notes } });
  return { countId: row.id, dateKey, countedCash: counted, expectedCash: expected, variance };
}
