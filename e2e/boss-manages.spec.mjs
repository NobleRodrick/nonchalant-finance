import { expect, test } from "@playwright/test";
import fs from "node:fs";

/**
 * The Boss manages the business through the screens: departments, people (add, reset password,
 * deactivate), and a new department head signs in, changes the temporary password and works.
 * Also: the public homepage, notifications, record details, statement export.
 */
test.describe.configure({ mode: "serial" });

const tag = `m${Date.now().toString(36)}`;
const boss = { email: `mgr-boss-${tag}@e2e.local`, password: "Boss12345" };
const head = { name: "Accountant Head", email: `mgr-head-${tag}@e2e.local`, password: "" };
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

test("the homepage presents a business platform, restaurant being the first type", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Run every part of your business from one place");
  await expect(page.getByText("Available now")).toHaveCount(1);
  await expect(page.getByText("Coming soon").first()).toBeVisible();
  for (const t of ["You, the Boss", "Your department heads", "Two roles, clearly split", "Register your business", "Add your department heads"]) {
    await expect(page.getByText(t).first()).toBeVisible();
  }
  await page.getByRole("link", { name: /Register your business/ }).first().click();
  await expect(page).toHaveURL(/\/register/);
});

test("the Boss registers and creates a department of each kind from Departments", async ({ page }) => {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Managing Owner");
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Managed Business ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Department 1");
  await page.getByRole("button", { name: "Add department" }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByText("Make sure every department has a head")).toBeVisible();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);
  await page.waitForLoadState("networkidle");
  // No head yet: the overview says so.
  await expect(page.locator("main")).toContainText("Department 1 has no department head");

  await page.goto("/boss/departments");
  await page.waitForLoadState("networkidle");
  const d = page.getByRole("dialog");
  await expect(async () => {
    await page.getByRole("button", { name: "Create a department" }).click();
    await expect(d).toBeVisible({ timeout: 2000 });
  }).toPass();
  await d.getByLabel("Department name").fill("Department 2");
  await d.getByRole("radio", { name: /Car wash/ }).click();
  await d.getByRole("button", { name: "Create department" }).click();
  await expect(page.getByText("Department 2")).toBeVisible();
  const card = page.locator("div.rounded-xl", { hasText: "Department 1" }).filter({ has: page.getByRole("button", { name: "Edit" }) }).first();
  deptId = (await card.getByRole("link", { name: "Open" }).getAttribute("href")).split("/")[2];
  await expect(card).toContainText("No department head yet");
});

