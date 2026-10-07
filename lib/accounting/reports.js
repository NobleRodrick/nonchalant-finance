/**
 * The company's books for any period: SYSCOHADA income statement, balance sheet and cash-flow
 * statement, general ledger of an account, journal of entries, an entry with its source.
 * Everything reads the posted entries (lib/accounting/statement-math.js does the arithmetic).
 */
import { db } from "@/lib/prisma";
import { addDaysToKey } from "@/lib/timezone";
import { accountNature, isIncomeStatementAccount } from "./chart";
import { dbDay, keyOf } from "./ledger";
import { fiscalYearStart } from "./balances";
import { balanceSheet, cashFlow, incomeStatement, isTreasury } from "./statement-math";

const posted = { status: "POSTED" };

/** { number: debit − credit } over [fromKey, toKey] (open-ended when null). */
export async function movementsByNumber({ companyId, fromKey = null, toKey = null, departmentIds = null, client = db }) {
  const date = {};
  if (fromKey) date.gte = dbDay(fromKey);
  if (toKey) date.lte = dbDay(toKey);
  const [accounts, rows] = await Promise.all([
    client.ledgerAccount.findMany({ where: { companyId }, select: { id: true, number: true } }),
    client.journalLine.groupBy({ by: ["accountId"], where: { companyId, entry: posted, ...(fromKey || toKey ? { date } : {}), ...(departmentIds ? { departmentId: { in: departmentIds } } : {}) }, _sum: { debit: true, credit: true } }),
  ]);
  const num = new Map(accounts.map((a) => [a.id, a.number]));
  const out = {};
  for (const r of rows) {
    const v = (r._sum.debit || 0) - (r._sum.credit || 0);
    if (v) out[num.get(r.accountId)] = v;
  }
  return out;
}

const pick = (mv, test) => Object.fromEntries(Object.entries(mv).filter(([n]) => test(n)));

/** The income statement of [fromKey, toKey] and, when asked, of the same period a year before. */
export async function incomeStatementFor({ company, fromKey, toKey, departmentIds = null, compare = true, client = db }) {
  const mv = await movementsByNumber({ companyId: company.id, fromKey, toKey, departmentIds, client });
  const lines = incomeStatement(pick(mv, isIncomeStatementAccount));
  let previous = null;
  if (compare) {
    const back = (k) => `${Number(k.slice(0, 4)) - 1}${k.slice(4)}`;
    const pmv = await movementsByNumber({ companyId: company.id, fromKey: back(fromKey), toKey: back(toKey).replace(/-02-29$/, "-02-28"), departmentIds, client });
    previous = incomeStatement(pick(pmv, isIncomeStatementAccount));
  }
  return { fromKey, toKey, lines, previous };
}

/** Customers' (41) and suppliers' (40) balances by partner up to `toKey`. */
async function partnerBalances(client, companyId, toKey) {
  const accounts = await client.ledgerAccount.findMany({ where: { companyId, OR: [{ number: { startsWith: "40" } }, { number: { startsWith: "41" } }] }, select: { id: true, number: true } });
  if (!accounts.length) return [];
  const rows = await client.journalLine.groupBy({ by: ["accountId", "partnerKey"], where: { companyId, entry: posted, accountId: { in: accounts.map((a) => a.id) }, date: { lte: dbDay(toKey) } }, _sum: { debit: true, credit: true } });
  const num = new Map(accounts.map((a) => [a.id, a.number]));
  return rows.map((r) => ({ number: num.get(r.accountId), partnerKey: r.partnerKey, balance: (r._sum.debit || 0) - (r._sum.credit || 0) })).filter((r) => r.balance);
}

/** Balance sheet at the end of `toKey`, with the year's result and earlier years' results. */
export async function balanceSheetAt({ company, toKey, client = db }) {
  const yearStart = fiscalYearStart(toKey, company.fiscalYearStartMonth || 1);
  const [all, year, partners] = await Promise.all([
    movementsByNumber({ companyId: company.id, toKey, client }),
    movementsByNumber({ companyId: company.id, fromKey: yearStart, toKey, client }),
    partnerBalances(client, company.id, toKey),
  ]);
  const pnl = (mv) => -Object.entries(mv).reduce((s, [n, v]) => (isIncomeStatementAccount(n) ? s + v : s), 0);
  const result = pnl(year);
  const priorResult = pnl(all) - result;
  const bal = pick(all, (n) => !isIncomeStatementAccount(n));
  return { toKey, yearStart, result, priorResult, ...balanceSheet({ bal, partners, result, priorResult }) };
}

/** Net treasury (classes 50–58, overdrafts deducted) at the end of `toKey` (null: before anything). */
async function treasuryAt(client, companyId, toKey) {
  const mv = await movementsByNumber({ companyId, toKey, client });
  return Object.entries(mv).reduce((s, [n, v]) => (isTreasury(n) ? s + v : s), 0);
}

/** Cash-flow statement of [fromKey, toKey] (direct method, SYSCOHADA sections). */
export async function cashFlowFor({ company, fromKey, toKey, client = db }) {
  const [opening, closing, lines] = await Promise.all([
    treasuryAt(client, company.id, addDaysToKey(fromKey, -1)),
    treasuryAt(client, company.id, toKey),
    client.journalLine.findMany({
      where: { companyId: company.id, entry: posted, date: { gte: dbDay(fromKey), lte: dbDay(toKey) } },
      select: { entryId: true, debit: true, credit: true, account: { select: { number: true } } },
    }),
  ]);
  const byEntry = new Map();
  for (const l of lines) {
    if (!byEntry.has(l.entryId)) byEntry.set(l.entryId, []);
    byEntry.get(l.entryId).push({ number: l.account.number, debit: l.debit, credit: l.credit });
  }
  const entries = [...byEntry.values()].filter((ls) => ls.some((l) => isTreasury(l.number))).map((ls) => ({ lines: ls }));
  return { fromKey, toKey, ...cashFlow({ entries, opening, closing }) };
}

