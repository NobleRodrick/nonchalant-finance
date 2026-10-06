"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { getCurrentUser, hashPassword, revokeSessions } from "@/lib/auth";
import { runAction } from "@/lib/action";
import { requireAdmin } from "@/lib/access";
import { forbidden, invalid, notFound, unauthorized } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { ensureBuildings } from "@/lib/property/unit-service";
import { DOMAIN_LIST, getDomain } from "@/lib/domains/registry";
import { validatePasswordStrength } from "@/lib/password-utils";
import { cleanGrants } from "@/lib/permissions";

const TITLE_MAX = 60;
const DOMAINS = DOMAIN_LIST.map((d) => d.key);
const CODE_RE = /^[A-Z0-9]{2,6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(text) {
  const base = String(text)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .slice(0, 40);
  return `${base || "org"}-${Math.random().toString(36).slice(2, 6)}`;
}

function cleanDomain(domain) {
  if (!domain) throw invalid("Choose the department type.");
  if (!DOMAINS.includes(domain)) throw invalid(`Unknown department type "${domain}".`);
  return domain;
}

/** Next free short code for a department type in the organization: RST, RST2, RST3 … */
async function nextDepartmentCode(tx, organizationId, domain) {
  const prefix = getDomain(domain).codePrefix;
  const used = new Set((await tx.department.findMany({ where: { organizationId }, select: { code: true } })).map((d) => d.code));
  if (!used.has(prefix)) return prefix;
  for (let i = 2; i < 1000; i += 1) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
  return `${prefix}${Date.now().toString(36).slice(-3).toUpperCase()}`;
}

async function cleanCode(tx, organizationId, code, exceptId = null) {
  const c = String(code || "").trim().toUpperCase();
  if (!CODE_RE.test(c)) throw invalid("The short code must be 2 to 6 letters or digits (for example RST).");
  const clash = await tx.department.findFirst({ where: { organizationId, code: c, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (clash) throw invalid(`The code ${c} is already used by ${clash.name}.`);
  return c;
}

function cleanDiscountLimit(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw invalid("The cashier discount limit must be a whole number of francs (0 = not allowed).");
  return n;
}

/** Creates a department with its cash drawer. */
async function createDepartmentRecord(tx, { user, organizationId, name, domain, description, code, cashierDiscountLimit, openingCashFloat = 0 }) {
  const dept = await tx.department.create({
    data: {
      organizationId,
      name,
      domain,
      description: description || null,
      code: code ? await cleanCode(tx, organizationId, code) : await nextDepartmentCode(tx, organizationId, domain),
      cashierDiscountLimit: cashierDiscountLimit ?? 0,
      openingCashFloat: Number.isInteger(Number(openingCashFloat)) && Number(openingCashFloat) > 0 ? Number(openingCashFloat) : 0,
      isActive: true,
    },
  });
  await tx.account.create({
    data: { name: "Cash drawer", type: "CURRENT", balance: 0, isDefault: true, organizationId, departmentId: dept.id, userId: user.id },
  });
  // Property rental: the owner's buildings are ready (renamed or added to later).
  if (domain === "PROPERTY_RENTAL") await ensureBuildings(tx, { user: { ...user, organizationId }, department: dept });
  return dept;
}

/** The job title the Boss gives a person (free text, optional). */
function cleanTitle(title) {
  const t = String(title ?? "").trim().replace(/\s+/g, " ");
  return t ? t.slice(0, TITLE_MAX) : null;
}

/**
 * Normalizes the departments a head is assigned to: [{ departmentId, isPrimary }], exactly one
 * primary (the one they open first). Accepts ids or objects.
 */
function normalizeMemberships(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const m = typeof raw === "string" ? { departmentId: raw } : raw;
    if (!m?.departmentId || seen.has(m.departmentId)) continue;
    seen.add(m.departmentId);
    out.push({ departmentId: m.departmentId, isPrimary: Boolean(m.isPrimary) });
  }
  if (out.length && !out.some((m) => m.isPrimary)) out[0].isPrimary = true;
  let primarySeen = false;
  for (const m of out) {
    if (m.isPrimary && primarySeen) m.isPrimary = false;
    if (m.isPrimary) primarySeen = true;
  }
  return out;
}

async function assertDepartmentsInOrg(client, organizationId, departmentIds) {
  if (!departmentIds.length) return;
  const count = await client.department.count({ where: { id: { in: departmentIds }, organizationId } });
  if (count !== new Set(departmentIds).size) throw forbidden("One or more departments are not in your organization.");
}

/** Replaces the departments a head is assigned to and keeps User.departmentId = primary. */
async function syncMemberships(tx, userId, memberships) {
  const ids = memberships.map((m) => m.departmentId);
  await tx.userDepartment.deleteMany({ where: { userId, departmentId: { notIn: ids } } });
  for (const m of memberships) {
    await tx.userDepartment.upsert({
      where: { userId_departmentId: { userId, departmentId: m.departmentId } },
      update: { isPrimary: m.isPrimary, isActive: true },
      create: { userId, departmentId: m.departmentId, isPrimary: m.isPrimary, isActive: true },
    });
  }
  const primary = memberships.find((m) => m.isPrimary)?.departmentId || null;
  await tx.user.update({ where: { id: userId }, data: { departmentId: primary } });
}

/** Tells a head about departments they were just put in charge of. */
async function notifyNewDepartments(tx, { boss, userId, departmentIds }) {
  if (!departmentIds.length) return;
  const depts = await tx.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } });
  for (const d of depts) {
    await notifyUsers(tx, {
      organizationId: boss.organizationId,
      userIds: [userId],
      departmentId: d.id,
      kind: "DEPARTMENT_HEAD",
      title: `You are now a head of ${d.name}`,
      body: "You run its day, hand the cash to the Boss and send the daily report.",
      href: `/d/${d.id}`,
    });
  }
}

