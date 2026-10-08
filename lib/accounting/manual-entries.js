/**
 * Entries typed by the Boss or an accountant for what the app does not record by itself: capital
 * brought in, a bank loan, salaries paid from the bank, an adjustment, opening balances, the
 * allocation of a year's result. Drafts can be edited; posting gives the entry its number and makes
 * it permanent (a mistake is reversed, never edited). An accountant's entry above the company's
 * approval threshold waits for the Boss.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { notifyBosses, notifyUsers } from "@/lib/notifications";
import { formatMoney } from "@/lib/format";
import { isDateKey } from "@/lib/timezone";
import { dbDay, keyOf, ledgerContext, lockLedger, postingDate, reverseEntry } from "./ledger";
import { JOURNALS } from "./chart";
import { entryScope } from "./access";

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;
const MANUAL_JOURNALS = new Set(JOURNALS.map((j) => j.code));

async function nextNumber(tx, companyId, code, year) {
  const prefix = `${code}-${year}-`;
  const last = await tx.journalEntry.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } });
  return `${prefix}${String(last ? Number(last.number.slice(prefix.length)) + 1 : 1).padStart(6, "0")}`;
}

/** Validates the lines typed (account numbers, one side each, balanced). */
async function checkLines(tx, company, lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw invalid("An entry needs at least two lines.");
  if (lines.length > 200) throw invalid("An entry has at most 200 lines.");
  const numbers = [...new Set(lines.map((l) => String(l.account || "").trim()))];
  const accounts = await tx.ledgerAccount.findMany({ where: { companyId: company.id, number: { in: numbers } }, select: { id: true, number: true, isActive: true } });
  const byNumber = new Map(accounts.map((a) => [a.number, a]));
  const deptIds = [...new Set(lines.map((l) => l.departmentId).filter(Boolean))];
  if (deptIds.length) {
    const n = await tx.department.count({ where: { id: { in: deptIds }, companyId: company.id } });
    if (n !== deptIds.length) throw invalid("A department of the entry does not belong to this company.");
  }
  let debit = 0;
  let credit = 0;
  const out = lines.map((l, i) => {
    const number = String(l.account || "").trim();
    const acc = byNumber.get(number);
    if (!acc) throw invalid(`Line ${i + 1}: account ${number || "?"} is not in the chart.`);
    if (!acc.isActive) throw invalid(`Line ${i + 1}: account ${number} is switched off.`);
    const d = Number(l.debit || 0);
    const c = Number(l.credit || 0);
    if (!Number.isInteger(d) || !Number.isInteger(c) || d < 0 || c < 0) throw invalid(`Line ${i + 1}: amounts are whole numbers of francs.`);
    if ((d > 0) === (c > 0)) throw invalid(`Line ${i + 1}: put the amount either in debit or in credit.`);
    debit += d;
    credit += c;
    const partnerName = text(l.partnerName, 120);
    return { accountId: acc.id, number, debit: d, credit: c, label: text(l.label, 200), departmentId: l.departmentId || null, partnerKey: l.partnerKey || (partnerName ? `name:${partnerName.toLowerCase().replace(/\s+/g, " ")}` : null), partnerName, position: i };
  });
  if (debit !== credit) throw invalid(`The entry does not balance: debit ${formatMoney(debit)}, credit ${formatMoney(credit)}.`);
  return { lines: out, total: debit };
}

/**
 * Saves a manual entry (new, or a draft / rejected one edited). `submit`: post it (or send it for
 * approval) instead of keeping a draft.
 */
export async function saveManualEntry(tx, { user, access }, input, { sourceKey = null } = {}) {
  const company = access.company;
  await lockLedger(tx, company.id);
  const ctx = await ledgerContext(tx, company);
  const journal = MANUAL_JOURNALS.has(input.journal) ? input.journal : "OD";
  if (!isDateKey(input.dateKey || "")) throw invalid("Choose the date of the entry.");
  if (ctx.openKey && input.dateKey < ctx.openKey) throw invalid(`The books are closed until ${ctx.openKey}. Date the entry on or after it.`);
  const label = text(input.label, 300);
  if (!label) throw invalid("Say what the entry is for.");
  const { lines, total } = await checkLines(tx, company, input.lines);
  // A head keeping only his departments' books: every line is one of his departments.
  if (access.scoped && lines.some((l) => !l.departmentId || !access.departmentIds.includes(l.departmentId))) {
    throw forbidden("Give every line one of your departments: you keep only their books.");
  }
  // An entry whose lines all belong to one department is that department's entry.
  const lineDepts = [...new Set(lines.map((l) => l.departmentId))];
  const departmentId = lineDepts.length === 1 && lineDepts[0] ? lineDepts[0] : null;
  const needsApproval = Boolean(input.submit) && !access.isBoss && company.approvalThreshold > 0 && total > company.approvalThreshold;
  const status = !input.submit ? "DRAFT" : needsApproval ? "PENDING" : "POSTED";

  let entry;
  if (input.id) {
    const before = await tx.journalEntry.findFirst({ where: { id: input.id, companyId: company.id, isManual: true, ...entryScope(access) } });
    if (!before) throw notFound("Entry not found.");
    if (!["DRAFT", "REJECTED", "PENDING"].includes(before.status)) throw conflict("A posted entry cannot be changed. Reverse it and record a new one.");
    await tx.journalLine.deleteMany({ where: { entryId: before.id } });
    entry = await tx.journalEntry.update({ where: { id: before.id }, data: { journalId: ctx.journalId(journal), date: dbDay(input.dateKey), label, reference: text(input.reference, 60), note: text(input.note, 1000), total, departmentId, status: "DRAFT", rejectedReason: null } });
  } else {
    entry = await tx.journalEntry.create({
      data: { companyId: company.id, journalId: ctx.journalId(journal), date: dbDay(input.dateKey), label, reference: text(input.reference, 60), note: text(input.note, 1000), status: "DRAFT", isManual: true, total, departmentId, sourceKey, createdById: user.id, createdByName: user.name },
    });
  }
  await tx.journalLine.createMany({ data: lines.map((l) => ({ entryId: entry.id, companyId: company.id, accountId: l.accountId, date: dbDay(input.dateKey), position: l.position, debit: l.debit, credit: l.credit, label: l.label, departmentId: l.departmentId, partnerKey: l.partnerKey, partnerName: l.partnerName })) });
  if (status === "POSTED") {
    entry = await tx.journalEntry.update({ where: { id: entry.id }, data: { status: "POSTED", number: await nextNumber(tx, company.id, journal, input.dateKey.slice(0, 4)), postedAt: new Date(), approvedById: user.id, approvedByName: user.name, approvedAt: new Date() } });
  } else if (status === "PENDING") {
    entry = await tx.journalEntry.update({ where: { id: entry.id }, data: { status: "PENDING" } });
    await notifyBosses(tx, { organizationId: user.organizationId, kind: "ENTRY_TO_APPROVE", title: `Entry to approve: ${label}`, body: `${formatMoney(total)} · ${user.name}`, href: `/accounting/${company.id}/entries/${entry.id}` });
  }
  await recordAudit(tx, { user, action: `MANUAL_ENTRY_${status}`, entityType: "JournalEntry", entityId: entry.id, after: { label, total, journal, dateKey: input.dateKey } });
  return entry;
}

