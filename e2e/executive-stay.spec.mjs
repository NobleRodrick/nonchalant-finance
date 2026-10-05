import { expect, test } from "@playwright/test";
import { login as signIn } from "./support/login.mjs";
const login = signIn;

/**
 * Executive Stay run through the real interface (docs/EXECUTIVE_STAY_PLAN.md): the Boss creates
 * the guest house and two heads; a head adds apartments, books, checks a guest in, takes a payment
 * with its receipt, records an expense the other head validates, registers assets, reports and
 * closes a repair; the dashboard, the reports and the Boss's overview show it.
 */
test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const boss = { name: "Stay Owner", email: `sowner-${tag}@e2e.local`, password: "Plantain-2468" };
const head = { name: "Stay Manager", email: `smanager-${tag}@e2e.local`, password: "" };
const head2 = { name: "Stay Accountant", email: `saccount-${tag}@e2e.local`, password: "" };
let stayId = "";

/** Today + n days as YYYY-MM-DD (Africa/Douala = UTC+1). */
function dayKey(n) {
  return new Date(Date.now() + 3600000 + n * 86400000).toISOString().slice(0, 10);
}


async function toast(page, text) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 30_000 });
}

test("the Boss creates Executive Stay with two heads; its sidebar opens to its sections", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(boss.name);
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Stay Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Executive Stay");
  await page.getByRole("radio", { name: "Rooms / guest house" }).click();
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  for (const [i, p, title] of [[0, head, "Manager"], [1, head2, "Accountant"]]) {
    await page.getByRole("button", { name: "Add a department head" }).click();
    await page.locator(`#p-name-${i}`).fill(p.name);
    await page.locator(`#p-email-${i}`).fill(p.email);
    await page.locator(`#p-title-${i}`).fill(title);
    p.password = await page.locator(`#p-pass-${i}`).inputValue();
  }
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  const stay = nav.getByTestId("dept-nav-Executive Stay");
  for (const name of ["Dashboard", "Apartments", "Calendar", "Bookings", "Money in / out", "Assets", "Maintenance", "Reports"]) await expect(stay.getByRole("link", { name, exact: true })).toBeVisible();
  stayId = (await stay.getByRole("link", { name: "Dashboard" }).getAttribute("href")).split("/")[2];
});

test("apartments with their rates and state", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${stayId}/rooms`);
  for (const [name, rate] of [["Apartment 1", "30000"], ["Apartment 2", "25000"]]) {
    await page.getByRole("button", { name: "Add an apartment" }).click({ timeout: 60_000 });
    const d = page.getByRole("dialog");
    await d.getByLabel("Name or number").fill(name);
    await d.getByLabel("Rate of a night (FCFA)").fill(rate);
    await d.getByLabel("Rate of a week (optional)").fill(String(Number(rate) * 6));
    await d.getByRole("button", { name: "Add the apartment" }).click();
    await toast(page, "Apartment added");
  }
  await page.getByRole("button", { name: "State of Apartment 2" }).click();
  const s = page.getByRole("dialog");
  await s.getByLabel("The apartment is").selectOption("UNAVAILABLE");
  await s.getByLabel("Why").fill("Owner's family visiting");
  await s.getByRole("button", { name: "Save" }).click();
  await toast(page, "Apartment 2: unavailable");
  await expect(page.getByTestId("apartment-Apartment 2")).toContainText("Unavailable");
  await expect(page.getByTestId("apartment-Apartment 1")).toContainText("Available");
});

test("a booking: check-in, a payment with its receipt, the balance", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${stayId}/stays`);
  await page.getByRole("button", { name: "New booking" }).click({ timeout: 60_000 });
  const d = page.getByRole("dialog");
  await expect(d.getByLabel("Apartment")).not.toContainText("Apartment 2"); // unavailable
  await d.getByLabel("Departure").fill(dayKey(3));
  await d.locator("#st-guest").fill("Mr Kamga");
  await d.getByLabel("Phone").fill("699112233");
  await expect(d.getByText("Usual price: 90 000 FCFA")).toBeVisible();
  await d.getByLabel("Price of the stay (FCFA)").fill("80000");
  await expect(d.getByRole("button", { name: "Book Apartment 1" })).toBeDisabled();
  await d.getByLabel("Why this price").fill("Returning guest");
  await d.getByRole("button", { name: "Book Apartment 1" }).click();
  await toast(page, "Booking RB-0001 saved");
  await page.getByRole("link", { name: "RB-0001" }).click();
  await page.getByRole("button", { name: "Check in" }).click({ timeout: 60_000 });
  await toast(page, "Mr Kamga checked in");
  await page.getByRole("button", { name: "Record a payment" }).click();
  const p = page.getByRole("dialog");
  await p.getByLabel("Amount received (FCFA)").fill("50000");
  await p.getByLabel("Received by").fill("Aline");
  await p.getByRole("button", { name: "Record 50 000 FCFA" }).click();
  await toast(page, "Payment RC-0001 recorded. Balance: 30 000 FCFA");
  await expect(page.getByText("Balance due")).toBeVisible();
  await page.getByRole("link", { name: "RC-0001" }).first().click();
  const r = page.getByTestId("receipt");
  await expect(r).toContainText("Mr Kamga", { timeout: 60_000 });
  await expect(r).toContainText("Apartment 1");
  await expect(r).toContainText("80 000 FCFA");
  await expect(r).toContainText("30 000 FCFA");
  await expect(r).toContainText("Aline");
});

