/**
 * Closing a company's books month by month (in order) and the year-end steps: checks before
 * closing, closing through a month, reopening the last closed month (the Boss), opening balances
 * and the allocation of a year's result. A closed month freezes every department of the company:
 * nothing can be recorded or voided in it, and the ledger never recomputes it.
 */
import { db } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { conflict, forbidden, invalid } from "@/lib/errors";
import { addDaysToKey, rangeBounds, toDateKey } from "@/lib/timezone";
import { addMonths, monthOf } from "@/lib/property/rent-schedule";
import { dbDay, firstOpenKey, keyOf, lockLedger } from "./ledger";
import { departmentStartKey } from "./sync";
import { saveManualEntry } from "./manual-entries";
import { ledgerResult } from "./balances";

const MONTH_RE = /^\d{4}-\d{2}$/;
export const monthEnd = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const monthName = (m) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

/** The first month of the company's books (its oldest record) or null. */
export async function booksStartMonth(client, company, timeZone) {
  const departments = await client.department.findMany({ where: { companyId: company.id }, select: { id: true } });
  const keys = (await Promise.all(departments.map((d) => departmentStartKey(client, d, timeZone)))).filter(Boolean);
  const manual = await client.journalEntry.aggregate({ where: { companyId: company.id, status: "POSTED" }, _min: { date: true } });
  if (manual._min.date) keys.push(keyOf(manual._min.date));
  return keys.length ? monthOf(keys.sort()[0]) : null;
}

/** What stands in the way of closing through `month` (blocking) and what deserves a look (warnings). */
export async function closingChecks({ company, month, timeZone, client = db }) {
  const openKey = await firstOpenKey(client, company);
  const fromKey = openKey || "2000-01-01";
  const toKey = monthEnd(month);
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const departments = await client.department.findMany({ where: { companyId: company.id }, select: { id: true, name: true, ledgerDirtyAt: true, ledgerSyncedAt: true } });
  const [pending, suspense, reports, unmatched] = await Promise.all([
    client.journalEntry.count({ where: { companyId: company.id, status: { in: ["PENDING", "DRAFT"] }, date: { gte: dbDay(fromKey), lte: dbDay(toKey) } } }),
    client.journalLine.aggregate({ where: { companyId: company.id, entry: { status: "POSTED" }, account: { number: { startsWith: "4711" } }, date: { lte: dbDay(toKey) } }, _sum: { debit: true, credit: true } }),
    client.dailyReport.count({ where: { departmentId: { in: departments.map((d) => d.id) }, reportDate: { gte: start, lte: end }, status: { in: ["SUBMITTED", "REVIEWED", "DRAFT", "RETURNED"] } } }),
    company.reconciliationEnabled ? client.statementLine.count({ where: { status: "UNMATCHED", date: { lte: dbDay(toKey) }, statement: { companyId: company.id } } }) : 0,
  ]);
  const blocking = [];
  const warnings = [];
  if (pending) blocking.push(`${pending} manual entr${pending > 1 ? "ies are" : "y is"} still a draft or waiting for approval.`);
  if (reports) blocking.push(`${reports} daily report(s) of the period are not approved by the Boss.`);
  const stale = departments.filter((d) => d.ledgerDirtyAt && (!d.ledgerSyncedAt || d.ledgerDirtyAt > d.ledgerSyncedAt));
  if (stale.length) warnings.push(`Books being updated for ${stale.map((d) => d.name).join(", ")}: they are brought up to date before closing.`);
  const s = (suspense._sum.debit || 0) - (suspense._sum.credit || 0);
  if (s) warnings.push(`The suspense account (4711) is not cleared (${s > 0 ? "debit" : "credit"} ${Math.abs(s)} FCFA).`);
  if (unmatched) warnings.push(`${unmatched} bank or Mobile Money statement line(s) are not matched.`);
  return { fromKey, toKey, blocking, warnings };
}

/**
 * Closes every open month of the company from the first one through `month` (books are closed in
 * order). Call after syncing the company's ledger.
 */
export async function closeThrough(tx, { user, access, timeZone, now = new Date() }, { month }) {
  if (!access.canSettle) throw forbidden("Only the Boss closes the books.");
  if (!MONTH_RE.test(month || "")) throw invalid("Choose a month.");
  if (month >= monthOf(toDateKey(now, timeZone))) throw invalid("Only a month that has ended can be closed.");
  const company = access.company;
  await lockLedger(tx, company.id);
  const checks = await closingChecks({ company, month, timeZone, client: tx });
  if (checks.blocking.length) throw conflict(checks.blocking.join(" "));
  const openKey = await firstOpenKey(tx, company);
  const first = openKey ? monthOf(openKey) : await booksStartMonth(tx, company, timeZone);
  if (!first || first > month) throw conflict("These months are already closed.");
  const closed = [];
  for (let m = first; m <= month; m = addMonths(m, 1)) {
    const { start, end } = rangeBounds(`${m}-01`, monthEnd(m), timeZone);
    const existing = await tx.accountingPeriod.findFirst({ where: { organizationId: user.organizationId, companyId: company.id, startDate: start } });
    if (existing) await tx.accountingPeriod.update({ where: { id: existing.id }, data: { status: "CLOSED", closedById: user.id, closedAt: new Date() } });
    else await tx.accountingPeriod.create({ data: { organizationId: user.organizationId, companyId: company.id, name: `${monthName(m)} · ${company.name}`, startDate: start, endDate: end, status: "CLOSED", closedById: user.id, closedAt: new Date() } });
    closed.push(m);
  }
  await recordAudit(tx, { user, action: "BOOKS_CLOSED", entityType: "Company", entityId: company.id, after: { through: month, months: closed } });
  return { closed, through: month };
}

