/**
 * Keeps a Full-accounting company's ledger equal to what its departments' records say
 * (docs/ACCOUNTING_PLAN.md). For each department: the money records (all, or those changed since the
 * last sync) and the recognitions of the open months are turned into entry specs by the posting
 * rules, then compared with the active entries — unchanged ones stay, changed ones are reversed and
 * posted again. Closed periods are never recomputed; a late change lands on the first open day.
 *
 * Runs: when a company switches to Full (whole history), after records are written (background),
 * before an accounting page is read (only departments marked dirty) and every night (dated facts:
 * months of rent, nights, depreciation).
 */
import { db } from "@/lib/prisma";
import { DEFAULT_TIMEZONE, toDateKey } from "@/lib/timezone";
import { logEvent } from "@/lib/observability";
import { addMonths, monthOf } from "@/lib/property/rent-schedule";
import { applyDesired, dbDay, keyOf, ledgerContext, lockLedger } from "./ledger";
import { recognitionEntry, transactionEntry } from "./rules";
import { recognitionsFor } from "./recognitions";
import { transactionsFor } from "./sources";

const RECENT_MONTHS = 3; // an ordinary sync recomputes the recognitions of the last months; the nightly one all open months

function monthEndKey(m) {
  return new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
}

/** The first day a department has anything to account for (records, bookings, contracts, assets). */
export async function departmentStartKey(client, department, timeZone) {
  const id = department.id;
  const [tx, venue, stays, orders, leases, assets, debts, moves, tickets, crates] = await Promise.all([
    client.transaction.aggregate({ where: { departmentId: id }, _min: { date: true } }),
    client.venueBooking.aggregate({ where: { departmentId: id }, _min: { eventDate: true } }),
    client.roomBooking.aggregate({ where: { departmentId: id }, _min: { checkIn: true } }),
    client.rentalOrder.aggregate({ where: { departmentId: id }, _min: { eventDate: true } }),
    client.propertyLease.aggregate({ where: { departmentId: id }, _min: { startDate: true } }),
    client.fixedAsset.aggregate({ where: { departmentId: id }, _min: { purchaseDate: true } }),
    client.debt.aggregate({ where: { departmentId: id }, _min: { date: true } }),
    client.tradeMovement.aggregate({ where: { departmentId: id }, _min: { date: true } }),
    client.serviceTicket.aggregate({ where: { departmentId: id }, _min: { receivedAt: true } }),
    client.packagingMovement.aggregate({ where: { departmentId: id }, _min: { date: true } }),
  ]);
  const keys = [
    tx._min.date && toDateKey(tx._min.date, timeZone),
    keyOf(venue._min.eventDate),
    keyOf(stays._min.checkIn),
    keyOf(orders._min.eventDate),
    keyOf(leases._min.startDate),
    keyOf(assets._min.purchaseDate),
    debts._min.date && toDateKey(debts._min.date, timeZone),
    moves._min.date && toDateKey(moves._min.date, timeZone),
    tickets._min.receivedAt && toDateKey(tickets._min.receivedAt, timeZone),
    crates._min.date && toDateKey(crates._min.date, timeZone),
  ].filter(Boolean);
  return keys.length ? keys.sort()[0] : null;
}

/**
 * Syncs one department. `full`: every money record and every open month (switching to Full, the
 * nightly run); otherwise records changed since the last sync and the recent months.
 */
