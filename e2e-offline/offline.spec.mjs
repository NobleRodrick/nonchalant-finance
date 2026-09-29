import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";

/**
 * A department head keeps working while the connection is gone, then everything reaches the
 * server when it comes back. The connection is cut for real: the server process is stopped
 * (the browser still believes it is online, like a Wi-Fi without internet), then started again.
 */
test.describe.configure({ mode: "serial" });

const PORT = Number(process.env.OFFLINE_E2E_PORT || 3200);
const tag = Date.now().toString(36);
const boss = { email: `off-boss-${tag}@e2e.local`, password: "Boss12345" };
const head = { email: `off-head-${tag}@e2e.local`, password: "" };
let server = null;
let deptId = "";

async function startServer() {
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      DIRECT_URL: process.env.TEST_DATABASE_URL,
      JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234567",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The server did not start.");
}

async function stopServer() {
  if (!server) return;
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    // already stopped
  }
  server = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(`http://localhost:${PORT}/api/health`);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function toast(page, text) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

async function login(page, email, password) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Waits until the service worker controls the page (pages opened from now on are kept). */
async function swReady(page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30000 });
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

test("offline: sell, record money, undo; the pages open without a connection; all of it syncs when it is back", async ({ page }) => {
  // ── Online: set up the business, the head adds a dish and opens his pages ──
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Offline Owner");
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Offline Business ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Department 1");
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add a department head" }).click();
  await page.locator("#p-name-0").fill("Head Offline");
  await page.locator("#p-email-0").fill(head.email);
  await page.locator("#p-title-0").fill("Manager");
  head.password = await page.locator("#p-pass-0").inputValue();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);

  await login(page, head.email, head.password);
  await page.waitForURL(/\/d\//);
  deptId = page.url().split("/d/")[1].split(/[/?]/)[0];
  await swReady(page);
  await page.goto(`/d/${deptId}/menu-stock`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add dish" }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Dish name").fill("Rice");
  await d.getByLabel("Unit price (FCFA)").fill("1000");
  await d.getByLabel("Plates available now").fill("10");
  await d.getByRole("button", { name: "Add dish" }).click();
  await toast(page, '"Rice" added to the menu.');
  await expect(page.getByTestId("dish-row-Rice")).toContainText("10 000");
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "ok");
  // Open the pages once (they are also saved in the background): Sell, Money, Menu & Stock.
  for (const p of ["sell", "money", "menu-stock"]) {
    await page.goto(`/d/${deptId}/${p}`);
    await page.waitForLoadState("networkidle");
  }

  // ── The connection is gone ──
  await stopServer();
  await page.goto(`/d/${deptId}/sell`); // served by the service worker
  await expect(page.getByRole("heading", { name: "Sell" })).toBeVisible();
  await expect(page.getByTestId("offline-banner")).toBeVisible();

  // Sell 3 plates: saved on this computer, plates leave the stock at once.
  const tile = page.getByRole("button", { name: "Add Rice" });
  await expect(tile).toContainText("10 left");
  await tile.click();
  await tile.click();
  await tile.click();
  await page.getByRole("button", { name: /Record sale/ }).click();
  await toast(page, "Sale saved on this computer");
  await expect(page.getByTestId("receipt-pending")).toBeVisible();
  await page.getByRole("button", { name: "New sale" }).click();
  await expect(tile).toContainText("7 left");
  await expect(page.locator("tr[data-pending]")).toHaveCount(1);

  // A second sale, then undo it (offline too): its plate comes back.
  await tile.click();
  await page.getByRole("button", { name: /Record sale/ }).click();
  await page.getByRole("button", { name: "Undo this sale" }).click();
  const undo = page.getByRole("dialog").filter({ hasText: "Undo sale" });
  await undo.getByRole("button", { name: "Entered by mistake" }).click();
  await undo.getByRole("button", { name: "Undo sale" }).click();
  await toast(page, "Undo sale saved on this computer");
  await expect(tile).toContainText("7 left");
  await expect(page.getByTestId("sync-status")).toContainText("Offline · 3 waiting");

  // Reloading the page keeps everything (it is stored in the browser's database).
  await page.reload();
  await expect(page.getByTestId("sync-status")).toContainText("3 waiting");
  await expect(page.getByRole("button", { name: "Add Rice" })).toContainText("7 left");

  // Money: record an expense offline; it is in the day's figures at once.
  await page.goto(`/d/${deptId}/money`);
  await expect(page.getByRole("heading", { name: "Money in / out" })).toBeVisible();
  await page.getByRole("button", { name: "Record EXPENSE" }).click();
  const m = page.getByRole("dialog");
  await m.getByLabel("Amount (FCFA)").fill("1500");
  // A photo of the receipt, kept on the computer until the record is sent.
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c489", "hex");
  await m.getByTestId("proof-input").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
  await expect(m).toContainText("receipt.png");
  await m.getByRole("button", { name: /^Record/ }).click();
  await toast(page, "saved on this computer");
  await expect(page.locator("tr[data-pending]")).toHaveCount(1);
  await expect(page.getByText("Result of the day", { exact: true }).locator("xpath=../..")).toContainText("1 500"); // 3 000 of sales − 1 500

  // Menu & Stock opened from the menu: the plates sold offline are there.
  await page.getByRole("link", { name: "Menu & Stock" }).first().click();
  const row = page.getByTestId("dish-row-Rice");
  await expect(row).toContainText("not sent yet");
  await expect(row).toContainText("7 000");

  // A page never opened on this computer: the offline page explains it.
  await page.goto(`/d/${deptId}/history?from=2020-01-01`);
  await expect(page.getByText("This page is not saved on this computer yet")).toBeVisible();

  // ── The connection is back: everything is sent, in order, once ──
  await startServer();
  await page.goto(`/d/${deptId}/menu-stock`);
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "ok", { timeout: 90_000 });
  await page.reload();
  await expect(page.getByTestId("dish-row-Rice")).toContainText("7 000");
  await expect(page.getByTestId("dish-row-Rice")).not.toContainText("not sent yet");
  await page.goto(`/d/${deptId}/sell`);
  await expect(page.locator("tr", { hasText: "S-0001" })).toContainText("3 × Rice");
  await expect(page.locator("tr", { hasText: "S-0002" })).toContainText("Undone");
  await page.goto(`/d/${deptId}/money`);
  await expect(page.locator("tr", { hasText: "E-0001" })).toContainText("1 500");
  // The receipt photo was uploaded and linked to the expense.
  const pg = (await import("pg")).default;
  const sql = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await sql.connect();
  const { rows } = await sql.query(`SELECT a."fileName" FROM attachments a JOIN transactions t ON t.id = a."entityId" WHERE t."departmentId" = $1 AND t."referenceNo" = 'E-0001'`, [deptId]);
  await sql.end();
  expect(rows.map((r) => r.fileName)).toEqual(["receipt.png"]);
  await page.getByTestId("sync-status").click();
  await expect(page.getByRole("dialog")).toContainText("Sent recently");
});