export async function createOrganization(data) {
  return runAction("createOrganization", async () => {
    const user = await getCurrentUser();
    if (!user) throw unauthorized();
    if (user.role !== "ADMIN") throw forbidden("Only the Boss can create an organization.");
    if (user.organizationId) throw invalid("You already have an organization set up.");

    const name = String(data?.name || "").trim();
    if (!name) throw invalid("Organization name is required.");
    const departments = (Array.isArray(data?.departments) ? data.departments : [])
      .map((d) => (typeof d === "string" ? { name: d, domain: "RESTAURANT" } : d))
      .map((d) => ({ name: String(d?.name || "").trim(), domain: cleanDomain(d?.domain), description: d?.description || null }))
      .filter((d) => d.name);
    if (!departments.length) throw invalid("Add at least one department.");
    const employees = Array.isArray(data?.initialEmployees) ? data.initialEmployees : [];

    const org = await db.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: { name, slug: slugify(name), currency: data?.currency || "FCFA", timezone: data?.timezone || "Africa/Douala" },
      });
      await tx.user.update({ where: { id: user.id }, data: { organizationId: created.id } });

      const deptByName = {};
      for (const d of departments) {
        const dept = await createDepartmentRecord(tx, { user, organizationId: created.id, name: d.name, domain: d.domain, description: d.description });
        deptByName[d.name.toLowerCase()] = dept.id;
      }

      for (const emp of employees) {
        const email = String(emp?.email || "").toLowerCase().trim();
        const empName = String(emp?.name || "").trim();
        // An empty row is ignored; a row filled in part is an error (never a person silently left out).
        if (!email && !empName && !emp?.tempPassword) continue;
        if (!email || !empName || !emp?.tempPassword) throw invalid(`${empName || email || "A department head"}: name, e-mail and temporary password are required.`);
        if (!EMAIL_RE.test(email)) throw invalid(`Invalid email for ${empName}.`);
        const weak = validatePasswordStrength(emp.tempPassword, { email, name: empName });
        if (weak) throw invalid(`${empName}: ${weak}`);
        if (await tx.user.findUnique({ where: { email } })) throw invalid(`A user with email ${email} already exists.`);
        const names = Array.isArray(emp.departmentNames) && emp.departmentNames.length ? emp.departmentNames : [emp.departmentName];
        const deptIds = names.map((n) => deptByName[String(n || "").trim().toLowerCase()]).filter(Boolean);
        if (!deptIds.length) throw invalid(`${empName}: choose at least one department this person heads.`);
        const created2 = await tx.user.create({
          data: {
            name: empName,
            email,
            phone: emp.phone || null,
            title: cleanTitle(emp.title),
            passwordHash: await hashPassword(emp.tempPassword),
            role: "HEAD",
            organizationId: created.id,
            isActive: true,
            mustChangePassword: true,
          },
        });
        await syncMemberships(tx, created2.id, normalizeMemberships(deptIds.map((id, i) => ({ departmentId: id, isPrimary: i === 0 }))));
      }

      await recordAudit(tx, {
        user: { ...user, organizationId: created.id },
        organizationId: created.id,
        action: "ORGANIZATION_CREATED",
        entityType: "Organization",
        entityId: created.id,
        after: { name, departments: departments.map((d) => `${d.name} (${d.domain})`) },
      });
      return created;
    });

    // No revalidation here: the setup wizard shows its last step, then opens the app.
    
    return { organization: org };
  });
}


