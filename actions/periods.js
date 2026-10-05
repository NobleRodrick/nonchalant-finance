"use server";

import { db } from "@/lib/prisma";
import { runAction } from "@/lib/action";
import { orgTimezone, requireAdmin, requireOrgUser } from "@/lib/access";
import { conflict, invalid, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { periodRange, rangeBounds } from "@/lib/timezone";
import { revalidateOperations } from "@/lib/transaction-runner";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Accounting periods (§5.1). A CLOSED period blocks any posting or voiding inside it. */
export async function getAccountingPeriods() {
  const res = await runAction("getAccountingPeriods", async () => {
    const user = await requireOrgUser();
    return db.accountingPeriod.findMany({ where: { organizationId: user.organizationId }, orderBy: { startDate: "desc" } });
  });
  return res.success ? res.data : [];
}

/** Creates a monthly period from "YYYY-MM". */
export async function createAccountingPeriod(input) {
  return runAction("createAccountingPeriod", async () => {
    const user = await requireAdmin();
    const month = String(input?.month || "");
    if (!MONTH_RE.test(month)) throw invalid("Choose a month (YYYY-MM).");
    const { fromKey, toKey } = periodRange("month", `${month}-01`);
    const { start, end } = rangeBounds(fromKey, toKey, orgTimezone(user));
    const overlap = await db.accountingPeriod.findFirst({
      where: { organizationId: user.organizationId, startDate: { lte: end }, endDate: { gte: start } },
    });
    if (overlap) throw conflict(`This month overlaps the existing period "${overlap.name}".`);
    const name = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
    const period = await db.$transaction(async (tx) => {
      const p = await tx.accountingPeriod.create({ data: { organizationId: user.organizationId, name, startDate: start, endDate: end } });
      await recordAudit(tx, { user, action: "PERIOD_CREATED", entityType: "AccountingPeriod", entityId: p.id, after: { name } });
      return p;
    });
    revalidateOperations();
    return period;
  });
}

async function setStatus(periodId, status) {
  const user = await requireAdmin();
  const period = await db.accountingPeriod.findFirst({ where: { id: periodId || "-", organizationId: user.organizationId } });
  if (!period) throw notFound("Period not found.");
  if (period.status === status) return period;
  if (status === "CLOSED") {
    const pending = await db.dailyReport.count({
      where: { organizationId: user.organizationId, reportDate: { gte: period.startDate, lte: period.endDate }, status: { in: ["SUBMITTED", "REVIEWED", "DRAFT", "RETURNED"] } },
    });
    if (pending > 0) throw conflict(`${pending} daily report(s) in this period are not approved yet. Approve them before closing.`);
  }
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.accountingPeriod.update({
      where: { id: period.id },
      data: { status, closedById: status === "CLOSED" ? user.id : null, closedAt: status === "CLOSED" ? new Date() : null },
    });
    await recordAudit(tx, { user, action: `PERIOD_${status}`, entityType: "AccountingPeriod", entityId: period.id, before: { status: period.status }, after: { status } });
    return u;
  });
  revalidateOperations();
  return updated;
}

export async function closeAccountingPeriod(periodId) {
  return runAction("closeAccountingPeriod", () => setStatus(periodId, "CLOSED"));
}

export async function reopenAccountingPeriod(periodId) {
  return runAction("reopenAccountingPeriod", () => setStatus(periodId, "OPEN"));
}