test("a record the server refuses when it arrives needs attention: the reason is shown, it can be discarded", async ({ page }) => {
  const pg = (await import("pg")).default;
  const sql = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await sql.connect();
  try {
    await login(page, head.email, head.password);
    await page.waitForURL(/\/d\//);
    await swReady(page);
    await page.goto(`/d/${deptId}/sell`);
    await page.waitForLoadState("networkidle");

    await stopServer();
    const tile = page.getByRole("button", { name: "Add Rice" });
    await tile.click();
    await tile.click();
    await page.getByRole("button", { name: /Record sale/ }).click();
    await toast(page, "Sale saved on this computer");
    await page.getByRole("button", { name: "New sale" }).click();
    // Meanwhile the dish was taken off the menu on the server (another device, the database …).
    await sql.query(`UPDATE menu_items SET "isActive" = false, "archivedAt" = now() WHERE "departmentId" = $1 AND name = 'Rice'`, [deptId]);

    await startServer();
    await page.goto(`/d/${deptId}/sell`);
    const status = page.getByTestId("sync-status");
    await expect(status).toContainText("1 needs attention", { timeout: 90_000 });
    await status.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toContainText("Needs attention");
    await expect(panel).toContainText('"Rice" was removed from the menu');
    await panel.getByRole("button", { name: /Discard Sale/ }).click();
    await page.getByRole("dialog").filter({ hasText: "Discard this record?" }).getByRole("button", { name: "Discard" }).click();
    await page.keyboard.press("Escape");
    await expect(status).toHaveAttribute("data-state", "ok");
  } finally {
    await sql.query(`UPDATE menu_items SET "isActive" = true, "archivedAt" = null WHERE "departmentId" = $1 AND name = 'Rice'`, [deptId]).catch(() => {});
    await sql.end();
  }
});

test("the Boss confirms a handover while offline; it is sent when the connection is back", async ({ page }) => {
  // The head hands cash over (online).
  await login(page, head.email, head.password);
  await page.waitForURL(/\/d\//);
  await page.goto(`/d/${deptId}/cash-handover`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Hand over cash" }).first().click();
  const h = page.getByRole("dialog");
  await h.getByLabel("Amount (FCFA)").fill("1000");
  await h.getByRole("button", { name: /Hand over/ }).click();
  await toast(page, "The Boss will confirm it");

  // The Boss opens Cash received, loses the connection, confirms.
  await login(page, boss.email, boss.password);
  await page.waitForURL(/\/boss/);
  await swReady(page);
  await page.goto("/boss/cash");
  await page.waitForLoadState("networkidle");
  await stopServer();
  await page.getByRole("button", { name: "I received it" }).first().click();
  await toast(page, "saved on this computer");
  await expect(page.getByText("Confirmed on this computer, not sent yet")).toBeVisible();

  await startServer();
  await page.goto("/boss/cash");
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "ok", { timeout: 90_000 });
  await page.reload();
  await expect(page.getByText("Nothing to confirm")).toBeVisible();
});