/**
 * General ledger of the accounts starting with `number` over [fromKey, toKey]: opening balance,
 * each line with its entry and running balance, closing balance. Income-statement accounts open
 * at the start of the fiscal year.
 */
export async function generalLedger({ company, number, fromKey, toKey, departmentId = null, partnerKey = null, take = 2000, client = db }) {
  const accounts = await client.ledgerAccount.findMany({ where: { companyId: company.id, number: { startsWith: String(number) } }, select: { id: true, number: true, name: true, label: true }, orderBy: { number: "asc" } });
  if (!accounts.length) return { accounts: [], lines: [], opening: 0, closing: 0, debit: 0, credit: 0 };
  const ids = accounts.map((a) => a.id);
  const pnl = isIncomeStatementAccount(String(number));
  const openFrom = pnl ? fiscalYearStart(fromKey, company.fiscalYearStartMonth || 1) : null;
  const filter = { companyId: company.id, entry: posted, accountId: { in: ids }, ...(departmentId ? { departmentId } : {}), ...(partnerKey ? { partnerKey } : {}) };
  const [before, rows] = await Promise.all([
    client.journalLine.aggregate({ where: { ...filter, date: { lt: dbDay(fromKey), ...(openFrom ? { gte: dbDay(openFrom) } : {}) } }, _sum: { debit: true, credit: true } }),
    client.journalLine.findMany({
      where: { ...filter, date: { gte: dbDay(fromKey), lte: dbDay(toKey) } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { position: "asc" }],
      take,
      select: { id: true, date: true, debit: true, credit: true, label: true, partnerName: true, partnerKey: true, departmentId: true, account: { select: { number: true } }, entry: { select: { id: true, number: true, label: true, reference: true, sourceKey: true, journal: { select: { code: true } } } } },
    }),
  ]);
  const opening = (before._sum.debit || 0) - (before._sum.credit || 0);
  let running = opening;
  let debit = 0;
  let credit = 0;
  const lines = rows.map((l) => {
    running += l.debit - l.credit;
    debit += l.debit;
    credit += l.credit;
    return { ...l, dateKey: keyOf(l.date), balance: running };
  });
  return { accounts, nature: accountNature(String(number)), opening, lines, debit, credit, closing: running, truncated: rows.length === take };
}

/** Entries of the journal (or all journals) over a period, newest first, with their lines. */
export async function journalEntries({ company, journal = null, fromKey, toKey, status = null, q = null, departmentId = null, take = 200, skip = 0, client = db }) {
  const where = {
    companyId: company.id,
    date: { gte: dbDay(fromKey), lte: dbDay(toKey) },
    ...(journal ? { journal: { code: journal } } : {}),
    ...(status ? { status } : { status: { in: ["POSTED", "PENDING", "DRAFT"] } }),
    ...(departmentId ? { departmentId } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { label: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    client.journalEntry.count({ where }),
    client.journalEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      take,
      skip,
      include: { journal: { select: { code: true } }, lines: { orderBy: { position: "asc" }, include: { account: { select: { number: true, label: true } } } } },
    }),
  ]);
  return { total, rows: rows.map((e) => ({ ...e, dateKey: keyOf(e.date) })) };
}

/** Where a generated entry comes from: a link to the record in its department. */
export function sourceLink(sourceKey, departmentId, reference = null) {
  if (!sourceKey || !departmentId) return null;
  const [kind, id, extra] = sourceKey.split(":");
  const d = `/d/${departmentId}`;
  switch (kind) {
    case "tx":
      return { href: reference ? `${d}/money?ref=${encodeURIComponent(reference)}` : `${d}/money`, label: reference ? `Money record ${reference}` : "Money record" };
    case "venue-event":
    case "venue-kept":
      return { href: `${d}/bookings/${id}`, label: "Booking" };
    case "stay-nights":
    case "stay-kept":
      return { href: `${d}/stays/${id}`, label: "Stay" };
    case "rental-event":
    case "rental-kept":
      return { href: `${d}/bookings/${id}`, label: "Booking" };
    case "lease-rent":
      return { href: `${d}/contracts/${id}`, label: `Contract (rent ${extra})` };
    case "lease-charge":
    case "lease-waiver":
    case "lease-deposit-used":
      return { href: `${d}/contracts`, label: "Contracts" };
    case "depreciation":
    case "disposal":
      return { href: `${d}/assets`, label: "Asset register" };
    case "debt-opening":
    case "debt-write-off":
      return { href: `${d}/debts`, label: "Debts" };
    default:
      return null;
  }
}

/** One entry with its lines, its reversal, and the record it comes from. */
export async function entryDetail({ company, entryId, client = db }) {
  const e = await client.journalEntry.findFirst({
    where: { id: entryId || "-", companyId: company.id },
    include: {
      journal: true,
      lines: { orderBy: { position: "asc" }, include: { account: { select: { number: true, name: true, label: true } } } },
      reversalOf: { select: { id: true, number: true } },
      reversedBy: { select: { id: true, number: true, date: true } },
    },
  });
  if (!e) return null;
  return { ...e, dateKey: keyOf(e.date), source: sourceLink(e.sourceKey, e.departmentId, e.reference) };
}

export { accountNature };
