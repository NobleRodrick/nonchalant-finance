import { expect, test } from "@playwright/test";
import { login } from "./support/login.mjs";

/**
 * Rentals – Place Étoilée & Main Building, through the real interface
 * (docs/PROPERTY_RENTAL_PLAN.md): the Boss creates the department with its manager; the manager
 * adds offices with their charges, lets A12 to XYZ Company, records a partial payment and the
 * deposit, bills electricity from a meter reading, and finds the debt in the arrears, the
 * search, the dashboard, the reports and the receipt.
 */
test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const boss = { name: "Rentals Owner", email: `rowner-${tag}@e2e.local`, password: "Plantain-2468" };
const head = { name: "Rentals Manager", email: `rmanager-${tag}@e2e.local`, password: "" };
let deptId = "";
let contractUrl = "";
const month = new Date(Date.now() + 3600000).toISOString().slice(0, 7);

// Only what is on screen: a production page can keep a hidden copy of a streamed section
// (React's <div hidden id="S:…">) outside <main>; role queries skip it, test ids and labels do not.
async function toast(page, text) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 30_000 });
}

test("the Boss creates Rentals with its manager; the two buildings are ready", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(boss.name);
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Rentals Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Rentals");
  await page.getByRole("radio", { name: "Office & property rental" }).click();
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add a department head" }).click();
  await page.locator("#p-name-0").fill(head.name);
  await page.locator("#p-email-0").fill(head.email);
  await page.locator("#p-title-0").fill("Manager");
  head.password = await page.locator("#p-pass-0").inputValue();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  const rentals = nav.getByTestId("dept-nav-Rentals");
  for (const name of ["Dashboard", "Offices", "Tenants", "Contracts", "Arrears"]) await expect(rentals.getByRole("link", { name, exact: true })).toBeVisible();
  deptId = (await rentals.getByRole("link", { name: "Dashboard" }).getAttribute("href")).split("/")[2];
});

test("the manager adds offices in both buildings, A12 with an electricity meter", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/offices`);
  for (const [building, name, rent, deposit, meter] of [["Place Étoilée", "A12", "150000", "300000", true], ["Main Building", "Office 01", "100000", "200000", false]]) {
    await page.getByRole("button", { name: "Add an office" }).click({ timeout: 60_000 });
    const d = page.getByRole("dialog");
    await d.getByLabel("Building").selectOption({ label: building });
    await d.getByLabel("Office name / number").fill(name);
    await d.getByLabel("Monthly rent (FCFA)").fill(rent);
    await d.getByLabel("Deposit / caution required (FCFA)").fill(deposit);
    if (meter) {
      await d.getByRole("button", { name: "Add a charge" }).click();
      await d.locator("#ch-k-0").selectOption("ELECTRICITY");
      await d.locator("#ch-m-0").selectOption("METER");
      await d.locator("#ch-r-0").fill("100");
      await d.locator("#ch-lr-0").fill("1000");
    }
    await d.getByRole("button", { name: "Add the office" }).click();
    await toast(page, `Office ${name} added`);
  }
  await expect(page.locator("main").getByTestId("building-Place Étoilée")).toContainText("A12");
  await expect(page.locator("main").getByTestId("office-A12")).toContainText("Available");
  await expect(page.locator("main").getByTestId("office-counts")).toContainText("2");
});

test("A12 is let to XYZ Company from the 1st; it shows occupied and cannot be let twice", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/contracts/new`);
  await page.locator("#ct-u:visible").selectOption({ label: "A12 · Place Étoilée · Available" });
  await page.locator("main").getByLabel("Full name / company name").fill("XYZ Company");
  await page.locator("main").getByLabel("Phone").fill("677000111");
  await page.locator("main").getByLabel("Identification").fill("RC/YAO/2020/B/123");
  await page.locator("main").getByLabel("Contract starts (rent from)").fill(`${month}-01`);
  await page.locator("main").getByLabel("Rent due on day").fill("1");
  await page.locator("main").getByLabel("Move-in date").fill(`${month}-01`);
  await page.getByRole("button", { name: "Save: the tenant moves in" }).click();
  await toast(page, "A12 · Place Étoilée let to XYZ Company");
  await page.waitForURL(/\/contracts\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  contractUrl = page.url();
  await expect(page.locator("main").getByTestId("contract-kpis")).toContainText("150 000");
  await page.goto(`/d/${deptId}/offices`);
  await expect(page.locator("main").getByTestId("office-A12")).toContainText("Occupied");
  await expect(page.locator("main").getByTestId("office-A12")).toContainText("XYZ Company");
  await page.goto(`/d/${deptId}/contracts/new`);
  await expect(page.locator("#ct-u:visible")).not.toContainText("A12");
});

test("a partial payment pays this month's rent, the deposit is kept apart, electricity is billed from the meter", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, head.email, head.password);
  await page.goto(contractUrl);
  await page.getByRole("button", { name: "Record a payment" }).click({ timeout: 60_000 });
  const p = page.getByRole("dialog");
  await p.getByLabel("Amount received (FCFA)").fill("100000");
  await expect(p.getByTestId("payment-split")).toContainText("100 000");
  await p.getByRole("button", { name: /Record 100 000/ }).click();
  await toast(page, "Still owed: 50 000 FCFA");

  await page.getByRole("button", { name: "Deposit" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Paid by").selectOption("MOMO");
  await d.getByLabel("Transaction reference").fill("MP26.777");
  await d.getByRole("button", { name: "Record the deposit" }).click();
  await toast(page, "300 000 FCFA held");
  await expect(page.locator("main").getByTestId("contract-kpis")).toContainText("50 000");

  await page.goto(`/d/${deptId}/billing`);
  await page.locator("main").getByLabel("Current reading: A12 Electricity").fill("1250", { timeout: 60_000 });
  await page.getByRole("button", { name: "Bill the month" }).click();
  await toast(page, "1 charge(s) billed for 25 000 FCFA");
  await expect(page.locator("main").getByTestId("billing-sheet")).toContainText("UB-0001");

  // The receipt shows what the payment covered and what remains.
  await page.goto(contractUrl);
  const receipt = await page.getByRole("row").filter({ hasText: "RC-0001" }).getByRole("link", { name: "Receipt" }).getAttribute("href");
  await page.goto(receipt);
  const doc = page.locator("main").getByTestId("business-document");
  await expect(doc).toContainText("RC-0001");
  await expect(doc).toContainText("XYZ Company");
  await expect(doc).toContainText("Amount remaining");
});

test("arrears, search, dashboard and reports show the debt and the income", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/arrears`);
  await expect(page.locator("main").getByTestId("arrears-totals")).toContainText("50 000", { timeout: 60_000 });
  await page.goto(`/d/${deptId}/search?q=owing more than 10000`);
  await expect(page.locator("main").getByTestId("search-results")).toContainText("XYZ Company", { timeout: 60_000 });
  await page.goto(`/d/${deptId}`);
  await expect(page.locator("main").getByTestId("property-offices")).toContainText("Occupied", { timeout: 60_000 });
  await expect(page.locator("main").getByTestId("attention-list")).toContainText("vacant office");
  await page.goto(`/d/${deptId}/reports?period=month`);
  await expect(page.locator("main").getByTestId("property-report")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("main").getByTestId("report-kpis")).toContainText("Rent collected");
  await expect(page.locator("main").getByTestId("report-kpis")).toContainText("100 000");
});