export async function createDepartment(data) {
  return runAction("createDepartment", async () => {
    const user = await requireAdmin();
    const name = String(data?.name || "").trim();
    if (!name) throw invalid("Department name is required.");
    const domain = cleanDomain(data?.domain);
    const department = await db.$transaction(async (tx) => {
      const clash = await tx.department.findFirst({ where: { organizationId: user.organizationId, name: { equals: name, mode: "insensitive" } } });
      if (clash) throw invalid(`A department called "${clash.name}" already exists.`);
      const created = await createDepartmentRecord(tx, {
        user,
        organizationId: user.organizationId,
        name,
        domain,
        description: String(data?.description || "").trim() || null,
        code: data?.code,
        cashierDiscountLimit: cleanDiscountLimit(data?.cashierDiscountLimit),
        openingCashFloat: data?.openingCashFloat,
      });
      await recordAudit(tx, { user, departmentId: created.id, action: "DEPARTMENT_CREATED", entityType: "Department", entityId: created.id, after: created });
      return created;
    });
    revalidatePath("/", "layout");
    return department;
  });
}

export async function updateDepartment(data) {
  return runAction("updateDepartment", async () => {
    const user = await requireAdmin();
    const existing = await db.department.findFirst({ where: { id: data?.departmentId || "-", organizationId: user.organizationId } });
    if (!existing) throw notFound("Department not found.");
    const name = String(data?.name ?? existing.name).trim();
    if (!name) throw invalid("Department name is required.");
    const update = { name, description: data?.description !== undefined ? String(data.description).trim() || null : existing.description };
    if (data?.domain && data.domain !== existing.domain) {
      const used = await Promise.all([
        db.transaction.count({ where: { departmentId: existing.id } }),
        db.menuItem.count({ where: { departmentId: existing.id } }),
        db.dailyReport.count({ where: { departmentId: existing.id } }),
        db.venue.count({ where: { departmentId: existing.id } }),
        db.venueBooking.count({ where: { departmentId: existing.id } }),
        db.venueLead.count({ where: { departmentId: existing.id } }),
      ]);
      if (used.some((n) => n > 0)) throw invalid("The department type cannot change once the department has records (dishes, bookings, a hall, reports …).");
      update.domain = cleanDomain(data.domain);
    }
    if (data?.code !== undefined && data.code !== existing.code) update.code = await cleanCode(db, user.organizationId, data.code, existing.id);
    const limit = cleanDiscountLimit(data?.cashierDiscountLimit);
    if (limit !== undefined) update.cashierDiscountLimit = limit;
    if (data?.openingCashFloat !== undefined && data.openingCashFloat !== "") {
      const f = Number(data.openingCashFloat);
      if (!Number.isInteger(f) || f < 0) throw invalid("The opening cash must be a whole number of francs.");
      update.openingCashFloat = f;
    }
    if (data?.isActive !== undefined) update.isActive = Boolean(data.isActive);

    const department = await db.$transaction(async (tx) => {
      const updated = await tx.department.update({ where: { id: existing.id }, data: update });
      await recordAudit(tx, { user, departmentId: existing.id, action: "DEPARTMENT_UPDATED", entityType: "Department", entityId: existing.id, before: existing, after: updated });
      return updated;
    });
    revalidatePath("/", "layout");
    return department;
  });
}


