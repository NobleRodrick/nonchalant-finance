/**
 * The ledger of a company: its chart and journals (created when it goes Full), posting a balanced
 * entry, reversing one, numbering. Entries are never edited or deleted (database triggers): a change
 * is a reversal plus a new entry. Every write runs inside a transaction holding the company's
 * ledger lock, so numbers never collide.
 */
import { db } from "@/lib/prisma";
import { invalid, notFound } from "@/lib/errors";
import { addDaysToKey } from "@/lib/timezone";
import { JOURNALS, RECONCILABLE, SYSCOHADA_ACCOUNTS } from "./chart";
import { accountResolver } from "./account-map";
import { balanced, fingerprint } from "./rules";

export const dbDay = (key) => new Date(`${key}T00:00:00Z`);
export const keyOf = (d) => (d ? (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null);

/** Serializes the ledger writes of a company (inside a transaction). */
export async function lockLedger(tx, companyId) {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `ledger:${companyId}`);
}

/** The company of a department (every department has one: the database sets the default). */
export async function companyOfDepartment(client, departmentId) {
  const d = await client.department.findUnique({ where: { id: departmentId }, select: { companyId: true, company: true } });
  if (!d?.company) throw notFound("This department has no company.");
  return d.company;
}

/** Creates the chart of accounts and the journals of a company when missing (idempotent). */
export async function ensureLedger(client, companyId) {
  const [accounts, journals] = await Promise.all([client.ledgerAccount.count({ where: { companyId, isSystem: true } }), client.journal.count({ where: { companyId } })]);
  // New accounts of a later chart version are added too (existing ones are never changed).
  if (accounts < SYSCOHADA_ACCOUNTS.length) {
    await client.ledgerAccount.createMany({
      data: SYSCOHADA_ACCOUNTS.map((a) => ({ companyId, number: a.number, name: a.name, label: a.label, isSystem: true, reconcilable: RECONCILABLE.has(a.number) })),
      skipDuplicates: true,
    });
  }
  if (journals < JOURNALS.length) {
    await client.journal.createMany({ data: JOURNALS.map((j) => ({ companyId, code: j.code, name: j.name, kind: j.kind })), skipDuplicates: true });
  }
}

/**
 * The first day that may still change: the day after the latest closed period of the company (or of
 * the whole business). null when nothing is closed.
 */
export async function firstOpenKey(client, company) {
  const closed = await client.accountingPeriod.findFirst({
    where: { organizationId: company.organizationId, status: "CLOSED", OR: [{ companyId: company.id }, { companyId: null }] },
    orderBy: { endDate: "desc" },
    select: { endDate: true },
  });
  if (!closed) return null;
  return addDaysToKey(keyOf(closed.endDate), 1);
}

/** Everything posting needs: the account resolver, account and journal ids, the first open day. */
export async function ledgerContext(client, company) {
  await ensureLedger(client, company.id);
  const [accounts, journals, openKey] = await Promise.all([
    client.ledgerAccount.findMany({ where: { companyId: company.id }, select: { id: true, number: true, isActive: true } }),
    client.journal.findMany({ where: { companyId: company.id }, select: { id: true, code: true } }),
    firstOpenKey(client, company),
  ]);
  const byNumber = new Map(accounts.map((a) => [a.number, a.id]));
  return {
    company,
    resolver: accountResolver(company.accountMap),
    accountId(number) {
      return byNumber.get(number) || byNumber.get("4711");
    },
    hasAccount: (number) => byNumber.has(number),
    journalId(code) {
      const j = journals.find((x) => x.code === code) || journals.find((x) => x.code === "OD");
      return j.id;
    },
    openKey,
  };
}

