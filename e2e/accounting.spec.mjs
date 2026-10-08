import { expect, test } from "@playwright/test";
import { login } from "./support/login.mjs";

/**
 * Full accounting through the real interface (docs/ACCOUNTING_PLAN.md): the Boss's business starts
 * in Simple; he switches its company to Full accounting, records the capital brought in with a
 * ready-made entry, reads the statements (the balance sheet balances), the trial balance and the
 * ledger, closes nothing yet, and adds an accountant who signs in to the books only. Then he lets
 * the department head keep the books of his department, and switches VAT on (Statements show it).
 */
test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const boss = { name: "Books Owner", email: `bowner-${tag}@e2e.local`, password: "Plantain-2468" };
const accountant = { name: "Awa Accountant", email: `bacc-${tag}@e2e.local`, password: "Ledger-24680" };
let companyUrl = "";
const chef = { email: `bchef-${tag}@e2e.local`, password: "" };

async function toast(page, text) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 30_000 });
}

test("the Boss's business starts in Simple accounting; he switches its company to Full", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(boss.name);
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Books Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Restaurant");
  await page.getByRole("radio", { name: "Restaurant" }).click();
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add a department head" }).click();
  await page.locator("#p-name-0").fill("Chef");
  await page.locator("#p-email-0").fill(chef.email);
  chef.password = await page.locator("#p-pass-0").inputValue();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);

  await page.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Accounting" }).click();
  await page.waitForURL(/\/accounting$/);
  await expect(page.getByText("Simple", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Set up Full accounting" }).click();
  await page.waitForURL(/\/accounting\/[0-9a-f-]{36}\/settings/);
  companyUrl = page.url().replace(/\/settings$/, "");
  await page.getByRole("button", { name: "Switch to Full accounting" }).click();
  await page.getByRole("button", { name: "Switch and write the books" }).click();
  await toast(page, "Full accounting on");
  await expect(page.getByText("Full accounting (SYSCOHADA)").first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Books" }).getByRole("link", { name: "Statements" })).toBeVisible();
});

test("the capital brought in, from a ready-made entry; statements, trial balance and ledger agree", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, boss.email, boss.password);
  await page.goto(`${companyUrl}/entries/new`);
  const main = page.locator("main");
  await main.getByLabel("Start from").selectOption({ label: "Capital brought in (to the bank)" });
  await main.getByLabel("Debit of line 1").fill("1000000");
  await expect(main.getByTestId("entry-balance")).toContainText("Difference");
  await page.getByRole("button", { name: "Balance with an empty line" }).click();
  await expect(main.getByTestId("entry-balance")).toContainText("Balanced");
  await page.getByRole("button", { name: "Post the entry" }).click();
  await toast(page, "posted");
  await page.waitForURL(/\/entries\/[0-9a-f-]{36}$/);
  await expect(main.getByText(/OD-\d{4}-000001/).first()).toBeVisible();

  await page.goto(`${companyUrl}/statements?tab=balance`);
  await expect(main.getByTestId("balance-assets")).toContainText("1 000 000");
  await expect(main.getByTestId("balance-liabilities")).toContainText("Capital");
  await expect(main.getByText("Assets = equity and liabilities.")).toBeVisible();
  await page.goto(`${companyUrl}/statements?tab=cash`);
  await expect(main.getByTestId("cash-flow")).toContainText("1 000 000");
  await page.goto(`${companyUrl}/trial-balance`);
  await expect(main.getByTestId("trial-totals")).toContainText("1 000 000");
  await page.goto(`${companyUrl}/ledger?account=5211`);
  await expect(main.getByTestId("ledger-closing")).toContainText("1 000 000");
  await page.goto(`${companyUrl}/closing`);
  await expect(main.getByText("Record the opening balances")).toBeVisible();
  await page.goto(companyUrl);
  await expect(main.getByText("Latest entries")).toBeVisible();
});

