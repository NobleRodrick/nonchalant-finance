import { expect, test } from "@playwright/test";

/**
 * A department head notices a sale was a mistake and undoes it: from the receipt, from the
 * day's sales ("Undo and fix" puts the dishes back in the basket) and from History. Plates go
 * back to stock and a credit sale's debt is cancelled. The Boss never undoes anything.
 */
test.describe.configure({ mode: "serial" });

const tag = `u${Date.now().toString(36)}`;
const boss = { email: `undo-boss-${tag}@e2e.local`, password: "Boss12345" };
const head = { email: `undo-head-${tag}@e2e.local`, password: "" };
let deptId = "";

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
}
const row = (page) => page.getByTestId("dish-row-Rice");

test("setup: a business with one department head and a dish of 10 plates", async ({ page }) => {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Undo Owner");
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Undo Business ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Department 1");
  await page.getByRole("button", { name: "Add department" }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add a department head" }).click();
  await page.locator("#p-name-0").fill("Head One");
  await page.locator("#p-email-0").fill(head.email);
  await page.locator("#p-title-0").fill("Manager");
  head.password = await page.locator("#p-pass-0").inputValue();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);

  await login(page, head.email, head.password);
  await page.waitForURL(/\/d\//);
  deptId = page.url().split("/d/")[1].split(/[/?]/)[0];
  await page.goto(`/d/${deptId}/menu-stock`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add dish" }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Dish name").fill("Rice");
  await d.getByLabel("Unit price (FCFA)").fill("1000");
  await d.getByLabel("Plates available now").fill("10");
  await d.getByRole("button", { name: "Add dish" }).click();
  await toast(page, '"Rice" added to the menu.'); // saved on the server (not only on this computer)
  await expect(row(page)).toBeVisible();
});

test("the head undoes a sale from the receipt: the plates go back to stock", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.waitForURL(/\/d\//);
  await page.goto(`/d/${deptId}/sell`);
  await page.waitForLoadState("networkidle");
  const tile = page.getByRole("button", { name: "Add Rice" });
  await tile.click();
  await tile.click();
  await tile.click();
  await page.getByRole("button", { name: /Record sale/ }).click();
  await toast(page, "Sale S-0001 recorded");
  await page.getByRole("button", { name: "Undo this sale" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText("Undo sale S-0001?");
  await expect(page.getByTestId("undo-effects")).toContainText("Plates go back to stock: 3 × Rice");
  await expect(dlg.getByRole("button", { name: "Undo sale" })).toBeDisabled(); // a reason is required
  await dlg.getByRole("button", { name: "Entered by mistake" }).click();
  await dlg.getByRole("button", { name: "Undo sale" }).click();
  await toast(page, "Sale S-0001 undone");
  const sales = page.locator("tr", { hasText: "S-0001" });
  await expect(sales).toContainText("Undone");
  await expect(page.getByRole("button", { name: "Add Rice" })).toContainText("10 left");
  await page.goto(`/d/${deptId}/menu-stock`);
  await expect(row(page)).toContainText("10 000"); // 10 plates × 1 000: value back
});

test("the head undoes a credit sale with 'Undo and fix' and records it correctly", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.waitForURL(/\/d\//);
  await page.goto(`/d/${deptId}/sell`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add Rice" }).click();
  await page.getByRole("radio", { name: "On credit (debt)" }).click();
  await page.getByLabel("Customer name").fill("Customer 7");
  await page.getByRole("button", { name: /Record sale/ }).click();
  await toast(page, "Sale S-0002 recorded");
  await page.getByRole("button", { name: "New sale" }).click();

  await page.getByRole("button", { name: "Undo sale S-0002" }).click();
  const dlg = page.getByRole("dialog");
  await expect(page.getByTestId("undo-effects")).toContainText("Debt D-0001 of Customer 7 is cancelled");
  await dlg.getByRole("button", { name: "Wrong quantity" }).click();
  await dlg.getByRole("button", { name: "Undo and fix" }).click();
  await toast(page, "Its dishes are back in the basket");
  // The basket holds the undone sale (1 × Rice, on credit for Customer 7): fix the quantity and record it.
  await page.getByRole("button", { name: "Add Rice" }).click();
  await expect(page.getByRole("radio", { name: "On credit (debt)" })).toBeChecked();
  await page.getByRole("button", { name: /Record sale · 2 000 FCFA/ }).click();
  await toast(page, "Sale S-0003 recorded");
  await page.getByRole("button", { name: "New sale" }).click();
  await expect(page.locator("tr", { hasText: "S-0002" })).toContainText("Undone");
  await expect(page.getByRole("button", { name: "Add Rice" })).toContainText("8 left");
});

test("the head undoes a sale from History; the Boss cannot undo anything", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.waitForURL(/\/d\//);
  await page.goto(`/d/${deptId}/history`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("row", { name: /S-0003/ }).click();
  const detail = page.getByRole("dialog");
  await detail.getByRole("button", { name: "Undo this sale" }).click();
  const dlg = page.getByRole("dialog").filter({ hasText: "Undo sale S-0003?" });
  await dlg.getByLabel("Reason").fill("Customer changed their mind");
  await expect(dlg.getByRole("button", { name: "Undo and fix" })).toHaveCount(0); // fixing is done at the till
  await dlg.getByRole("button", { name: "Undo sale" }).click();
  await toast(page, "Sale S-0003 undone");
  await page.goto(`/d/${deptId}/sell`);
  await expect(page.getByRole("button", { name: "Add Rice" })).toContainText("10 left");

  await login(page, boss.email, boss.password);
  await page.waitForURL(/\/boss/);
  expect((await page.goto(`/d/${deptId}/sell`)).status()).toBe(404);
  await page.goto(`/d/${deptId}/history`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("row", { name: /S-0003/ }).click();
  await expect(page.getByRole("dialog")).toContainText("S-0003");
  await expect(page.getByRole("button", { name: "Undo this sale" })).toHaveCount(0);
});
