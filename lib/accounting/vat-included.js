/**
 * The VAT inside the money figures of the Statements page. When a company keeps Full accounting and
 * is registered for VAT, part of the money in (VAT collected) belongs to the State and part of the
 * money out (deductible VAT typed from supplier invoices) comes back from it. Read from the books
 * (the posting rules are the single source of truth), for the departments and the period shown:
 * result without VAT = result − collected + deductible, which is the SYSCOHADA result.
 */
import { db } from "@/lib/prisma";
import { dbDay } from "./ledger";
import { syncIfDirty } from "./sync";
import { COLLECTED, DEDUCTIBLE } from "./vat";

/**
 * `departments`: [{ id, companyId }]. Returns null when none of them keeps VAT books, else
 * { collected, deductible, net, companies: [{ name, ratePct, since }] }.
 */
export async function vatIncludedIn({ departments, fromKey, toKey, client = db }) {
  const companyIds = [...new Set(departments.map((d) => d.companyId).filter(Boolean))];
  if (!companyIds.length) return null;
  const companies = await client.company.findMany({ where: { id: { in: companyIds }, accountingLevel: "FULL", vatEnabled: true }, select: { id: true, name: true, vatRateBp: true, vatSince: true } });
  if (!companies.length) return null;
  const ids = departments.filter((d) => companies.some((c) => c.id === d.companyId)).map((d) => d.id);
  if (vatSinceAfter(companies, toKey)) return null;
  // The figures follow the latest records.
  for (const c of companies) await syncIfDirty(c.id, { client });
  const accounts = await client.ledgerAccount.findMany({ where: { companyId: { in: companies.map((c) => c.id) }, number: { in: [...COLLECTED, ...DEDUCTIBLE] } }, select: { id: true, number: true } });
  if (!accounts.length) return null;
  const rows = await client.journalLine.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      departmentId: { in: ids },
      date: { gte: dbDay(fromKey), lte: dbDay(toKey) },
      // The monthly return moves VAT between VAT accounts: not a VAT of the records.
      entry: { status: "POSTED", NOT: { sourceKey: { startsWith: "vat-return:" } } },
    },
    _sum: { debit: true, credit: true },
  });
  let collected = 0;
  let deductible = 0;
  for (const r of rows) {
    const number = accounts.find((a) => a.id === r.accountId)?.number;
    const debitMinusCredit = (r._sum.debit || 0) - (r._sum.credit || 0);
    if (COLLECTED.includes(number)) collected -= debitMinusCredit;
    else deductible += debitMinusCredit;
  }
  return {
    collected,
    deductible,
    net: collected - deductible,
    companies: companies.map((c) => ({ name: c.name, ratePct: c.vatRateBp / 100, since: c.vatSince ? c.vatSince.toISOString().slice(0, 10) : null })),
  };
}

/** Every company's VAT starts after the period: nothing to show. */
function vatSinceAfter(companies, toKey) {
  return companies.every((c) => c.vatSince && c.vatSince.toISOString().slice(0, 10) > toKey);
}