/** The Boss adds a department head: name, e-mail, title, departments, temporary password. */
export async function createEmployee(data) {
  return runAction("createEmployee", async () => {
    const user = await requireAdmin();
    const name = String(data?.name || "").trim();
    const email = String(data?.email || "").toLowerCase().trim();
    if (!name || !email || !data?.tempPassword) throw invalid("Name, email, and temporary password are required.");
    if (!EMAIL_RE.test(email)) throw invalid("Enter a valid email address.");
    const weak = validatePasswordStrength(data.tempPassword, { email, name });
    if (weak) throw invalid(weak);
    const memberships = normalizeMemberships(data?.memberships || data?.departmentIds || (data?.departmentId ? [data.departmentId] : []));
    if (!memberships.length) throw invalid("Choose at least one department for this department head.");
    await assertDepartmentsInOrg(db, user.organizationId, memberships.map((m) => m.departmentId));
    if (await db.user.findUnique({ where: { email } })) throw invalid("A user with this email already exists.");

    const employee = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          phone: String(data?.phone || "").trim() || null,
          title: cleanTitle(data?.title),
          passwordHash: await hashPassword(data.tempPassword),
          role: "HEAD",
          organizationId: user.organizationId,
          isActive: true,
          // The Boss knows this password: the person replaces it at the first sign-in.
          mustChangePassword: true,
        },
      });
      await syncMemberships(tx, created.id, memberships);
      await recordAudit(tx, { user, action: "EMPLOYEE_CREATED", entityType: "User", entityId: created.id, after: { name, email, title: created.title, departments: memberships.map((m) => m.departmentId) } });
      return created;
    });
    revalidatePath("/", "layout");
    return { id: employee.id, name: employee.name, email: employee.email, title: employee.title, role: employee.role };
  });
}

/**
 * The Boss edits a department head: name, phone, title, active flag and the departments they
 * head (one or several). The Boss's own account keeps the Boss role and cannot be deactivated.
 */
export async function updateEmployee(data) {
  return runAction("updateEmployee", async () => {
    const user = await requireAdmin();
    const employee = await db.user.findFirst({
      where: { id: data?.employeeId || "-", organizationId: user.organizationId },
      include: { memberships: true },
    });
    if (!employee) throw notFound("Person not found.");

    const update = {};
    if (data?.role !== undefined && data.role !== employee.role) throw invalid("Roles cannot be changed: the Boss created the business and everyone else is a department head.");
    if (data?.isActive !== undefined) {
      if (employee.id === user.id && !data.isActive) throw invalid("You cannot deactivate yourself.");
      update.isActive = Boolean(data.isActive);
    }
    if (data?.name !== undefined) update.name = String(data.name).trim() || employee.name;
    if (data?.phone !== undefined) update.phone = String(data.phone).trim() || null;
    if (data?.title !== undefined) update.title = cleanTitle(data.title);

    let memberships = null;
    const list = data?.memberships ?? data?.departmentIds;
    if (list !== undefined && employee.role !== "ADMIN") {
      memberships = normalizeMemberships(list);
      if (!memberships.length) throw invalid("A department head must head at least one department.");
      await assertDepartmentsInOrg(db, user.organizationId, memberships.map((m) => m.departmentId));
    }

    const updated = await db.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: employee.id }, data: update });
      if (memberships) {
        await syncMemberships(tx, employee.id, memberships);
        const before = new Set(employee.memberships.map((m) => m.departmentId));
        await notifyNewDepartments(tx, { boss: user, userId: employee.id, departmentIds: memberships.map((m) => m.departmentId).filter((id) => !before.has(id)) });
      }
      // Deactivated: signed out at once on every device.
      if (update.isActive === false) await revokeSessions(tx, employee.id);
      await recordAudit(tx, {
        user,
        action: "EMPLOYEE_UPDATED",
        entityType: "User",
        entityId: employee.id,
        before: { title: employee.title, isActive: employee.isActive, departments: employee.memberships.map((m) => m.departmentId) },
        after: { title: u.title, isActive: u.isActive, departments: memberships ? memberships.map((m) => m.departmentId) : undefined },
      });
      return u;
    });
    revalidatePath("/", "layout");
    return { id: updated.id, title: updated.title, isActive: updated.isActive };
  });
}

