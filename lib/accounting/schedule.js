/**
 * After records are written: marks the department's ledger out of date and, when its company keeps
 * Full books, asks for a background sync (lib/inngest ledgerDepartmentSync, debounced). Never fails
 * the write: the ledger is caught up before any accounting page is read and every night anyway.
 */
import { db } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";

export async function scheduleLedgerSync(departmentId, client = db) {
  if (!departmentId) return;
  try {
    const d = await client.department.update({ where: { id: departmentId }, data: { ledgerDirtyAt: new Date() }, select: { company: { select: { accountingLevel: true } } } });
    if (d.company?.accountingLevel === "FULL" && process.env.INNGEST_EVENT_KEY) {
      await inngest.send({ name: "accounting/department.changed", data: { departmentId } });
    }
  } catch {
    // the record is saved; the next read or the nightly sync catches up
  }
}
