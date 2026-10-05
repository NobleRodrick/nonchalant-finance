import { expect, test } from "@playwright/test";

/**
 * The owner sets up the business without department heads and runs it himself: the department
 * says so, he records the day (dishes, a sale, cash out of the drawer), and when he assigns a
 * head later the department is the head's and he oversees it again.
 */
test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const boss = { name: "Solo Owner", email: `solo-${tag}@e2e.local`, password: "Plantain-2468" };
let deptId = "";

test("setup without heads: the Boss is told he runs the department himself", async ({ page }) => {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(boss.name);
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Company name").fill(`Solo Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Snack bar");
  await page.getByRole("radio", { name: "Restaurant" }).click();
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // No department head: finish straight away.
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByTestId("you-run")).toContainText("You run Snack bar yourself");
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss$/);
  await expect(page.locator("main")).toContainText("you run it");

  await page.goto("/boss/departments");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("no-head-Snack bar")).toContainText("you run it yourself");
  const card = page.locator("div.rounded-xl", { hasText: "Snack bar" }).filter({ has: page.getByRole("button", { name: "Edit" }) }).first();
  deptId = (await card.getByRole("link", { name: "Open" }).getAttribute("href")).split("/")[2];
  await page.goto(`/d/${deptId}`);
  await expect(page.getByTestId("boss-runs-it")).toContainText("You run Snack bar yourself");
  await expect(page.getByTestId("boss-view-only")).toHaveCount(0);
});

test("the Boss records the day himself: dishes, a sale and the cash he takes", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/boss/);

  await page.goto(`/d/${deptId}/menu-stock`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add dish" }).first().click();
  const dd = page.getByRole("dialog");
  await dd.getByLabel("Dish name").fill("Puff-puff");
  await dd.getByLabel("Unit price (FCFA)").fill("500");
  await dd.getByLabel("Plates available now").fill("20");
  await dd.getByRole("button", { name: "Add dish" }).click();
  await expect(page.getByTestId("dish-row-Puff-puff")).toBeVisible();

  await page.goto(`/d/${deptId}/sell`);
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Add Puff-puff" }).click();
  await page.getByRole("button", { name: /Record sale/ }).click();
  await expect(page.getByRole("dialog")).toContainText("recorded");

  // His own cash page (a head's "Cash to Boss"): taking cash out is confirmed at once.
  await page.goto(`/d/${deptId}/cash-handover`);
  await expect(page).toHaveURL(new RegExp(`/d/${deptId}/cash-handover`));
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Hand over cash" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Amount (FCFA)").fill("1500");
  await d.getByRole("button", { name: /Hand over 1 500 FCFA/ }).click();
  await expect(page.locator("main")).toContainText(/Confirmed/i);
});
