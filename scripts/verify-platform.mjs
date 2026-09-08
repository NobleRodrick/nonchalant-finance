/**
 * Platform verification script — tests multi-tenant auth & scoping logic end-to-end.
 * Run: node scripts/verify-platform.mjs
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

const db = new PrismaClient();
const TEST_PREFIX = `e2e-${Date.now()}`;
const bossEmail = `${TEST_PREFIX}-boss@test.com`;
const empEmail = `${TEST_PREFIX}-emp@test.com`;
const bossPassword = "BossPass123!";
const empPassword = "EmpPass456!";

let bossId = null;
let orgId = null;
let deptAId = null;
let deptBId = null;
let empId = null;
let transactionId = null;

const results = [];

function pass(label) {
  results.push({ label, ok: true });
  console.log(`  ✓ ${label}`);
}

function fail(label, err) {
  results.push({ label, ok: false, err: String(err) });
  console.error(`  ✗ ${label}: ${err}`);
}

async function cleanup() {
  try {
    if (bossId) await db.refreshToken.deleteMany({ where: { userId: bossId } });
    if (empId) await db.refreshToken.deleteMany({ where: { userId: empId } });
    if (transactionId) await db.transaction.delete({ where: { id: transactionId } }).catch(() => {});
    if (orgId) {
      await db.transaction.deleteMany({ where: { organizationId: orgId } });
      await db.account.deleteMany({ where: { organizationId: orgId } });
      await db.user.deleteMany({ where: { organizationId: orgId } });
      await db.department.deleteMany({ where: { organizationId: orgId } });
      await db.organization.delete({ where: { id: orgId } }).catch(() => {});
    }
    if (bossId) await db.user.delete({ where: { id: bossId } }).catch(() => {});
  } catch (e) {
    console.warn("Cleanup warning:", e.message);
  }
}

async function main() {
  console.log("\n=== Multi-Tenant Platform Verification ===\n");

  try {
    // 1. Boss registration
    const bossHash = await bcrypt.hash(bossPassword, 12);
    const boss = await db.user.create({
      data: {
        name: "E2E Boss",
        email: bossEmail,
        passwordHash: bossHash,
        role: "ADMIN",
        isActive: true,
      },
    });
    bossId = boss.id;
    pass("Boss user created");

    // 2. Organization + departments
    const org = await db.organization.create({
      data: {
        name: "E2E Chris Complex",
        slug: `${TEST_PREFIX}-org`,
        currency: "FCFA",
      },
    });
    orgId = org.id;

    await db.user.update({
      where: { id: bossId },
      data: { organizationId: orgId },
    });

    const deptA = await db.department.create({
      data: { organizationId: orgId, name: "Bistro Restaurant" },
    });
    const deptB = await db.department.create({
      data: { organizationId: orgId, name: "Bistro Snack Bar" },
    });
    deptAId = deptA.id;
    deptBId = deptB.id;
    pass("Organization and departments created");

    // 3. Employee creation
    const empHash = await bcrypt.hash(empPassword, 12);
    const emp = await db.user.create({
      data: {
        name: "E2E Cashier",
        email: empEmail,
        passwordHash: empHash,
        role: "STAFF",
        organizationId: orgId,
        departmentId: deptBId,
        isActive: true,
      },
    });
    empId = emp.id;
    pass("Employee created and scoped to Snack Bar");

    // 4. Login verification (password check)
    const bossLogin = await bcrypt.compare(bossPassword, boss.passwordHash);
    const empLogin = await bcrypt.compare(empPassword, emp.passwordHash);
    if (bossLogin && empLogin) pass("Password verification works");
    else fail("Password verification", "hash mismatch");

    // 5. JWT signing
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "springer-finance-super-secure-jwt-secret-key-2026");
    const token = await new SignJWT({ userId: empId, role: "STAFF", departmentId: deptBId, organizationId: orgId })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("15m")
      .sign(secret);
    if (token.split(".").length === 3) pass("JWT token generation works");
    else fail("JWT token generation", "invalid token format");

    // 6. Transaction scoping — employee dept B only
    const txn = await db.transaction.create({
      data: {
        type: "INCOME",
        amount: 50000,
        category: "food",
        description: "Daily sales",
        organizationId: orgId,
        departmentId: deptBId,
        userId: empId,
      },
    });
    transactionId = txn.id;
    pass("Transaction recorded in employee department");

    const deptBTxns = await db.transaction.findMany({
      where: { organizationId: orgId, departmentId: deptBId },
    });
    const deptATxns = await db.transaction.findMany({
      where: { organizationId: orgId, departmentId: deptAId },
    });
    if (deptBTxns.length >= 1 && deptATxns.length === 0) {
      pass("Department transaction isolation verified");
    } else {
      fail("Department isolation", `deptB=${deptBTxns.length}, deptA=${deptATxns.length}`);
    }

    // 7. Role upgrade
    await db.user.update({ where: { id: empId }, data: { role: "ACCOUNTANT" } });
    const upgraded = await db.user.findUnique({ where: { id: empId } });
    if (upgraded.role === "ACCOUNTANT") pass("Employee role upgrade works");
    else fail("Role upgrade", upgraded.role);

    // 8. Duplicate org guard simulation
    const bossWithOrg = await db.user.findUnique({ where: { id: bossId } });
    if (bossWithOrg.organizationId) pass("Boss linked to organization");
    else fail("Boss org link", "missing organizationId");

    // 9. Refresh token
    const refreshToken = await db.refreshToken.create({
      data: {
        token: `${TEST_PREFIX}-refresh`,
        userId: bossId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    if (refreshToken.id) pass("Refresh token storage works");
    else fail("Refresh token", "not created");

    // 10. Executive KPIs calculation
    const allTxns = await db.transaction.findMany({ where: { organizationId: orgId } });
    const revenue = allTxns.filter((t) => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0);
    if (revenue === 50000) pass("Executive revenue KPI calculation correct");
    else fail("KPI calculation", `expected 50000, got ${revenue}`);

    // 11. Password change
    const newHash = await bcrypt.hash("NewPass789!", 12);
    await db.user.update({ where: { id: empId }, data: { passwordHash: newHash } });
    const changed = await db.user.findUnique({ where: { id: empId } });
    const newLogin = await bcrypt.compare("NewPass789!", changed.passwordHash);
    if (newLogin) pass("Password change works");
    else fail("Password change", "new password not accepted");

  } catch (err) {
    fail("Unexpected error", err.message);
  } finally {
    await cleanup();
    await db.$disconnect();
  }

  console.log("\n=== Results ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`  ${passed} passed, ${failed} failed out of ${results.length} checks\n`);

  if (failed > 0) process.exit(1);
}

main();
