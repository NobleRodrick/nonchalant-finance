/**
 * Bank and Mobile Money reconciliation: a statement is imported (CSV rows: date, label, reference,
 * amount), its lines are matched with the books' lines on that account (same amount, close date,
 * reference first), and what the books miss (bank charges, interest, a transfer not recorded) is
 * posted from the statement line. A matched ledger line carries the statement line's id.
 */
import { db } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { isDateKey } from "@/lib/timezone";
import { dbDay, keyOf } from "./ledger";
import { saveManualEntry } from "./manual-entries";

const text = (v, max = 200) => String(v ?? "").trim().slice(0, max) || null;

export { parseStatementCsv } from "./reconciliation-csv";
import { MATCH_DAYS, proposeMatches } from "./books-math";
export { MATCH_DAYS };

/** Imports a statement of a reconciled account (bank, MoMo …) and matches what it can at once. */
export async function importStatement(tx, ctx, input) {
  const company = ctx.access.company;
  if (!company.reconciliationEnabled) throw invalid("Reconciliation is off for this company (Accounting → Settings).");
  const account = await tx.ledgerAccount.findFirst({ where: { companyId: company.id, number: String(input.accountNumber || ""), reconcilable: true, isActive: true } });
  if (!account) throw invalid("Choose a bank or Mobile Money account.");
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) throw invalid("No lines to import.");
  if (rows.length > 3000) throw invalid("At most 3 000 lines per statement.");
  for (const [i, r] of rows.entries()) {
    if (!isDateKey(r.dateKey || "") || !Number.isInteger(r.amount) || !r.amount) throw invalid(`Line ${i + 1}: a date and a whole amount are needed.`);
  }
  const keys = rows.map((r) => r.dateKey).sort();
  const st = await tx.bankStatement.create({
    data: { companyId: company.id, accountNumber: account.number, name: text(input.name, 120) || `${account.label} ${keys[0]} – ${keys.at(-1)}`, fromDate: dbDay(keys[0]), toDate: dbDay(keys.at(-1)), openingBalance: Math.round(Number(input.openingBalance) || 0), closingBalance: Math.round(Number(input.closingBalance) || 0), importedById: ctx.user.id },
  });
  await tx.statementLine.createMany({ data: rows.map((r) => ({ statementId: st.id, date: dbDay(r.dateKey), label: text(r.label, 300) || "Statement line", reference: text(r.reference, 80), amount: r.amount })) });
  await recordAudit(tx, { user: ctx.user, action: "STATEMENT_IMPORTED", entityType: "BankStatement", entityId: st.id, after: { account: account.number, lines: rows.length } });
  const matched = await autoMatch(tx, ctx, { statementId: st.id });
  return { statementId: st.id, lines: rows.length, matched };
}

/** The books' lines of the account not matched yet, around [fromKey, toKey]. */
async function openLedgerLines(client, companyId, accountNumber, fromKey, toKey) {
  const from = new Date(Date.parse(`${fromKey}T00:00:00Z`) - MATCH_DAYS * 86400000);
  const to = new Date(Date.parse(`${toKey}T00:00:00Z`) + MATCH_DAYS * 86400000);
  return client.journalLine.findMany({
    where: { companyId, account: { number: accountNumber }, entry: { status: "POSTED" }, reconciliationId: null, date: { gte: from, lte: to } },
    select: { id: true, date: true, debit: true, credit: true, label: true, entry: { select: { id: true, number: true, label: true, reference: true } } },
    orderBy: { date: "asc" },
  });
}

export { proposeMatches };

async function pair(tx, statementLineId, journalLineId) {
  await tx.statementLine.update({ where: { id: statementLineId }, data: { status: "MATCHED", journalLineId } });
  await tx.journalLine.update({ where: { id: journalLineId }, data: { reconciliationId: statementLineId } });
}

export async function autoMatch(tx, ctx, { statementId }) {
  const st = await tx.bankStatement.findFirst({ where: { id: statementId || "-", companyId: ctx.access.company.id }, include: { lines: { where: { status: "UNMATCHED" } } } });
  if (!st) throw notFound("Statement not found.");
  if (!st.lines.length) return 0;
  const ledger = (await openLedgerLines(tx, st.companyId, st.accountNumber, keyOf(st.fromDate), keyOf(st.toDate))).map((l) => ({ id: l.id, dateKey: keyOf(l.date), amount: l.debit - l.credit, reference: l.entry.reference, label: l.label || l.entry.label }));
  const pairs = proposeMatches(st.lines.map((l) => ({ id: l.id, dateKey: keyOf(l.date), amount: l.amount, reference: l.reference })), ledger);
  for (const p of pairs) await pair(tx, p.statementLineId, p.journalLineId);
  return pairs.length;
}

