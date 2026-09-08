/**
 * HTTP E2E tests against the running Next.js dev server.
 * Run: npm run dev (in one terminal) then npm run test:e2e
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const db = new PrismaClient();
const TEST_PREFIX = `http-e2e-${Date.now()}`;

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "springer-finance-super-secure-jwt-secret-key-2026"
);

const bossEmail = `${TEST_PREFIX}-boss@test.com`;
const empEmail = `${TEST_PREFIX}-emp@test.com`;
const password = "TestPass123!";

let bossId, empId, orgId, deptId;
const results = [];

function pass(label) {
  results.push({ label, ok: true });
  console.log(`  ✓ ${label}`);
}
function fail(label, err) {
  results.push({ label, ok: false, err: String(err) });
  console.error(`  ✗ ${label}: ${err}`);
}

async function signAccessToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(JWT_SECRET);
}

async function fetchWithAuth(path, userPayload) {
  const token = await signAccessToken(userPayload);
  const cookie = `sf_access_token=${token}`;
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  return res;
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(BASE, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function setupTestData() {
  const hash = await bcrypt.hash(password, 10);

  const boss = await db.user.create({
    data: { name: "HTTP Boss", email: bossEmail, passwordHash: hash, role: "ADMIN", isActive: true },
  });
  bossId = boss.id;

  const org = await db.organization.create({
    data: { name: "HTTP Test Org", slug: `${TEST_PREFIX}-slug`, currency: "FCFA" },
  });
  orgId = org.id;

  await db.user.update({ where: { id: bossId }, data: { organizationId: orgId } });

  const dept = await db.department.create({
    data: { organizationId: orgId, name: "Test Snack Bar" },
  });
  deptId = dept.id;

  const emp = await db.user.create({
    data: {
      name: "HTTP Employee",
      email: empEmail,
      passwordHash: hash,
      role: "STAFF",
      organizationId: orgId,
      departmentId: deptId,
      isActive: true,
    },
  });
  empId = emp.id;

  await db.transaction.create({
    data: {
      type: "INCOME",
      amount: 25000,
      category: "food",
      description: "Test sale",
      organizationId: orgId,
      departmentId: deptId,
      userId: empId,
    },
  });
}

async function cleanup() {
  try {
    if (orgId) {
      await db.transaction.deleteMany({ where: { organizationId: orgId } });
      await db.refreshToken.deleteMany({ where: { userId: { in: [bossId, empId].filter(Boolean) } } });
      await db.user.deleteMany({ where: { organizationId: orgId } });
      await db.department.deleteMany({ where: { organizationId: orgId } });
      await db.organization.delete({ where: { id: orgId } }).catch(() => {});
    }
    if (bossId) await db.user.delete({ where: { id: bossId } }).catch(() => {});
  } catch (e) {
    console.warn("Cleanup:", e.message);
  }
}

async function main() {
  console.log(`\n=== HTTP E2E Tests (${BASE}) ===\n`);

  const ready = await waitForServer();
  if (!ready) {
    fail("Dev server reachable", `Could not connect to ${BASE}. Start with: npm run dev`);
    await db.$disconnect();
    process.exit(1);
  }
  pass("Dev server is running");

  try {
    // Public pages
    const loginPage = await fetch(`${BASE}/login`);
    if (loginPage.status === 200) pass("GET /login returns 200");
    else fail("GET /login", `status ${loginPage.status}`);

    const registerPage = await fetch(`${BASE}/register`);
    if (registerPage.status === 200) pass("GET /register returns 200");
    else fail("GET /register", `status ${registerPage.status}`);

    // Middleware: unauthenticated → redirect to login
    const dashUnauth = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
    if (dashUnauth.status === 307 || dashUnauth.status === 302) {
      const loc = dashUnauth.headers.get("location") || "";
      if (loc.includes("/login")) pass("Unauthenticated /dashboard redirects to /login");
      else fail("Unauthenticated redirect", `location=${loc}`);
    } else fail("Unauthenticated /dashboard", `expected redirect, got ${dashUnauth.status}`);

    const orgUnauth = await fetch(`${BASE}/organization/employees`, { redirect: "manual" });
    if (orgUnauth.status === 307 || orgUnauth.status === 302) {
      pass("Unauthenticated /organization/employees redirects");
    } else fail("Unauthenticated org page", `status ${orgUnauth.status}`);

    // Legacy Clerk routes redirect
    const signIn = await fetch(`${BASE}/sign-in`, { redirect: "manual" });
    if (signIn.status === 307 && (signIn.headers.get("location") || "").includes("/login")) {
      pass("Legacy /sign-in redirects to /login");
    } else fail("Legacy /sign-in redirect", `status ${signIn.status}`);

    await setupTestData();
    pass("Test data seeded in database");

    const bossPayload = {
      userId: bossId,
      email: bossEmail,
      role: "ADMIN",
      organizationId: orgId,
      departmentId: null,
    };

    const empPayload = {
      userId: empId,
      email: empEmail,
      role: "STAFF",
      organizationId: orgId,
      departmentId: deptId,
    };

    // Boss authenticated access
    const bossDash = await fetchWithAuth("/dashboard", bossPayload);
    if (bossDash.status === 200) {
      const html = await bossDash.text();
      if (html.includes("HTTP Test Org") || html.includes("Executive") || html.includes("Revenue")) {
        pass("Boss can access /dashboard with org data");
      } else {
        pass("Boss can access /dashboard (200)");
      }
    } else fail("Boss /dashboard", `status ${bossDash.status}`);

    const bossEmployees = await fetchWithAuth("/organization/employees", bossPayload);
    if (bossEmployees.status === 200) {
      const html = await bossEmployees.text();
      if (html.includes("Staff") || html.includes("HTTP Employee")) {
        pass("Boss can access /organization/employees");
      } else pass("Boss /organization/employees returns 200");
    } else fail("Boss /organization/employees", `status ${bossEmployees.status}`);

    const bossReports = await fetchWithAuth("/reports", bossPayload);
    if (bossReports.status === 200) pass("Boss can access /reports");
    else fail("Boss /reports", `status ${bossReports.status}`);

    const bossDepts = await fetchWithAuth("/organization/departments", bossPayload);
    if (bossDepts.status === 200) pass("Boss can access /organization/departments");
    else fail("Boss /organization/departments", `status ${bossDepts.status}`);

    const bossProfile = await fetchWithAuth("/profile", bossPayload);
    if (bossProfile.status === 200) pass("Boss can access /profile");
    else fail("Boss /profile", `status ${bossProfile.status}`);

    const bossTxn = await fetchWithAuth("/transaction/create", bossPayload);
    if (bossTxn.status === 200) pass("Boss can access /transaction/create");
    else fail("Boss /transaction/create", `status ${bossTxn.status}`);

    // Employee authenticated access
    const empDash = await fetchWithAuth("/dashboard", empPayload);
    if (empDash.status === 200) {
      const html = await empDash.text();
      if (html.includes("Test Snack Bar") || html.includes("Snack Bar") || html.includes("Department")) {
        pass("Employee sees department-scoped dashboard");
      } else pass("Employee can access /dashboard (200)");
    } else fail("Employee /dashboard", `status ${empDash.status}`);

    const empReports = await fetchWithAuth("/reports", empPayload);
    if (empReports.status === 200) pass("Employee can access /reports");
    else fail("Employee /reports", `status ${empReports.status}`);

    // Employee blocked from admin org pages
    const empOrg = await fetchWithAuth("/organization/employees", empPayload);
    if (empOrg.status === 307 || empOrg.status === 302) {
      const loc = empOrg.headers.get("location") || "";
      if (loc.includes("/dashboard")) pass("Employee blocked from /organization/employees → dashboard");
      else pass("Employee blocked from /organization/employees (redirect)");
    } else fail("Employee org access", `expected redirect, got ${empOrg.status}`);

    const empOnboarding = await fetchWithAuth("/onboarding", empPayload);
    if (empOnboarding.status === 307 || empOnboarding.status === 302) {
      pass("Employee blocked from /onboarding");
    } else fail("Employee /onboarding", `expected redirect, got ${empOnboarding.status}`);

    // Boss blocked from onboarding when org exists
    const bossOnboarding = await fetchWithAuth("/onboarding", bossPayload);
    if (bossOnboarding.status === 307 || bossOnboarding.status === 302) {
      pass("Boss with org is redirected away from /onboarding");
    } else fail("Boss /onboarding", `expected redirect, got ${bossOnboarding.status}`);

    // Authenticated user redirected away from login
    const bossLoginRedirect = await fetchWithAuth("/login", bossPayload);
    if (bossLoginRedirect.status === 307 || bossLoginRedirect.status === 302) {
      pass("Authenticated user redirected away from /login");
    } else fail("Authenticated /login redirect", `status ${bossLoginRedirect.status}`);

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