export async function resetEmployeePassword(data) {
  return runAction("resetEmployeePassword", async () => {
    const user = await requireAdmin();
    const employee = await db.user.findFirst({ where: { id: data?.employeeId || "-", organizationId: user.organizationId } });
    if (!employee) throw notFound("Employee not found.");
    if (employee.id === user.id) throw invalid("Change your own password from your profile.");
    const weak = validatePasswordStrength(data?.tempPassword, { email: employee.email, name: employee.name });
    if (weak) throw invalid(weak);
    await db.$transaction(async (tx) => {
      // Signed out everywhere, unlocked, and the new temporary password must be replaced at sign-in.
      await revokeSessions(tx, employee.id);
      await tx.user.update({
        where: { id: employee.id },
        data: { passwordHash: await hashPassword(data.tempPassword), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      });
      await recordAudit(tx, { user, action: "EMPLOYEE_PASSWORD_RESET", entityType: "User", entityId: employee.id });
    });
    return { id: employee.id };
  });
}

export async function updateOrganizationSettings(data) {
  return runAction("updateOrganizationSettings", async () => {
    const user = await requireAdmin();
    const name = String(data?.name || "").trim();
    if (!name) throw invalid("Organization name is required.");
    const timezone = String(data?.timezone || "Africa/Douala");
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      throw invalid("Unknown time zone.");
    }
    const org = await db.organization.update({ where: { id: user.organizationId }, data: { name, timezone } });
    revalidatePath("/", "layout");
    return org;
  });
}

/**
 * The Boss makes a person a head of a department (they keep their other departments), or
 * takes them off it (`remove: true`; a head keeps at least one department).
 */
export async function setDepartmentHead(data) {
  return runAction("setDepartmentHead", async () => {
    const boss = await requireAdmin();
    const dept = await db.department.findFirst({ where: { id: data?.departmentId || "-", organizationId: boss.organizationId } });
    if (!dept) throw notFound("Department not found.");
    const person = await db.user.findFirst({ where: { id: data?.userId || "-", organizationId: boss.organizationId }, include: { memberships: true } });
    if (!person) throw notFound("Person not found.");
    if (person.role === "ADMIN") throw invalid("The Boss oversees every department; choose a department head.");
    if (!person.isActive) throw invalid("This account is deactivated. Reactivate it first.");
    const current = person.memberships.map((m) => ({ departmentId: m.departmentId, isPrimary: m.isPrimary }));
    const next = data?.remove
      ? current.filter((m) => m.departmentId !== dept.id)
      : current.some((m) => m.departmentId === dept.id) ? current : [...current, { departmentId: dept.id, isPrimary: current.length === 0 }];
    if (!next.length) throw invalid(`${person.name} heads only ${dept.name}. Give them another department first, or deactivate the account.`);
    await db.$transaction(async (tx) => {
      await syncMemberships(tx, person.id, normalizeMemberships(next));
      if (!data?.remove) await notifyNewDepartments(tx, { boss, userId: person.id, departmentIds: current.some((m) => m.departmentId === dept.id) ? [] : [dept.id] });
      await recordAudit(tx, { user: boss, departmentId: dept.id, action: data?.remove ? "DEPARTMENT_HEAD_REMOVED" : "DEPARTMENT_HEAD_ADDED", entityType: "Department", entityId: dept.id, after: { userId: person.id } });
    });
    revalidatePath("/", "layout");
    return { departmentId: dept.id, userId: person.id, removed: Boolean(data?.remove) };
  });
}

/**
 * The Boss sets what a head may do in one department beyond the daily work (lib/permissions
 * GRANTS: approve expenses, void money records, change prices, export, archive).
 */
export async function setHeadRights(data) {
  return runAction("setHeadRights", async () => {
    const boss = await requireAdmin();
    const membership = await db.userDepartment.findFirst({
      where: { userId: data?.employeeId || "-", departmentId: data?.departmentId || "-", user: { organizationId: boss.organizationId }, department: { organizationId: boss.organizationId } },
      include: { user: { select: { id: true, name: true, role: true } }, department: { select: { id: true, name: true } } },
    });
    if (!membership) throw notFound("This person does not head this department.");
    if (membership.user.role === "ADMIN") throw invalid("The Boss always has every right.");
    const grants = cleanGrants(data?.grants);
    await db.$transaction(async (tx) => {
      await tx.userDepartment.update({ where: { id: membership.id }, data: { grants } });
      await recordAudit(tx, { user: boss, departmentId: membership.departmentId, action: "HEAD_RIGHTS_CHANGED", entityType: "User", entityId: membership.userId, before: { grants: membership.grants }, after: { grants } });
    });
    revalidatePath("/", "layout");
    return { employeeId: membership.userId, departmentId: membership.departmentId, grants };
  });
}