/** The Boss approves (posts) or rejects an entry waiting for approval. */
export async function decideManualEntry(tx, { user, access }, { entryId, decision, reason }) {
  if (!access.canApprove) throw forbidden("Only the Boss approves entries.");
  const company = access.company;
  await lockLedger(tx, company.id);
  const ctx = await ledgerContext(tx, company);
  const e = await tx.journalEntry.findFirst({ where: { id: entryId || "-", companyId: company.id, isManual: true }, include: { journal: { select: { code: true } } } });
  if (!e) throw notFound("Entry not found.");
  if (e.status !== "PENDING") throw conflict("This entry is not waiting for approval.");
  let updated;
  if (decision === "APPROVE") {
    const dateKey = keyOf(e.date);
    if (ctx.openKey && dateKey < ctx.openKey) throw conflict(`The books are closed until ${ctx.openKey}. Ask for the entry to be dated again.`);
    updated = await tx.journalEntry.update({ where: { id: e.id }, data: { status: "POSTED", number: await nextNumber(tx, company.id, e.journal.code, dateKey.slice(0, 4)), postedAt: new Date(), approvedById: user.id, approvedByName: user.name, approvedAt: new Date() } });
  } else if (decision === "REJECT") {
    const why = text(reason, 500);
    if (!why) throw invalid("Say why the entry is rejected.");
    updated = await tx.journalEntry.update({ where: { id: e.id }, data: { status: "REJECTED", rejectedReason: why } });
  } else throw invalid("Approve or reject.");
  if (e.createdById) await notifyUsers(tx, { organizationId: user.organizationId, userIds: [e.createdById], kind: decision === "APPROVE" ? "ENTRY_APPROVED" : "ENTRY_REJECTED", title: `${decision === "APPROVE" ? "Approved" : "Rejected"}: ${e.label}`, body: reason || null, href: `/accounting/${company.id}/entries/${e.id}` });
  await recordAudit(tx, { user, action: `MANUAL_ENTRY_${decision}D`, entityType: "JournalEntry", entityId: e.id, after: { reason: reason || null } });
  return updated;
}

/** Reverses a posted manual entry (on its date, or the first open day). Generated entries follow their records. */
export async function reverseManualEntry(tx, { user, access }, { entryId, reason }) {
  const company = access.company;
  await lockLedger(tx, company.id);
  const ctx = await ledgerContext(tx, company);
  const e = await tx.journalEntry.findFirst({ where: { id: entryId || "-", companyId: company.id, ...entryScope(access) } });
  if (!e) throw notFound("Entry not found.");
  if (!e.isManual) throw conflict("This entry comes from a record of a department: correct or void the record and the books follow.");
  if (e.status !== "POSTED" || e.reversedAt || e.reversalOfId) throw conflict("Only a posted entry that was not reversed can be reversed.");
  const why = text(reason, 300);
  if (!why) throw invalid("Say why the entry is reversed.");
  const r = await reverseEntry(tx, ctx, e, { dateKey: postingDate(keyOf(e.date), ctx.openKey).dateKey, label: `Reversal of ${e.number} · ${why}`, user });
  await recordAudit(tx, { user, action: "MANUAL_ENTRY_REVERSED", entityType: "JournalEntry", entityId: e.id, after: { reversal: r.number, reason: why } });
  return r;
}

/** Deletes a draft or rejected entry (never a posted one). */
export async function deleteDraftEntry(tx, { user, access }, { entryId }) {
  const e = await tx.journalEntry.findFirst({ where: { id: entryId || "-", companyId: access.company.id, isManual: true, ...entryScope(access) } });
  if (!e) throw notFound("Entry not found.");
  if (!["DRAFT", "REJECTED"].includes(e.status)) throw conflict("Only a draft or a rejected entry can be deleted.");
  await tx.journalEntry.delete({ where: { id: e.id } });
  await recordAudit(tx, { user, action: "MANUAL_ENTRY_DELETED", entityType: "JournalEntry", entityId: e.id, before: { label: e.label, total: e.total } });
  return { id: e.id };
}
