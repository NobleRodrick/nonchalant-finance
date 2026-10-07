/**
 * Reading the ledger: movements and balances by account for a period, optionally for some
 * departments (analytic) or partners. Every posted entry counts — a reversal cancels its original
 * on its own date. Amounts are whole FCFA.
 */
import { db } from "@/lib/prisma";
import { accountNature, isIncomeStatementAccount } from "./chart";
import { dbDay } from "./ledger";

/** Debit and credit by account over [fromKey, toKey] (either may be null: open-ended). */
export async function movementsByAccount({ companyId, fromKey = null, toKey = null, departmentIds = null, client = db }) {
  const date = {};
  if (fromKey) date.gte = dbDay(fromKey);
  if (toKey) date.lte = dbDay(toKey);
  const where = { companyId, entry: { status: "POSTED" }, ...(fromKey || toKey ? { date } : {}), ...(departmentIds ? { departmentId: { in: departmentIds } } : {}) };
  const rows = await client.journalLine.groupBy({ by: ["accountId"], where, _sum: { debit: true, credit: true } });
  return new Map(rows.map((r) => [r.accountId, { debit: r._sum.debit || 0, credit: r._sum.credit || 0 }]));
}

/** The first day of the fiscal year containing `dateKey`. */
export function fiscalYearStart(dateKey, startMonth = 1) {
  const y = Number(dateKey.slice(0, 4));
  const m = Number(dateKey.slice(5, 7));
  const year = m >= startMonth ? y : y - 1;
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
}

function dayBefore(key) {
  return new Date(Date.parse(`${key}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

/**
 * Trial balance of [fromKey, toKey]: for each account, its opening balance (balance-sheet accounts:
 * everything before; income-statement accounts: since the start of the fiscal year), the period's
 * debits and credits, and its closing balance (debit − credit). Totals balance by construction.
 */
export async function trialBalance({ company, fromKey, toKey, departmentIds = null, client = db }) {
  const yearStart = fiscalYearStart(fromKey, company.fiscalYearStartMonth || 1);
  const [accounts, before, yearBefore, period] = await Promise.all([
    client.ledgerAccount.findMany({ where: { companyId: company.id }, orderBy: { number: "asc" } }),
    movementsByAccount({ companyId: company.id, toKey: dayBefore(fromKey), departmentIds, client }),
    yearStart < fromKey ? movementsByAccount({ companyId: company.id, fromKey: yearStart, toKey: dayBefore(fromKey), departmentIds, client }) : new Map(),
    movementsByAccount({ companyId: company.id, fromKey, toKey, departmentIds, client }),
  ]);
  const rows = [];
  const totals = { openingDebit: 0, openingCredit: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 };
  for (const a of accounts) {
    const pnl = isIncomeStatementAccount(a.number);
    const o = (pnl ? yearBefore : before).get(a.id) || { debit: 0, credit: 0 };
    const m = period.get(a.id) || { debit: 0, credit: 0 };
    const opening = o.debit - o.credit;
    const closing = opening + m.debit - m.credit;
    if (!opening && !m.debit && !m.credit) continue;
    const row = { id: a.id, number: a.number, name: a.name, label: a.label, nature: accountNature(a.number), opening, debit: m.debit, credit: m.credit, closing };
    rows.push(row);
    if (opening > 0) totals.openingDebit += opening;
    else totals.openingCredit -= opening;
    totals.debit += m.debit;
    totals.credit += m.credit;
    if (closing > 0) totals.closingDebit += closing;
    else totals.closingCredit -= closing;
  }
  // The result of previous years (income-statement accounts not carried) balances the opening.
  const carried = [...before.entries()].reduce((s, [id, v]) => {
    const a = accounts.find((x) => x.id === id);
    return a && isIncomeStatementAccount(a.number) ? s + (v.debit - v.credit) - ((yearBefore.get(id)?.debit || 0) - (yearBefore.get(id)?.credit || 0)) : s;
  }, 0);
  return { fromKey, toKey, yearStart, rows, totals, priorResult: -carried };
}

/** Income − expenses booked in [fromKey, toKey] (classes 6, 7, 8): the ledger's result. */
export async function ledgerResult({ companyId, fromKey, toKey, departmentIds = null, client = db }) {
  const [accounts, period] = await Promise.all([client.ledgerAccount.findMany({ where: { companyId }, select: { id: true, number: true } }), movementsByAccount({ companyId, fromKey, toKey, departmentIds, client })]);
  let income = 0;
  let expenses = 0;
  for (const a of accounts) {
    const m = period.get(a.id);
    if (!m) continue;
    const nature = accountNature(a.number);
    if (nature === "INCOME") income += m.credit - m.debit;
    else if (nature === "EXPENSE") expenses += m.debit - m.credit;
  }
  return { income, expenses, result: income - expenses };
}

/** Balance (debit − credit) of each account number at the end of `toKey`. */
export async function balancesAt({ companyId, toKey, departmentIds = null, client = db }) {
  const [accounts, all] = await Promise.all([client.ledgerAccount.findMany({ where: { companyId }, select: { id: true, number: true } }), movementsByAccount({ companyId, toKey, departmentIds, client })]);
  const out = {};
  for (const a of accounts) {
    const m = all.get(a.id);
    if (m) out[a.number] = m.debit - m.credit;
  }
  return out;
}