test("the Boss adds a department head titled Accountant from People (temporary password)", async ({ page }) => {
  await login(page, boss.email, boss.password);
  await page.waitForURL(/\/boss/);
  await page.goto(`/boss/people?dept=${deptId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Department 1 has no department head")).toBeVisible();
  await page.getByRole("button", { name: "Add a department head" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Full name").fill(head.name);
  await d.getByLabel("Email").fill(head.email);
  await d.getByLabel("Title").fill("Accountant");
  await expect(d.getByLabel("Department 1")).toBeChecked(); // opened from Department 1's people
  head.password = await d.getByLabel("Temporary password").inputValue();
  await d.getByRole("button", { name: "Create account" }).click();
  await toast(page, "Account created");
  await expect(page.getByRole("row", { name: new RegExp(head.name) })).toContainText("Department head");
  await expect(page.getByText("has no department head")).toHaveCount(0);
  await page.goto("/boss/departments");
  await expect(page.getByTestId("heads-Department 1")).toContainText(`${head.name} · Accountant`);
});

test("the head signs in, changes the password and runs the department", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.waitForURL(new RegExp(`/d/${deptId}`));
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByTestId("department-switcher").or(nav.getByTestId("active-department")).first()).toBeVisible();
  await expect(nav).toContainText("Accountant · Department head");
  await page.goto("/profile");
  await page.waitForLoadState("networkidle");
  await page.locator("#pf-cur").fill(head.password);
  await page.locator("#pf-new").fill("MyOwn12345");
  await page.locator("#pf-confirm").fill("MyOwn12345");
  await page.getByRole("button", { name: "Change password" }).click();
  await toast(page, "Password updated");
  head.password = "MyOwn12345";

  await page.goto(`/d/${deptId}/menu-stock`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add dish" }).first().click();
  const dd = page.getByRole("dialog");
  await dd.getByLabel("Dish name").fill("Dish 1");
  await dd.getByLabel("Unit price (FCFA)").fill("2000");
  await dd.getByLabel("Plates available now").fill("5");
  await dd.getByRole("button", { name: "Add dish" }).click();
  await expect(page.getByTestId("dish-row-Dish 1")).toBeVisible();
  await page.goto(`/d/${deptId}/sell`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add Dish 1" }).click();
  await page.getByRole("button", { name: /Record sale/ }).click();
  await expect(page.getByRole("dialog")).toContainText("recorded");

  // Every record opens with its details.
  await page.goto(`/d/${deptId}/history`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("row", { name: /S-0001/ }).click();
  await expect(page.getByRole("dialog")).toContainText("S-0001");
});

test("the Boss sees the head's work, gets notified, exports a statement, resets and deactivates an account", async ({ page }) => {
  page.on("dialog", (dlg) => dlg.accept());
  await login(page, boss.email, boss.password);
  await page.waitForURL(/\/boss/);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main")).toContainText(`Head: ${head.name}`);
  await expect(page.locator("main")).toContainText("2 000");

  // Statement export.
  await page.goto("/statements?period=today");
  await page.waitForLoadState("networkidle");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const csv = fs.readFileSync(await download.path(), "utf8");
  expect(download.suggestedFilename()).toMatch(/^statement-income-.*\.csv$/);
  expect(csv).toContain("2000");

  // Reset the head's password; deactivate, then reactivate.
  await page.goto(`/boss/people?dept=${deptId}`);
  await page.waitForLoadState("networkidle");
  const row = page.getByRole("row", { name: new RegExp(head.name) });
  await row.getByRole("button", { name: "Reset password" }).click();
  const resetToast = page.locator("[data-sonner-toast]").filter({ hasText: "New temporary password" }).first();
  await expect(resetToast).toBeVisible();
  head.password = (await resetToast.innerText()).match(/: (\S+) \(copied\)/)[1];
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel(/Account active/).uncheck();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Saved");

  await login(page, head.email, head.password);
  await toast(page, "deactivated");
  await expect(page).toHaveURL(/\/login/);

  await login(page, boss.email, boss.password);
  await page.waitForURL(/\/boss/);
  await page.goto(`/boss/people?dept=${deptId}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("row", { name: new RegExp(head.name) }).getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel(/Account active/).check();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Saved");
  // A reactivated head still heads their department. From a department card the Boss adds them
  // to Department 2 as well, then takes them off again (they keep Department 1).
  await page.goto("/boss/departments");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("heads-Department 1")).toContainText(head.name);
  await page.getByLabel("Add a head to Department 2").selectOption({ label: `${head.name} (Accountant)` });
  await toast(page, `${head.name} is now a head of Department 2`);
  await expect(page.getByTestId("heads-Department 2")).toContainText(head.name);
  await page.getByRole("button", { name: `Remove ${head.name} from Department 2` }).click();
  await toast(page, `${head.name} no longer heads Department 2`);
  await expect(page.getByTestId("no-head-Department 2")).toBeVisible();
  await login(page, head.email, head.password);
  await page.waitForURL(new RegExp(`/d/${deptId}`));
});

test("notifications: the head's report reaches the Boss's bell and opens the review", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.waitForURL(new RegExp(`/d/${deptId}`));
  await page.goto(`/d/${deptId}/report`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Count the cash/ }).click();
  await page.getByRole("dialog").getByLabel("Cash counted (FCFA)").fill("2000");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Cash count saved");
  await page.getByRole("button", { name: "Send report to Boss" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Send to Boss" }).click();
  await toast(page, "sent to the Boss");

  await login(page, boss.email, boss.password);
  await page.waitForURL(/\/boss/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Notifications" }).click();
  await page.getByRole("menuitem", { name: /Department 1: report of .* sent/ }).first().click();
  await expect(page).toHaveURL(/\/boss\/daily-reports\/[0-9a-f-]+/);
  await expect(page.getByRole("button", { name: /Approve/ })).toBeVisible();
});