test("the Boss adds an accountant; the accountant signs in to the books only", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, boss.email, boss.password);
  await page.goto(`${companyUrl}/settings`);
  await page.getByRole("button", { name: "Add an accountant" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Name").fill(accountant.name);
  await d.getByLabel("E-mail").fill(accountant.email);
  await d.getByLabel("Temporary password").fill(accountant.password);
  await d.getByRole("button", { name: "Add" }).click();
  await toast(page, "can now sign in");

  await login(page, accountant.email, accountant.password);
  await page.waitForURL(/\/accounting\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  await expect(nav.getByRole("link", { name: "Accounting" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveCount(0);
  await page.goto("/boss");
  await page.waitForURL(/\/accounting/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.goto(`${companyUrl}/entries`);
  await expect(page.locator("main").getByTestId("entries")).toContainText("Capital brought in");
});

test("the Boss lets the head keep the books of his department; the head does it, limited to it", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, boss.email, boss.password);
  await page.goto(`${companyUrl}/settings`);
  const main = page.locator("main");
  await main.getByLabel("Books Chef keeps").selectOption("DEPARTMENTS");
  await toast(page, "now keeps");

  await login(page, chef.email, chef.password);
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  await nav.getByRole("link", { name: "Accounting" }).click();
  await page.waitForURL(/\/accounting\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(main.getByText("You keep the books of Restaurant")).toBeVisible();
  const books = page.getByRole("navigation", { name: "Books" });
  await expect(books.getByRole("link", { name: "Trial balance" })).toBeVisible();
  await expect(books.getByRole("link", { name: "Closing" })).toHaveCount(0);
  await expect(books.getByRole("link", { name: "Settings" })).toHaveCount(0);
  // The capital entry is the company's (no department): not in his books.
  await page.goto(`${companyUrl}/entries`);
  await expect(main.getByTestId("entries")).not.toContainText("Capital brought in");
  // He posts an entry on his department.
  await page.goto(`${companyUrl}/entries/new`);
  await expect(main.getByText("Give every line one of your departments")).toBeVisible();
  await main.getByLabel("Start from").selectOption({ label: "Salaries paid by bank" });
  await main.getByLabel("Debit of line 1").fill("25000");
  await page.getByRole("button", { name: "Balance with an empty line" }).click();
  await expect(main.getByTestId("entry-balance")).toContainText("Balanced");
  await page.getByRole("button", { name: "Post the entry" }).click();
  await toast(page, "posted");
  await page.waitForURL(/\/entries\/[0-9a-f-]{36}$/);
  await page.goto(`${companyUrl}/trial-balance`);
  await expect(main.getByTestId("trial-totals")).toContainText("25 000");
  await page.goto(`${companyUrl}/statements`);
  await expect(page.getByRole("tab", { name: "Balance sheet" })).toHaveCount(0);
  // Company-wide pages send him back to his books.
  await page.goto(`${companyUrl}/closing`);
  await page.waitForURL(new RegExp(`${companyUrl.split("/").pop()}$`), { timeout: 30_000 });
  await page.goto(`${companyUrl}/settings`);
  await page.waitForURL(new RegExp(`${companyUrl.split("/").pop()}$`), { timeout: 30_000 });
});

test("with VAT on, the Statements page shows the VAT inside the figures and the result without VAT", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, boss.email, boss.password);
  await page.goto(`${companyUrl}/settings`);
  const main = page.locator("main");
  await main.getByLabel("The company is registered for VAT").check();
  await main.getByLabel("VAT applies from").fill(`${new Date().toISOString().slice(0, 7)}-01`);
  await main.getByRole("button", { name: "Save", exact: true }).click();
  await toast(page, "Settings saved");
  await page.goto("/statements");
  await expect(main.getByTestId("result-without-vat")).toBeVisible();
  await expect(main.getByText("VAT collected (in money in, owed to the State)")).toBeVisible();
});
