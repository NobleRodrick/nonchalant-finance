/**
 * Companies of a business (Boss → companies → departments) and their accounting settings:
 * details printed on statements, accounting level (Simple / Full), fiscal year, VAT, the optional
 * features (supplier bills, reconciliation), approval threshold of manual entries, account map.
 * Every change is audited. Switching to Full builds the ledger from the whole history (after commit:
 * lib/accounting/sync.js syncCompany).
 */
import { recordAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { conflict, invalid, notFound } from "@/lib/errors";
import { isDateKey } from "@/lib/timezone";
import { ensureLedger } from "./ledger";
import { CATEGORY_ACCOUNTS, ROLE_ACCOUNTS } from "./account-map";

const text = (v, max = 200) => String(v ?? "").trim().slice(0, max) || null;

export async function companyOf(client, user, companyId) {
  const c = await client.company.findFirst({ where: { id: companyId || "-", organizationId: user.organizationId } });
  if (!c) throw notFound("Company not found.");
  return c;
}

/** Companies of the business with their departments (the Boss's settings). */
export async function listCompanies(client, organizationId) {
  return client.company.findMany({
    where: { organizationId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { departments: { select: { id: true, name: true, domain: true, isActive: true }, orderBy: { name: "asc" } }, members: { where: { isActive: true }, select: { userId: true } } },
  });
}

function details(input) {
  const name = text(input.name, 120);
  if (!name) throw invalid("Give the company a name.");
  const month = input.fiscalYearStartMonth === undefined ? undefined : Number(input.fiscalYearStartMonth);
  if (month !== undefined && !(Number.isInteger(month) && month >= 1 && month <= 12)) throw invalid("The fiscal year starts in a month from 1 to 12.");
  const email = text(input.email, 160);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw invalid("Enter a valid e-mail address.");
  return {
    name,
    legalName: text(input.legalName, 200),
    taxId: text(input.taxId, 40),
    tradeRegister: text(input.tradeRegister, 60),
    address: text(input.address, 300),
    phone: text(input.phone, 40),
    email,
    ...(month !== undefined ? { fiscalYearStartMonth: month } : {}),
  };
}

/** Creates a company (input.id absent) or updates its details. */
export async function saveCompany(tx, { user }, input) {
  const data = details(input);
  const clash = await tx.company.findFirst({ where: { organizationId: user.organizationId, name: data.name, ...(input.id ? { NOT: { id: input.id } } : {}) }, select: { id: true } });
  if (clash) throw conflict(`A company named "${data.name}" already exists.`);
  if (input.id) {
    const before = await companyOf(tx, user, input.id);
    if (before.accountingLevel === "FULL" && data.fiscalYearStartMonth && data.fiscalYearStartMonth !== before.fiscalYearStartMonth) {
      const posted = await tx.journalEntry.count({ where: { companyId: before.id, status: "POSTED" } });
      if (posted) throw conflict("The fiscal year cannot change once the books are kept.");
    }
    const c = await tx.company.update({ where: { id: before.id }, data });
    await recordAudit(tx, { user, action: "COMPANY_UPDATED", entityType: "Company", entityId: c.id, before: details(before), after: data });
    return c;
  }
  const c = await tx.company.create({ data: { ...data, organizationId: user.organizationId } });
  await recordAudit(tx, { user, action: "COMPANY_CREATED", entityType: "Company", entityId: c.id, after: data });
  return c;
}

/**
 * Moves a department to another company. Refused once either company keeps Full books and the
 * department already has entries (its history would be split between two sets of books).
 */
export async function assignDepartment(tx, { user }, { departmentId, companyId }) {
  const company = await companyOf(tx, user, companyId);
  const dept = await tx.department.findFirst({ where: { id: departmentId || "-", organizationId: user.organizationId }, include: { company: true } });
  if (!dept) throw notFound("Department not found.");
  if (dept.companyId === company.id) return dept;
  const posted = await tx.journalEntry.count({ where: { departmentId: dept.id, status: "POSTED" } });
  if (posted) throw conflict(`${dept.name} already has entries in the books of ${dept.company?.name}. It cannot change company.`);
  const d = await tx.department.update({ where: { id: dept.id }, data: { companyId: company.id, ledgerSyncedAt: null, ledgerDirtyAt: new Date() } });
  await recordAudit(tx, { user, departmentId: dept.id, action: "DEPARTMENT_COMPANY_CHANGED", entityType: "Department", entityId: dept.id, before: { companyId: dept.companyId }, after: { companyId: company.id } });
  return d;
}

/**
 * Simple ↔ Full. Full creates the chart and journals; the ledger itself is built right after the
 * change commits (the whole history). Back to Simple keeps every entry (hidden, frozen).
 */
export async function setAccountingLevel(tx, { user, now = new Date() }, { companyId, level }) {
  if (!["SIMPLE", "FULL"].includes(level)) throw invalid("Choose Simple or Full accounting.");
  const c = await companyOf(tx, user, companyId);
  if (c.accountingLevel === level) return c;
  if (level === "FULL") await ensureLedger(tx, c.id);
  const updated = await tx.company.update({ where: { id: c.id }, data: { accountingLevel: level, ...(level === "FULL" && !c.fullSince ? { fullSince: new Date(now.toISOString().slice(0, 10)) } : {}) } });
  if (level === "FULL") await tx.department.updateMany({ where: { companyId: c.id }, data: { ledgerSyncedAt: null, ledgerDirtyAt: now } });
  await recordAudit(tx, { user, action: level === "FULL" ? "ACCOUNTING_FULL" : "ACCOUNTING_SIMPLE", entityType: "Company", entityId: c.id, before: { level: c.accountingLevel }, after: { level } });
  return updated;
}

/** VAT, supplier bills, reconciliation and the approval threshold (Full accounting only). */
export async function setFeatures(tx, { user }, input) {
  const c = await companyOf(tx, user, input.companyId);
  if (c.accountingLevel !== "FULL") throw invalid("Switch the company to Full accounting first.");
  const data = {};
  if (input.vatEnabled !== undefined) {
    data.vatEnabled = Boolean(input.vatEnabled);
    if (data.vatEnabled) {
      if (!isDateKey(input.vatSince || "")) throw invalid("Give the date VAT starts.");
      data.vatSince = new Date(`${input.vatSince}T00:00:00Z`);
      const rate = Math.round(Number(input.vatRate ?? c.vatRateBp / 100) * 100);
      if (!(rate > 0 && rate <= 5000)) throw invalid("The VAT rate is a percentage between 0 and 50.");
      data.vatRateBp = rate;
      if (input.vatPricesInclude !== undefined) data.vatPricesInclude = Boolean(input.vatPricesInclude);
      if (Array.isArray(input.vatExempt)) data.vatExempt = input.vatExempt.map(String).filter((x) => /^[a-z-]+$/.test(x)).slice(0, 100);
    }
  }
  if (input.payablesEnabled !== undefined) data.payablesEnabled = Boolean(input.payablesEnabled);
  if (input.reconciliationEnabled !== undefined) data.reconciliationEnabled = Boolean(input.reconciliationEnabled);
  if (input.approvalThreshold !== undefined) {
    const t = Number(input.approvalThreshold);
    if (!(Number.isInteger(t) && t >= 0)) throw invalid("The approval threshold is a whole number of francs.");
    data.approvalThreshold = t;
  }
  const updated = await tx.company.update({ where: { id: c.id }, data });
  if (data.vatEnabled !== undefined && data.vatEnabled !== c.vatEnabled) await tx.department.updateMany({ where: { companyId: c.id }, data: { ledgerSyncedAt: null, ledgerDirtyAt: new Date() } });
  await recordAudit(tx, { user, action: "ACCOUNTING_SETTINGS", entityType: "Company", entityId: c.id, after: { ...data, vatSince: input.vatSince } });
  return updated;
}

/**
 * The account used for a money category or a posting role ("category:opex-gas" → "6053"). The
 * account must exist in the company's chart; an empty value restores the default. Changing it
 * re-posts the open periods.
 */
export async function setAccountFor(tx, { user }, { companyId, key, number }) {
  const c = await companyOf(tx, user, companyId);
  if (c.accountingLevel !== "FULL") throw invalid("Switch the company to Full accounting first.");
  const [kind, id] = String(key || "").split(":");
  const known = kind === "role" ? ROLE_ACCOUNTS[id] : kind === "category" ? CATEGORY_ACCOUNTS[id] || id : null;
  if (!known) throw invalid("Unknown category or role.");
  const map = { ...(c.accountMap || {}) };
  if (number) {
    const acc = await tx.ledgerAccount.findFirst({ where: { companyId: c.id, number: String(number), isActive: true } });
    if (!acc) throw invalid(`Account ${number} is not in the chart.`);
    map[key] = acc.number;
  } else delete map[key];
  const updated = await tx.company.update({ where: { id: c.id }, data: { accountMap: map } });
  await tx.department.updateMany({ where: { companyId: c.id }, data: { ledgerSyncedAt: null, ledgerDirtyAt: new Date() } });
  await recordAudit(tx, { user, action: "ACCOUNT_MAP_CHANGED", entityType: "Company", entityId: c.id, after: { key, number: number || null } });
  return updated;
}

/** The companies an accountant keeps (replaces the list); at least one. */
export async function setAccountantCompanies(tx, { user }, { userId, companyIds }) {
  const accountant = await tx.user.findFirst({ where: { id: userId || "-", organizationId: user.organizationId, role: "ACCOUNTANT" } });
  if (!accountant) throw notFound("Accountant not found.");
  const ids = [...new Set((companyIds || []).map(String))];
  if (!ids.length) throw invalid("Choose at least one company.");
  const n = await tx.company.count({ where: { id: { in: ids }, organizationId: user.organizationId } });
  if (n !== ids.length) throw invalid("A company is not part of your business.");
  await tx.companyMember.updateMany({ where: { userId: accountant.id, companyId: { notIn: ids } }, data: { isActive: false } });
  for (const companyId of ids) {
    await tx.companyMember.upsert({ where: { companyId_userId: { companyId, userId: accountant.id } }, update: { isActive: true }, create: { companyId, userId: accountant.id } });
  }
  await recordAudit(tx, { user, action: "ACCOUNTANT_COMPANIES", entityType: "User", entityId: accountant.id, after: { companyIds: ids } });
  return { id: accountant.id, companyIds: ids };
}

/**
 * The Boss authorizes a department head to keep a company's books, or withdraws it.
 * `scope`: "DEPARTMENTS" (the books of the departments he heads in this company), "COMPANY" (the
 * whole company's books, like an accountant), or null (no access). The head keeps them while the
 * company keeps Full accounting; approval of large entries, closing and settings stay the Boss's.
 * The head is told (notification).
 */
export async function setHeadBookkeeper(tx, { user }, { companyId, userId, scope }) {
  const c = await companyOf(tx, user, companyId);
  if (scope !== null && !["COMPANY", "DEPARTMENTS"].includes(scope)) throw invalid("Choose what the head keeps: his departments, the whole company, or nothing.");
  const head = await tx.user.findFirst({ where: { id: userId || "-", organizationId: user.organizationId, role: "HEAD" }, select: { id: true, name: true, isActive: true } });
  if (!head) throw notFound("Department head not found.");
  const runs = await tx.userDepartment.count({ where: { userId: head.id, isActive: true, department: { companyId: c.id } } });
  if (scope && !runs) throw invalid(`${head.name} does not head a department of ${c.name}.`);
  const before = await tx.companyMember.findUnique({ where: { companyId_userId: { companyId: c.id, userId: head.id } } });
  if (!scope) {
    if (before?.isActive) await tx.companyMember.update({ where: { id: before.id }, data: { isActive: false } });
  } else {
    await tx.companyMember.upsert({
      where: { companyId_userId: { companyId: c.id, userId: head.id } },
      update: { isActive: true, scope, grantedById: user.id },
      create: { companyId: c.id, userId: head.id, scope, grantedById: user.id },
    });
  }
  const was = before?.isActive ? before.scope : null;
  if (was !== scope) {
    const what = scope === "COMPANY" ? `the books of ${c.name}` : scope === "DEPARTMENTS" ? `the books of your departments (${c.name})` : null;
    await notifyUsers(tx, { organizationId: user.organizationId, userIds: [head.id], kind: "BOOKKEEPING", title: what ? `You now keep ${what}` : `You no longer keep the books of ${c.name}`, body: what ? "Open Accounting in the menu." : null, href: what ? `/accounting/${c.id}` : "/home" });
    await recordAudit(tx, { user, action: "HEAD_BOOKKEEPER_SET", entityType: "Company", entityId: c.id, before: { userId: head.id, scope: was }, after: { userId: head.id, scope } });
  }
  return { userId: head.id, scope };
}

/** Heads of the company's departments and what books each keeps (Accounting settings). */
export async function headBookkeepers(client, company) {
  const heads = await client.user.findMany({
    where: { organizationId: company.organizationId, role: "HEAD", isActive: true, memberships: { some: { isActive: true, department: { companyId: company.id } } } },
    select: { id: true, name: true, title: true, email: true, memberships: { where: { isActive: true, department: { companyId: company.id } }, select: { department: { select: { name: true } } } }, companyMemberships: { where: { companyId: company.id, isActive: true }, select: { scope: true } } },
    orderBy: { name: "asc" },
  });
  return heads.map((h) => ({ id: h.id, name: h.name, title: h.title, email: h.email, departments: h.memberships.map((m) => m.department.name), scope: h.companyMemberships[0]?.scope || null }));
}