/** Reopens the last closed month of the company (the Boss; with a reason). */
export async function reopenLastMonth(tx, { user, access }, { reason }) {
  if (!access.canSettle) throw forbidden("Only the Boss reopens the books.");
  const why = String(reason || "").trim();
  if (!why) throw invalid("Say why the month is reopened.");
  const company = access.company;
  await lockLedger(tx, company.id);
  const last = await tx.accountingPeriod.findFirst({ where: { organizationId: user.organizationId, companyId: company.id, status: "CLOSED" }, orderBy: { endDate: "desc" } });
  if (!last) throw conflict("No month is closed.");
  await tx.accountingPeriod.update({ where: { id: last.id }, data: { status: "OPEN", closedById: null, closedAt: null } });
  await tx.department.updateMany({ where: { companyId: company.id }, data: { ledgerDirtyAt: new Date() } });
  await recordAudit(tx, { user, action: "BOOKS_REOPENED", entityType: "Company", entityId: company.id, after: { period: last.name, reason: why } });
  return { reopened: last.name };
}

/** Months of the company with their state (closed / open), from the start of its books. */
export async function monthsOf({ company, timeZone, now = new Date(), client = db }) {
  const start = await booksStartMonth(client, company, timeZone);
  const current = monthOf(toDateKey(now, timeZone));
  const periods = await client.accountingPeriod.findMany({ where: { organizationId: company.organizationId, OR: [{ companyId: company.id }, { companyId: null }] }, select: { startDate: true, endDate: true, status: true, closedAt: true, name: true } });
  const out = [];
  for (let m = start || current; m <= current; m = addMonths(m, 1)) {
    const mid = rangeBounds(`${m}-15`, `${m}-15`, timeZone).start;
    const p = periods.find((x) => x.startDate <= mid && x.endDate >= mid);
    out.push({ month: m, label: monthName(m), status: p?.status || "OPEN", closedAt: p?.closedAt || null });
  }
  return out.reverse();
}

/** What the app already knows for opening balances: each department's cash float on its first day. */
export async function openingSuggestions({ company, timeZone, client = db }) {
  const departments = await client.department.findMany({ where: { companyId: company.id }, select: { id: true, name: true, openingCashFloat: true } });
  const startMonth = await booksStartMonth(client, company, timeZone);
  const dateKey = startMonth ? addDaysToKey(`${startMonth}-01`, -1) : toDateKey(new Date(), timeZone);
  const existing = await client.journalEntry.findFirst({ where: { companyId: company.id, journal: { code: "AN" }, isManual: true, status: { in: ["POSTED", "PENDING", "DRAFT"] } }, select: { id: true, status: true, number: true } });
  return {
    dateKey,
    existing,
    lines: departments.filter((d) => d.openingCashFloat > 0).map((d) => ({ account: "5711", debit: d.openingCashFloat, credit: 0, label: `Cash in the drawer · ${d.name}`, departmentId: d.id })),
  };
}

/**
 * Records the allocation of a fiscal year's result (after the owners decide): to reserves, to
 * dividends, the rest stays in retained earnings. Dated the first day of the next fiscal year.
 */
export async function allocateResult(tx, { user, access }, { year, reserves = 0, dividends = 0 }) {
  if (!access.canSettle) throw forbidden("Only the Boss records the allocation of the result.");
  const company = access.company;
  const y = Number(year);
  if (!Number.isInteger(y)) throw invalid("Choose the year.");
  const startMonth = String(company.fiscalYearStartMonth || 1).padStart(2, "0");
  const fromKey = `${y}-${startMonth}-01`;
  const nextStart = `${y + 1}-${startMonth}-01`;
  const { result } = await ledgerResult({ companyId: company.id, fromKey, toKey: addDaysToKey(nextStart, -1), client: tx });
  const r = Math.round(Number(reserves) || 0);
  const d = Math.round(Number(dividends) || 0);
  if (r < 0 || d < 0) throw invalid("Amounts are positive.");
  if (!r && !d) throw invalid("Give the amount put in reserves or paid as dividends.");
  if (r + d > Math.max(0, result)) throw invalid(`Only the year's profit (${Math.max(0, result)} FCFA) can be allocated.`);
  const lines = [{ account: "121", debit: r + d, credit: 0, label: `Result ${y}` }];
  if (r) lines.push({ account: "111", debit: 0, credit: r, label: "Reserves" });
  if (d) lines.push({ account: "465", debit: 0, credit: d, label: "Dividends to pay" });
  return saveManualEntry(tx, { user, access }, { journal: "OD", dateKey: nextStart, label: `Allocation of the result of ${y}`, lines, submit: true });
}