/** Matches one statement line with a ledger line chosen by the accountant (amounts must agree). */
export async function matchLine(tx, ctx, { statementLineId, journalLineId }) {
  const s = await tx.statementLine.findFirst({ where: { id: statementLineId || "-", statement: { companyId: ctx.access.company.id } }, include: { statement: true } });
  if (!s) throw notFound("Statement line not found.");
  if (s.status === "MATCHED") throw conflict("This line is already matched.");
  const l = await tx.journalLine.findFirst({ where: { id: journalLineId || "-", companyId: ctx.access.company.id, reconciliationId: null, account: { number: s.statement.accountNumber }, entry: { status: "POSTED" } } });
  if (!l) throw notFound("Ledger line not found (or already matched).");
  if (l.debit - l.credit !== s.amount) throw invalid("The amounts differ.");
  await pair(tx, s.id, l.id);
  return { matched: true };
}

/** Undoes a match, or sets a line aside (IGNORED: e.g. a line of another account) / back. */
export async function setLineStatus(tx, ctx, { statementLineId, status }) {
  const s = await tx.statementLine.findFirst({ where: { id: statementLineId || "-", statement: { companyId: ctx.access.company.id } } });
  if (!s) throw notFound("Statement line not found.");
  if (!["UNMATCHED", "IGNORED"].includes(status)) throw invalid("Unknown status.");
  if (s.journalLineId) await tx.journalLine.update({ where: { id: s.journalLineId }, data: { reconciliationId: null } });
  return tx.statementLine.update({ where: { id: s.id }, data: { status, journalLineId: null } });
}

/** Posts what the books miss from a statement line (bank charges, interest …) and matches it. */
export async function postFromLine(tx, ctx, { statementLineId, account, label }) {
  const s = await tx.statementLine.findFirst({ where: { id: statementLineId || "-", statement: { companyId: ctx.access.company.id } }, include: { statement: true } });
  if (!s) throw notFound("Statement line not found.");
  if (s.status !== "UNMATCHED") throw conflict("This line is already matched or set aside.");
  const amount = Math.abs(s.amount);
  const bank = s.statement.accountNumber;
  const lines = s.amount > 0 ? [{ account: bank, debit: amount, credit: 0 }, { account: String(account || ""), debit: 0, credit: amount }] : [{ account: String(account || ""), debit: amount, credit: 0 }, { account: bank, debit: 0, credit: amount }];
  const journal = /^55/.test(bank) ? "MM" : "BQ";
  const entry = await saveManualEntry(tx, ctx, { journal, dateKey: keyOf(s.date), label: text(label, 200) || s.label, reference: s.reference, lines, submit: true });
  if (entry.status === "POSTED") {
    const l = await tx.journalLine.findFirst({ where: { entryId: entry.id, account: { number: bank } } });
    await pair(tx, s.id, l.id);
    await tx.statementLine.update({ where: { id: s.id }, data: { entryId: entry.id } });
  }
  return { entry };
}

/** A statement with its lines, candidate ledger lines and the balances to compare. */
export async function statementDetail({ company, statementId, client = db }) {
  const st = await client.bankStatement.findFirst({ where: { id: statementId || "-", companyId: company.id }, include: { lines: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } } });
  if (!st) return null;
  const fromKey = keyOf(st.fromDate);
  const toKey = keyOf(st.toDate);
  const [open, booked, matchedLines] = await Promise.all([
    openLedgerLines(client, company.id, st.accountNumber, fromKey, toKey),
    client.journalLine.aggregate({ where: { companyId: company.id, account: { number: st.accountNumber }, entry: { status: "POSTED" }, date: { lte: st.toDate } }, _sum: { debit: true, credit: true } }),
    client.journalLine.findMany({ where: { id: { in: st.lines.map((l) => l.journalLineId).filter(Boolean) } }, select: { id: true, entry: { select: { id: true, number: true } } } }),
  ]);
  const entryOf = new Map(matchedLines.map((l) => [l.id, l.entry]));
  return {
    ...st,
    fromKey,
    toKey,
    lines: st.lines.map((l) => ({ ...l, dateKey: keyOf(l.date), entry: l.journalLineId ? entryOf.get(l.journalLineId) || null : null })),
    openLedger: open.map((l) => ({ id: l.id, dateKey: keyOf(l.date), amount: l.debit - l.credit, label: l.label || l.entry.label, number: l.entry.number, entryId: l.entry.id })),
    bookBalance: (booked._sum.debit || 0) - (booked._sum.credit || 0),
    statementMoves: st.lines.filter((l) => l.status !== "IGNORED").reduce((s, l) => s + l.amount, 0),
  };
}
