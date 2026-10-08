/**
 * Isolation probe (npm run test:isolation): after every write operation the integration tests make
 * successfully, the same operation is replayed by an intruder with the ids of the records it used:
 *
 *  - "other business": the Boss of another organization, in his own department of the same type;
 *  - "other department": someone of the same business working in another department of the same
 *    type (the head of that department, or the Boss where he runs it himself).
 *
 * Either replay must be refused. A replay that succeeds is a leak, written to
 * $ISOLATION_OUT (one JSON line per probe) and reported by scripts/test-isolation.mjs (npm run test:isolation).
 */
import fs from "node:fs";
import { db } from "@/lib/prisma";
import { getOperation } from "@/lib/operations/registry";
import { selfRunDepartmentIds } from "@/lib/auth";
import { DOMAIN_LIST } from "@/lib/domains/registry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUT = process.env.ISOLATION_OUT || "isolation-probe.jsonl";

const USER_INCLUDE = {
  organization: true,
  department: true,
  memberships: { where: { isActive: true, department: { isActive: true } }, include: { department: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
};

function write(line) {
  fs.appendFileSync(OUT, `${JSON.stringify(line)}\n`);
}

/** Paths of the record ids inside an operation's input (except the department itself). */
function idPaths(value, path = "", out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => idPaths(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) idPaths(v, path ? `${path}.${k}` : k, out);
  else if (typeof value === "string" && UUID.test(value) && path !== "departmentId") out.push(path);
  return out;
}

async function loadUser(id, activeDepartmentId) {
  const user = await db.user.findUnique({ where: { id }, include: USER_INCLUDE });
  user.selfRunDepartmentIds = user.role === "ADMIN" ? await selfRunDepartmentIds(user.organizationId) : [];
  user.activeDepartmentId = activeDepartmentId || null;
  return user;
}

let intruder = null;
/** Another organization with one department of every type, run by its Boss himself. */
async function intruderOrganization() {
  if (intruder && (await db.organization.findUnique({ where: { id: intruder.orgId }, select: { id: true } }))) return intruder;
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const org = await db.organization.create({ data: { name: `Intruder ${tag}`, slug: `intruder-${tag}` } });
  const boss = await db.user.create({ data: { organizationId: org.id, email: `intruder-${tag}@test.local`, name: "Intruder", role: "ADMIN" } });
  const departments = {};
  for (const d of DOMAIN_LIST) {
    departments[d.key] = await db.department.create({ data: { organizationId: org.id, name: `Intruder ${d.key}`, domain: d.key } });
  }
  intruder = { orgId: org.id, bossId: boss.id, departments };
  return intruder;
}

/** Someone of the same business who works in another department of the same type, or null. */
async function siblingActor(victimDept, organizationId) {
  const siblings = await db.department.findMany({ where: { organizationId, domain: victimDept.domain, isActive: true, id: { not: victimDept.id } }, orderBy: { createdAt: "asc" } });
  for (const s of siblings) {
    const head = await db.userDepartment.findFirst({
      where: { departmentId: s.id, isActive: true, user: { isActive: true, role: "HEAD", mustChangePassword: false }, NOT: { user: { memberships: { some: { departmentId: victimDept.id, isActive: true } } } } },
      select: { userId: true },
    });
    if (head) return { department: s, user: await loadUser(head.userId, s.id) };
    const self = await selfRunDepartmentIds(organizationId);
    if (self.includes(s.id)) {
      const boss = await db.user.findFirst({ where: { organizationId, role: "ADMIN", isActive: true }, select: { id: true } });
      if (boss) return { department: s, user: await loadUser(boss.id, s.id) };
    }
  }
  return null;
}

async function attempt(actual, attack, kind, user, input, ids) {
  try {
    await actual.executeOperation({ user, kind, input, key: null });
    write({ attack, kind, outcome: "ACCEPTED", ids });
  } catch (e) {
    write({ attack, kind, outcome: "refused", code: e?.code || e?.name || "ERROR", message: String(e?.message || e).slice(0, 160), ids });
  }
}

/** Replays a successful operation as the two intruders. */
export async function probeAfter(actual, { user, kind, input }, out) {
  const def = getOperation(kind);
  if (!def || !user?.organizationId) return;
  const resolved = await actual.resolveReferences(input || {}, { organizationId: user.organizationId });
  const ids = idPaths(resolved);
  if (!ids.length) {
    write({ attack: "none", kind, outcome: "no-record-ids" });
    return;
  }
  const victimDeptId = out?.departmentId || resolved.departmentId || null;
  const victimDept = victimDeptId ? await db.department.findUnique({ where: { id: victimDeptId } }) : null;

  // 1. Another business.
  const intr = await intruderOrganization();
  const intrDept = victimDept ? intr.departments[victimDept.domain] : null;
  const intrUser = await loadUser(intr.bossId, intrDept?.id);
  const foreignInput = resolved.departmentId && intrDept ? { ...resolved, departmentId: intrDept.id } : resolved;
  await attempt(actual, "other-business", kind, intrUser, foreignInput, ids);

  // 2. Another department of the same business (only operations addressed to a department).
  if (victimDept && resolved.departmentId && def.scope !== "organization") {
    const sib = await siblingActor(victimDept, user.organizationId);
    if (sib) {
      await attempt(actual, "other-department", kind, sib.user, { ...resolved, departmentId: sib.department.id }, ids);
    } else {
      // A department of the same type for the time of the attempt, run by the Boss himself.
      const temp = await db.department.create({ data: { organizationId: user.organizationId, name: `Probe ${victimDept.domain} ${Date.now()}`, domain: victimDept.domain } });
      try {
        const boss = await db.user.findFirst({ where: { organizationId: user.organizationId, role: "ADMIN", isActive: true }, select: { id: true } });
        if (boss) await attempt(actual, "other-department", kind, await loadUser(boss.id, temp.id), { ...resolved, departmentId: temp.id }, ids);
      } finally {
        await db.department.delete({ where: { id: temp.id } }).catch((e) => write({ attack: "other-department", kind, outcome: "probe-error", message: `temporary department kept: ${String(e.message).slice(0, 120)}` }));
      }
    }
  }
}
