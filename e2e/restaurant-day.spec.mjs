import { expect, test } from "@playwright/test";
import { login as signIn } from "./support/login.mjs";
const login = (page, email, password, opts) => signIn(page, email, password, { clear: false, ...opts });

/**
 * The reference day of the implementation plan, recorded through the real interface by the
 * Boss and two department heads, one titled "Cashier" (plan §10.4 / §10.5). Every figure the owner cares
 * about is checked on screen: Menu & Stock, Money, Cash, the daily report and statements.
 */
test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const boss = { name: "Owner Test", email: `owner-${tag}@e2e.local`, password: "Plantain-2468" };
const head = { name: "Head Test", email: `head-${tag}@e2e.local`, password: "" };
const cashier = { name: "Cashier Test", email: `cashier-${tag}@e2e.local`, password: "" };
let deptId = "";

const money = (n) => `${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;


async function logout(page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await page.waitForURL(/\/login/);
}

async function toast(page, text) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

/** Selects the option of a <select> whose text contains `text`. */
async function selectByText(select, text) {
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  await select.selectOption(value);
}

test("the owner registers, sets up the company, departments (with types) and people", async ({ page }) => {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(boss.name);
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);

  await page.getByLabel("Company name").fill(`Test Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Department name").fill("Department 1");
  await page.getByRole("radio", { name: "Restaurant" }).click();
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByLabel("Department name").fill("Laundry");
  await page.getByRole("radio", { name: "Pressing (dress wash)" }).click();
  await page.getByRole("button", { name: "Add department" }).click();
  await expect(page.getByText("Pressing (dress wash)").first()).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Add a department head" }).click();
  await page.locator("#p-name-0").fill(head.name);
  await page.locator("#p-email-0").fill(head.email);
  await page.locator("#p-title-0").fill("Manager");
  await page.locator("label", { hasText: "Department 1" }).first().click();
  await page.locator("label", { hasText: "Laundry" }).first().click();
  head.password = await page.locator("#p-pass-0").inputValue();
  await page.getByRole("button", { name: "Add a department head" }).click();
  await page.locator("#p-name-1").fill(cashier.name);
  await page.locator("#p-email-1").fill(cashier.email);
  await page.locator("#p-title-1").fill("Cashier");
  await page.locator("label", { hasText: "Department 1" }).nth(1).click();
  cashier.password = await page.locator("#p-pass-1").inputValue();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByText(`Test Company ${tag} is ready`)).toBeVisible();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss$/);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Owner/ })).toBeVisible();

  // The Boss sets the cash the drawer starts with.
  await page.getByRole("link", { name: "Departments" }).click();
  await page.waitForURL(/\/boss\/departments/);
  const card = page.locator("div.rounded-xl", { hasText: "Department 1" }).filter({ has: page.getByRole("button", { name: "Edit" }) }).first();
  await card.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cash in the drawer at the start (FCFA)").fill("10000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await toast(page, "Department updated");
  const href = await card.getByRole("link", { name: "Open" }).getAttribute("href");
  deptId = href.split("/")[2];
  await logout(page);
});