/** Next number of a journal for a year: "VE-2026-000042". Call under the company's ledger lock. */
async function nextNumber(tx, companyId, code, year) {
  const prefix = `${code}-${year}-`;
  const last = await tx.journalEntry.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(6, "0")}`;
}

/**
 * Posts an entry spec (rules.js shape) on `dateKey` (default: its own date). Lines whose account is
 * missing from the chart go to the suspense account, labelled. Returns the entry.
 */
export async function postSpec(tx, ctx, spec, { dateKey = spec.dateKey, late = false, status = "POSTED", isManual = false, user = null, note = null } = {}) {
  if (!balanced(spec)) throw invalid(`The entry "${spec.label}" does not balance.`);
  const journal = spec.journal || "OD";
  const number = status === "POSTED" ? await nextNumber(tx, ctx.company.id, journal, dateKey.slice(0, 4)) : null;
  const total = spec.lines.reduce((s, l) => s + l.debit, 0);
  const entry = await tx.journalEntry.create({
    data: {
      companyId: ctx.company.id,
      journalId: ctx.journalId(journal),
      number,
      date: dbDay(dateKey),
      label: String(spec.label || "").slice(0, 300),
      reference: spec.reference || null,
      departmentId: spec.departmentId || null,
      sourceKey: spec.sourceKey || null,
      fingerprint: spec.sourceKey ? fingerprint(spec) : null,
      status,
      isManual,
      late,
      total,
      note,
      createdById: user?.id || null,
      createdByName: user?.name || null,
      postedAt: status === "POSTED" ? new Date() : null,
    },
  });
  await tx.journalLine.createMany({
    data: spec.lines.map((l, i) => {
      const known = ctx.hasAccount(l.account);
      return {
        entryId: entry.id,
        companyId: ctx.company.id,
        accountId: ctx.accountId(l.account),
        date: dbDay(dateKey),
        position: i,
        debit: l.debit,
        credit: l.credit,
        label: known ? l.label || null : `${l.label ? `${l.label} · ` : ""}account ${l.account} is not in the chart`,
        departmentId: l.departmentId || spec.departmentId || null,
        partnerKey: l.partnerKey || null,
        partnerName: l.partnerName || null,
        vatBase: l.vatBase ?? null,
      };
    }),
  });
  return entry;
}

/** Reverses a posted entry on `dateKey` (its own date by default): the same lines, sides swapped. */
export async function reverseEntry(tx, ctx, entry, { dateKey, label, user = null } = {}) {
  const lines = await tx.journalLine.findMany({ where: { entryId: entry.id }, orderBy: { position: "asc" }, include: { account: { select: { number: true } } } });
  const when = dateKey || keyOf(entry.date);
  const journal = await tx.journal.findUnique({ where: { id: entry.journalId }, select: { code: true } });
  const number = await nextNumber(tx, ctx.company.id, journal.code, when.slice(0, 4));
  const reversal = await tx.journalEntry.create({
    data: {
      companyId: ctx.company.id,
      journalId: entry.journalId,
      number,
      date: dbDay(when),
      label: (label || `Reversal of ${entry.number || ""} · ${entry.label}`).slice(0, 300),
      reference: entry.reference,
      departmentId: entry.departmentId,
      sourceKey: entry.sourceKey || null,
      status: "POSTED",
      isManual: entry.isManual,
      late: when !== keyOf(entry.date) && ctx.openKey && keyOf(entry.date) < ctx.openKey,
      reversalOfId: entry.id,
      total: entry.total,
      createdById: user?.id || null,
      createdByName: user?.name || null,
      postedAt: new Date(),
    },
  });
  await tx.journalLine.createMany({
    data: lines.map((l, i) => ({
      entryId: reversal.id,
      companyId: l.companyId,
      accountId: l.accountId,
      date: dbDay(when),
      position: i,
      debit: l.credit,
      credit: l.debit,
      label: l.label,
      departmentId: l.departmentId,
      partnerKey: l.partnerKey,
      partnerName: l.partnerName,
      vatBase: l.vatBase === null ? null : -l.vatBase,
    })),
  });
  await tx.journalEntry.update({ where: { id: entry.id }, data: { reversedAt: new Date() } });
  return reversal;
}

/** The date a change to something dated `dateKey` is posted on: itself, or the first open day. */
export function postingDate(dateKey, openKey) {
  return openKey && dateKey < openKey ? { dateKey: openKey, late: true } : { dateKey, late: false };
}

/**
 * Brings the active entries of `existing` (sourceKey → entry) to the `desired` specs (sourceKey →
 * spec or null): unchanged entries stay, changed ones are reversed and posted again, missing ones
 * reversed. Returns counts.
 */
export async function applyDesired(tx, ctx, desired, existing, { todayKey }) {
  const counts = { posted: 0, reversed: 0, unchanged: 0, skipped: 0 };
  const keys = new Set([...desired.keys(), ...existing.keys()]);
  for (const key of keys) {
    const want = desired.get(key) || null;
    const have = existing.get(key) || null;
    const usable = want && want.dateKey <= todayKey && balanced(want);
    if (want && !usable) counts.skipped += 1;
    if (usable && have && have.fingerprint === fingerprint(want)) {
      counts.unchanged += 1;
      continue;
    }
    if (have) {
      await reverseEntry(tx, ctx, have, { dateKey: postingDate(keyOf(have.date), ctx.openKey).dateKey });
      counts.reversed += 1;
    }
    if (usable) {
      const p = postingDate(want.dateKey, ctx.openKey);
      await postSpec(tx, ctx, want, p);
      counts.posted += 1;
    }
  }
  return counts;
}

export { db };