test("an expense of an apartment, validated by the other head", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${stayId}/money`);
  await page.getByRole("button", { name: "Record an expense or income" }).click({ timeout: 60_000 });
  const d = page.getByRole("dialog");
  await d.getByLabel("Apartment").selectOption({ label: "Apartment 1" });
  await d.getByLabel("Category").selectOption({ label: "Cleaning & laundry" });
  await d.getByLabel("Description").fill("Deep cleaning after guest");
  await d.getByLabel("Amount (FCFA)").fill("15000");
  await d.getByLabel("Person / vendor paid").fill("CleanCo");
  await d.getByRole("button", { name: "Record 15 000 FCFA" }).click();
  await toast(page, "E-0001 recorded");
  await expect(page.getByRole("row", { name: /E-0001/ })).toContainText("To validate");
  await login(page, head2.email, head2.password);
  await page.goto(`/d/${stayId}/money`);
  await page.getByRole("row", { name: /E-0001/ }).getByRole("button", { name: "Validate" }).click({ timeout: 60_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Validate" }).click();
  await toast(page, "E-0001 validated");
  await expect(page.getByRole("row", { name: /E-0001/ })).toContainText("Stay Accountant");
});

test("assets of an apartment and a repair that blocks it", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${stayId}/assets`);
  await page.getByRole("button", { name: "Add assets" }).click({ timeout: 60_000 });
  const a = page.getByRole("dialog");
  await a.getByLabel("Apartment").selectOption({ label: "Apartment 1" });
  await a.getByLabel("Kind").selectOption("CHAIR");
  await a.getByLabel("Name").fill("Chair");
  await a.getByLabel("Quantity").fill("4");
  await a.getByLabel("Value of one (FCFA)").fill("15000");
  await a.getByLabel(/Already owned/).check();
  await a.getByRole("button", { name: /^Add/ }).click();
  await toast(page, "AM-0001 recorded");
  await page.getByRole("button", { name: "Record a change of Chair in Apartment 1" }).click();
  const m = page.getByRole("dialog");
  await m.getByLabel("What happened").selectOption("missing");
  await m.getByLabel("Note").fill("Not found after the stay");
  await m.getByRole("button", { name: "Record" }).click();
  await toast(page, "AM-0002 recorded");
  await expect(page.getByText("Lost in the period")).toBeVisible();

  await page.goto(`/d/${stayId}/maintenance`);
  await page.getByRole("button", { name: "Report a repair" }).click({ timeout: 60_000 });
  const r = page.getByRole("dialog");
  await r.getByLabel("What needs fixing").fill("Water heater broken");
  await r.getByLabel("Priority").selectOption("URGENT");
  await r.getByLabel("Estimated cost (FCFA)").fill("25000");
  await r.getByRole("button", { name: "Report it" }).click();
  await toast(page, "MR-0001 reported");
  await page.getByRole("button", { name: "Done MR-0001" }).click();
  const done = page.getByRole("dialog");
  await done.getByLabel("Actual cost (FCFA)").fill("20000");
  await done.getByLabel("Person / vendor paid").fill("Plumber Joe");
  await done.getByRole("button", { name: "Mark as repaired" }).click();
  await toast(page, "MR-0001 done");
  await expect(page.getByRole("row", { name: /MR-0001/ })).toContainText("20 000 FCFA");
});

test("dashboard, reports and the Boss's card agree", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${stayId}`);
  await expect(page.getByTestId("stay-kpis")).toContainText("1 / 2", { timeout: 60_000 });
  await expect(page.getByTestId("apartments-now")).toContainText("Occupied");
  await page.goto(`/d/${stayId}/reports?period=month`);
  const rep = page.getByTestId("stay-report");
  await expect(rep).toContainText("Income statement (profit & loss)", { timeout: 60_000 });
  await expect(rep).toContainText("Balance sheet");
  await expect(rep).toContainText("Apartment by apartment");
  await expect(page.getByRole("row", { name: /^Apartment 1/ }).first()).toBeVisible();
  await login(page, boss.email, boss.password);
  await page.goto("/boss");
  await expect(page.getByText("Received from guests").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Occupied tonight").first()).toBeVisible();
});
