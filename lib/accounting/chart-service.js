/**
 * The chart of accounts of a company: adding a sub-account under an existing account (e.g. 5212
 * "Afriland First Bank" under 521), renaming the English label, switching an unused account off.
 * Seeded SYSCOHADA accounts keep their number and official name.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { validAccountNumber } from "./chart";
import { RECONCILABLE } from "./chart";

const text = (v, max = 160) => String(v ?? "").trim().slice(0, max) || null;

export async function saveLedgerAccount(tx, { user, access }, input) {
  const company = access.company;
  if (input.id) {
    const a = await tx.ledgerAccount.findFirst({ where: { id: input.id, companyId: company.id } });
    if (!a) throw notFound("Account not found.");
    const data = {};
    if (input.label !== undefined) data.label = text(input.label) || a.label;
    if (input.name !== undefined && !a.isSystem) data.name = text(input.name) || a.name;
    if (input.isActive !== undefined) {
      if (!input.isActive) {
        const used = await tx.journalLine.count({ where: { accountId: a.id, entry: { status: { in: ["DRAFT", "PENDING"] } } } });
        if (used) throw conflict("This account is used by an entry not posted yet.");
        const map = Object.values(company.accountMap || {});
        if (map.includes(a.number)) throw conflict("This account is chosen for a category or role in the settings.");
      }
      data.isActive = Boolean(input.isActive);
    }
    if (input.reconcilable !== undefined) data.reconcilable = Boolean(input.reconcilable) && /^5/.test(a.number);
    const updated = await tx.ledgerAccount.update({ where: { id: a.id }, data });
    await recordAudit(tx, { user, action: "LEDGER_ACCOUNT_UPDATED", entityType: "LedgerAccount", entityId: a.id, before: { label: a.label, isActive: a.isActive }, after: data });
    return updated;
  }
  const number = String(input.number || "").trim();
  if (!validAccountNumber(number)) throw invalid("An account number has 3 to 10 digits and starts with 1 to 8.");
  const parents = await tx.ledgerAccount.findMany({ where: { companyId: company.id, number: { in: Array.from({ length: number.length - 3 }, (_, i) => number.slice(0, i + 3)) } }, select: { number: true } });
  if (!parents.length) throw invalid("A new account goes under an existing one: its number starts with an account of the chart (e.g. 5212 under 521).");
  if (await tx.ledgerAccount.findFirst({ where: { companyId: company.id, number } })) throw conflict(`Account ${number} already exists.`);
  const name = text(input.name);
  if (!name) throw invalid("Give the account a name.");
  const a = await tx.ledgerAccount.create({ data: { companyId: company.id, number, name, label: text(input.label) || name, reconcilable: /^5[25]/.test(number) || RECONCILABLE.has(number) } });
  await recordAudit(tx, { user, action: "LEDGER_ACCOUNT_CREATED", entityType: "LedgerAccount", entityId: a.id, after: { number, name } });
  return a;
}