export async function syncDepartment(departmentId, { full = false, client = db, now = new Date() } = {}) {
  const department = await client.department.findUnique({ where: { id: departmentId }, include: { company: true, organization: { select: { timezone: true } } } });
  if (!department?.company || department.company.accountingLevel !== "FULL") return { skipped: true };
  const timeZone = department.organization?.timezone || DEFAULT_TIMEZONE;
  const company = department.company;
  const todayKey = toDateKey(now, timeZone);
  const startedAt = new Date();
  const incremental = !full && department.ledgerSyncedAt;

  const result = await client.$transaction(
    async (tx) => {
      await lockLedger(tx, company.id);
      const ctx = await ledgerContext(tx, company);
      const startKey = await departmentStartKey(tx, department, timeZone);
      if (!startKey) return { posted: 0, reversed: 0, unchanged: 0, skipped: 0 };
      const windowKey = ctx.openKey && ctx.openKey > startKey ? ctx.openKey : startKey;
      const rules = { accounts: ctx.resolver, company };

      // Money records.
      const changedSince = incremental ? new Date(department.ledgerSyncedAt.getTime() - 5 * 60000) : null;
      const records = await transactionsFor({ departmentId, from: incremental ? null : dbDay(windowKey), changedSince, timeZone, client: tx });
      const wantTx = new Map();
      for (const t of records) {
        const spec = transactionEntry(t, rules);
        wantTx.set(`tx:${t.id}`, spec);
      }
      const haveTx = await activeEntries(tx, company.id, { sourceKeys: [...wantTx.keys()] });
      const a = await applyDesired(tx, ctx, new Map([...wantTx].filter(([, v]) => v)), haveTx, { todayKey });

      // Recognitions, month by month.
      let fromMonth = monthOf(windowKey);
      if (incremental) {
        const recent = addMonths(monthOf(todayKey), -(RECENT_MONTHS - 1));
        if (recent > fromMonth) fromMonth = recent;
      }
      const fromKey = `${fromMonth}-01` < windowKey ? windowKey : `${fromMonth}-01`;
      const wantRec = new Map();
      for (let m = fromMonth; m <= monthOf(todayKey); m = addMonths(m, 1)) {
        // Whole months always (a month's rent or nights is one fact); facts before the window stay as posted.
        const list = await recognitionsFor({ department, fromKey: `${m}-01`, toKey: monthEndKey(m), timeZone, client: tx });
        for (const r of list) {
          if (r.dateKey < fromKey) continue;
          const spec = recognitionEntry(r, rules);
          if (spec) wantRec.set(r.sourceKey, spec);
        }
      }
      const haveRec = await activeEntries(tx, company.id, { departmentId, fromKey, recognitions: true });
      const b = await applyDesired(tx, ctx, wantRec, haveRec, { todayKey });
      await tx.department.update({ where: { id: departmentId }, data: { ledgerSyncedAt: startedAt } });
      return { posted: a.posted + b.posted, reversed: a.reversed + b.reversed, unchanged: a.unchanged + b.unchanged, skipped: a.skipped + b.skipped };
    },
    { timeout: 300000, maxWait: 30000 }
  );
  if (result.posted || result.reversed) logEvent("info", { event: "ledger_sync", departmentId, companyId: company.id, full: Boolean(full), ...result });
  return result;
}

/**
 * Active generated entries (posted, not reversed, not a reversal), by source key: those with the
 * given keys, or the recognitions (not money records, not manual) of a department from a date.
 */
async function activeEntries(client, companyId, { sourceKeys, departmentId, fromKey, recognitions = false }) {
  const where = { companyId, status: "POSTED", reversedAt: null, reversalOfId: null, isManual: false };
  if (sourceKeys) {
    if (!sourceKeys.length) return new Map();
    where.sourceKey = { in: sourceKeys };
  }
  if (recognitions) {
    where.departmentId = departmentId;
    where.sourceKey = { not: null };
    where.NOT = { sourceKey: { startsWith: "tx:" } };
    where.date = { gte: dbDay(fromKey) };
  }
  const rows = await client.journalEntry.findMany({ where, select: { id: true, sourceKey: true, fingerprint: true, date: true, journalId: true, number: true, label: true, reference: true, departmentId: true, total: true, isManual: true } });
  return new Map(rows.map((r) => [r.sourceKey, r]));
}

/** Syncs every department of a company (switching to Full, nightly). */
export async function syncCompany(companyId, { full = true, client = db, now = new Date() } = {}) {
  const departments = await client.department.findMany({ where: { companyId }, select: { id: true }, orderBy: { createdAt: "asc" } });
  const totals = { posted: 0, reversed: 0, unchanged: 0, skipped: 0 };
  for (const d of departments) {
    const r = await syncDepartment(d.id, { full, client, now });
    for (const k of Object.keys(totals)) totals[k] += r[k] || 0;
  }
  return totals;
}

/** Syncs the departments of a company changed since their last sync (before a ledger page is read). */
export async function syncIfDirty(companyId, { client = db } = {}) {
  const dirty = await client.department.findMany({ where: { companyId, ledgerDirtyAt: { not: null } }, select: { id: true, ledgerDirtyAt: true, ledgerSyncedAt: true } });
  for (const d of dirty) if (!d.ledgerSyncedAt || d.ledgerDirtyAt > d.ledgerSyncedAt) await syncDepartment(d.id, { client });
}