test("the head builds the menu and stock (add, correct, add bought stock)", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/menu-stock`);
  await expect(page.getByRole("heading", { name: "Menu & Stock" })).toBeVisible();

  for (const [name, price, plates] of [["Dish A", "2000", "20"], ["Dish B", "3000", "10"]]) {
    await page.getByRole("button", { name: "Add dish" }).first().click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Dish name").fill(name);
    await d.getByLabel("Unit price (FCFA)").fill(price);
    await d.getByLabel("Plates available now").fill(plates);
    await d.getByRole("button", { name: "Add dish" }).click();
    await toast(page, `"${name}" added`);
  }

  // Morning count: Dish B has 9, not 10.
  await page.getByRole("button", { name: "Correct a count" }).click();
  let d = page.getByRole("dialog");
  await selectByText(d.getByLabel("Dish"), "Dish B");
  await d.getByLabel("You counted").fill("9");
  await expect(d.getByText("Difference: -1")).toBeVisible();
  await d.getByRole("button", { name: "Save the count" }).click();
  await toast(page, "Count corrected");

  // 10 plates of Dish A bought for 12 000 cash.
  await page.getByRole("button", { name: "Add stock" }).click();
  d = page.getByRole("dialog");
  await selectByText(d.getByLabel("Dish"), "Dish A");
  await d.getByLabel("Plates added").fill("10");
  await d.getByLabel(/This stock was bought/).check();
  await d.getByLabel("Amount paid (FCFA)").fill("12000");
  await d.getByLabel("Supplier").fill("Market");
  await expect(d.getByText("20 → 30 plates")).toBeVisible();
  await d.getByRole("button", { name: /Add 10 plates/ }).click();
  await toast(page, "10 plate(s) added (A-0003) · purchase P-0001");

  const totals = page.getByTestId("menu-stock-totals");
  await expect(totals).toContainText("39");
  await expect(totals).toContainText(`${money(30 * 2000 + 9 * 3000)} FCFA`);
  await logout(page);
});

test("the cashier sells: cash, on credit, and cannot sell more plates than exist", async ({ page }) => {
  await login(page, cashier.email, cashier.password);
  await page.waitForURL(new RegExp(`/d/${deptId}`));
  await page.getByRole("link", { name: "Sell" }).first().click();
  await page.waitForURL(/\/sell/);

  const tileA = page.getByRole("button", { name: "Add Dish A" });
  for (let i = 0; i < 15; i += 1) await tileA.click();
  await expect(page.getByTestId("cart")).toContainText("Dish A");
  await page.getByRole("radio", { name: "Cash" }).click();
  await page.getByRole("button", { name: /Record sale · 30 000 FCFA/ }).click();
  await toast(page, "Sale S-0001 recorded");
  await page.getByRole("button", { name: "New sale" }).click();

  for (let i = 0; i < 3; i += 1) await tileA.click();
  await page.getByRole("radio", { name: "On credit (debt)" }).click();
  await page.getByLabel("Customer name").fill("Customer 2");
  await page.getByRole("button", { name: /Record sale · 6 000 FCFA/ }).click();
  await toast(page, "Sale S-0002 recorded");
  await expect(page.getByRole("dialog")).toContainText("Debt D-0001 opened for Customer 2");
  await page.getByRole("button", { name: "New sale" }).click();

  // Nobody can sell more than the plates left.
  const tileB = page.getByRole("button", { name: "Add Dish B" });
  await expect(tileB).toContainText("9 left");
  for (let i = 0; i < 9; i += 1) await tileB.click();
  await expect(tileB).toBeDisabled();
  await expect(page.getByRole("button", { name: "One more Dish B" })).toBeDisabled();
  await page.getByRole("button", { name: "Remove Dish B" }).click();
  await logout(page);
});

test("the head sells with a discount, records money in and out, debts and repayments", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/sell`);
  const tileB = page.getByRole("button", { name: "Add Dish B" });
  for (let i = 0; i < 8; i += 1) await tileB.click();
  await page.getByLabel("Discount", { exact: true }).fill("1000");
  await page.getByLabel("Discount reason").fill("Promotion");
  await page.getByRole("button", { name: /Record sale · 23 000 FCFA/ }).click();
  await toast(page, "Sale S-0003 recorded");
  await page.getByRole("button", { name: "New sale" }).click();
  await expect(tileB).toContainText("1 left");

  await page.goto(`/d/${deptId}/money`);
  const entries = [
    ["RENT_INCOME", "15000", null],
    ["OTHER_INCOME", "2000", null],
    ["EXPENSE", "5000", "Cooking gas"],
    ["OTHER_EXPENSE", "1000", "Bank / MoMo charges"],
  ];
  for (const [type, amount, category] of entries) {
    await page.getByRole("button", { name: `Record ${type}` }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Amount (FCFA)").fill(amount);
    if (category) await selectByText(d.getByLabel("Category"), category);
    await d.getByRole("button", { name: /^Record/ }).click();
    await toast(page, "recorded");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(page.getByText("Result of the day").locator("xpath=../..")).toContainText("58 000 FCFA");

  // An old debt from yesterday, then a partial repayment.
  await page.goto(`/d/${deptId}/debts`);
  await page.getByRole("button", { name: "Add an old debt" }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Customer name").fill("Customer 1");
  await d.getByLabel("Amount owed (FCFA)").fill("9000");
  const yesterday = await page.evaluate(() => {
    const now = new Date(Date.now() + 3600 * 1000 - 24 * 3600 * 1000);
    return now.toISOString().slice(0, 10);
  });
  await d.getByLabel("Date of the debt").fill(yesterday);
  await d.getByRole("button", { name: /Record 9 000 FCFA/ }).click();
  await toast(page, "Debt D-0002 recorded");
  const row = page.locator("tr", { hasText: "Customer 1" });
  await row.getByRole("button", { name: "Repayment" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("Amount paid (FCFA)").fill("4000");
  await expect(d.getByText("Still owed after this payment: 5 000 FCFA")).toBeVisible();
  await d.getByRole("button", { name: /Record 4 000 FCFA/ }).click();
  await toast(page, "Repayment Y-0001 recorded");
  await expect(page.getByText("Owed by customers").locator("xpath=../..")).toContainText("11 000 FCFA");

  // Menu & Stock shows the day exactly.
  await page.goto(`/d/${deptId}/menu-stock`);
  const rowA = page.getByTestId("dish-row-Dish A");
  await expect(rowA).toContainText("+30");
  await expect(rowA).toContainText("−18");
  await expect(rowA).toContainText("24 000");
  const rowB = page.getByTestId("dish-row-Dish B");
  await expect(rowB).toContainText("−8");
  await expect(rowB).toContainText("3 000");
  await expect(page.getByTestId("menu-stock-totals")).toContainText("27 000 FCFA");
});

test("the Boss requests today's cash; the head hands it over; the Boss confirms it", async ({ page }) => {
  // The Boss cannot hand cash over himself: no "Cash to Boss" for him, the page sends him to his Cash page.
  await login(page, boss.email, boss.password);
  await page.goto(`/d/${deptId}`);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Cash to Boss" })).toHaveCount(0);
  await page.goto(`/d/${deptId}/cash-handover`);
  await expect(page).toHaveURL(/\/boss\/cash/);
  await page.waitForLoadState("networkidle");
  const form = page.getByTestId("request-cash");
  await expect(form.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
  await form.getByLabel("Message to the head").fill("Before 20:00 please");
  await form.getByRole("button", { name: "Send request" }).click();
  await toast(page, "Request sent to Department 1");
  await expect(page.getByTestId("cash-request-list")).toContainText("Waiting for the head");
  await logout(page);

  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}`);
  // Today's takings: the 10 000 opening float stays in the drawer as change.
  await expect(page.locator("main")).toContainText("56 000 FCFA to hand over");
  await expect(page.locator("main")).toContainText("The Boss asks for the cash of");
  await page.goto(`/d/${deptId}/cash-handover`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Cash in the drawer now").locator("xpath=../..")).toContainText("66 000 FCFA");
  const req = page.getByTestId("cash-requests");
  await expect(req).toContainText("Before 20:00 please");
  await expect(req).toContainText("56 000 FCFA to hand over");
  await req.getByRole("button", { name: "Hand over for this request" }).click();
  const d = page.getByRole("dialog");
  await expect(d.getByLabel("Amount (FCFA)")).toHaveValue("56000");
  await d.getByLabel("Amount (FCFA)").fill("66001");
  await expect(d.getByText("At most 66 000 FCFA")).toBeVisible();
  await d.getByLabel("Amount (FCFA)").fill("60000");
  await d.getByRole("button", { name: /Hand over 60 000 FCFA/ }).click();
  await toast(page, "Handover H-0001 recorded");
  await expect(page.getByTestId("cash-requests")).toContainText("Handed over 60 000 FCFA (H-0001)");
  await logout(page);

  await login(page, boss.email, boss.password);
  await page.goto("/boss/cash");
  const list = page.getByTestId("cash-request-list");
  await expect(list).toContainText("Cash handed over");
  await expect(list).toContainText("H-0001");
  await page.getByRole("button", { name: "I received it" }).click();
  await toast(page, "H-0001 confirmed");
  await logout(page);
});

test("the head counts the cash and sends the report; the Boss returns it, then approves version 2", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/report`);
  const report = page.getByTestId("daily-report");
  await expect(report).toContainText("77 000");
  await expect(report).toContainText("19 000");
  await expect(report).toContainText("58 000");
  await page.getByRole("button", { name: "Count the cash" }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Cash counted (FCFA)").fill("5500");
  await expect(d.getByText("Shortage of 500 FCFA.")).toBeVisible();
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Cash count saved");
  await page.getByRole("button", { name: "Send report to Boss" }).click();
  d = page.getByRole("dialog");
  await expect(d).toContainText("58 000 FCFA");
  await d.getByRole("button", { name: "Send to Boss" }).click();
  await toast(page, "sent to the Boss");
  await expect(page.getByText("This report was sent to the Boss.")).toBeVisible();
  await expect(report).toContainText("−500");
  // The day is locked: Sell shows the lock and no record button works.
  await page.goto(`/d/${deptId}/sell`);
  await expect(page.getByText(/was sent to the Boss/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Dish A" })).toBeDisabled();
  await logout(page);

  await login(page, boss.email, boss.password);
  await page.goto("/boss/daily-reports");
  await page.locator("tr", { hasText: "Department 1" }).getByRole("link", { name: "Open" }).click();
  await page.waitForURL(/\/boss\/daily-reports\/.+/);
  await expect(page.getByTestId("daily-report")).toContainText("Should remain in the drawer");
  await page.getByRole("button", { name: "Return with a note" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel(/Note to the department head/).fill("Please check the other income");
  await d.getByRole("button", { name: "Return report" }).click();
  await toast(page, "returned");
  await logout(page);

  await login(page, head.email, head.password);
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByRole("menuitem", { name: /returned by the Boss/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`/d/${deptId}/report`);
  await expect(page.getByText("Please check the other income").first()).toBeVisible();
  await page.getByRole("button", { name: "Send report to Boss" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Send to Boss" }).click();
  await toast(page, "sent to the Boss");
  await logout(page);

  await login(page, boss.email, boss.password);
  await page.goto("/boss/daily-reports");
  await page.locator("tr", { hasText: "Department 1" }).getByRole("link", { name: "Open" }).click();
  await expect(page.getByText("version 2").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await toast(page, "Report approved");
});

test("the Boss overview and statements show the same figures", async ({ page }) => {
  await login(page, boss.email, boss.password);
  await expect(page).toHaveURL(/\/boss$/);
  await expect(page.getByText("Money in today").locator("xpath=../..")).toContainText("77 000 FCFA");
  await expect(page.locator("main").getByText("Cash received", { exact: true }).locator("xpath=../..")).toContainText("60 000 FCFA");
  await page.goto("/statements?period=today");
  const st = page.getByTestId("statement");
  await expect(st).toContainText("Total money in");
  await expect(st).toContainText("77 000");
  await expect(st).toContainText("(19 000)");
  await expect(st).toContainText("58 000");
  await expect(st).toContainText("Final: the daily report is approved");
  const ai = page.getByTestId("ai-insights");
  await ai.getByRole("button", { name: "Get insights" }).click();
  await expect(ai).toContainText("not configured");
  await page.getByRole("tab", { name: "Stock movement" }).click();
  await expect(page.getByTestId("statement")).toContainText("27 000");
  await page.getByRole("tab", { name: "Debts" }).click();
  await expect(page.getByTestId("statement")).toContainText("11 000");
});

test("a person in two departments of different types: each department opens to its own sections", async ({ page }) => {
  await login(page, head.email, head.password);
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  // The department of the page shown is open; another one opens with a click and shows its own sections.
  await expect(nav.getByTestId("dept-nav-Department 1").getByRole("link", { name: "Sell" })).toBeVisible();
  const laundry = nav.getByTestId("dept-toggle-Laundry");
  await expect(laundry).toHaveAttribute("aria-expanded", "false");
  await laundry.click();
  await expect(laundry).toHaveAttribute("aria-expanded", "true");
  await expect(nav.getByTestId("dept-nav-Laundry").getByRole("link", { name: "Sell" })).toHaveCount(0);
  await nav.getByTestId("dept-nav-Laundry").getByRole("link", { name: "Home" }).click();
  await expect(page.getByText("The pressing (dress wash) department type is coming soon.")).toBeVisible();
  // Closing a department hides its sections; the choice is remembered after a reload.
  await nav.getByTestId("dept-toggle-Department 1").click();
  await expect(nav.getByTestId("dept-nav-Department 1")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).first().getByTestId("dept-nav-Department 1")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Main navigation" }).first().getByTestId("dept-toggle-Department 1").click();
  await page.getByRole("navigation", { name: "Main navigation" }).first().getByTestId("dept-nav-Department 1").getByRole("link", { name: "Sell" }).click();
  await expect(page.getByRole("heading", { name: "Sell" })).toBeVisible();
});
