/**
 * Switches a test business to Full accounting, builds its ledger and checks it against the
 * statements: for every whole month, every department's ledger result (classes 6–8) equals its
 * statement result to the franc; a second sync changes nothing; the trial balance balances.
 */
import { expect } from "vitest";
import { db } from "@/lib/prisma";
import { buildStatements } from "@/lib/finance/statements";
import { setAccountingLevel } from "@/lib/accounting/company-service";
import { syncCompany } from "@/lib/accounting/sync";
import { ledgerResult, trialBalance } from "@/lib/accounting/balances";
import { addMonths, monthOf } from "@/lib/property/rent-schedule";
import { toDateKey } from "@/lib/timezone";

const TZ = "Africa/Douala";
export const monthEnd = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** The months to compare: from `fromMonth` (default: two months back) to the current one. */
export async function checkLedger({ organizationId, boss, fromMonth = null, months = 3 }) {
  const company = await db.company.findFirst({ where: { organizationId, isDefault: true } });
  await db.$transaction((tx) => setAccountingLevel(tx, { user: boss }, { companyId: company.id, level: "FULL" }));
  const m0 = monthOf(toDateKey(new Date(), TZ));
  const first = fromMonth || addMonths(m0, -(months - 1));
  // Sync as if on the 1st of next month, so this month is whole (rent of the month, nights booked).
  const now = new Date(`${addMonths(m0, 1)}-01T12:00:00Z`);
  const built = await syncCompany(company.id, { full: true, now });
  const again = await syncCompany(company.id, { full: true, now });
  expect(again.posted).toBe(0);
  expect(again.reversed).toBe(0);

  const fresh = await db.company.findUnique({ where: { id: company.id } });
  const departments = await db.department.findMany({ where: { companyId: company.id } });
  const compared = [];
  for (let m = first; m <= m0; m = addMonths(m, 1)) {
    for (const d of departments) {
      const st = await buildStatements({ organizationId, departments: [d], fromKey: `${m}-01`, toKey: monthEnd(m), timeZone: TZ, compare: false });
      const led = await ledgerResult({ companyId: company.id, fromKey: `${m}-01`, toKey: monthEnd(m), departmentIds: [d.id] });
      compared.push({ month: m, department: d.name, statement: st.income.result, ledger: led.result });
    }
  }
  expect(compared.filter((c) => c.statement !== c.ledger)).toEqual([]);
  const tb = await trialBalance({ company: fresh, fromKey: `${first}-01`, toKey: monthEnd(m0) });
  expect(tb.totals.debit).toBe(tb.totals.credit);
  expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
  return { company: fresh, built, compared, now, tb };
}
