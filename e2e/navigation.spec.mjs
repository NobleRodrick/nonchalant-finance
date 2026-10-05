import { expect, test } from "@playwright/test";

/** Access control, old links and the phone layout. */
test("protected pages redirect to the login page with a safe return path", async ({ page }) => {
  await page.goto("/statements?period=month");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fstatements/);
});

test("links of the previous version still work", async ({ page }) => {
  for (const [from, to] of [["/dashboard", /\/login\?redirect=%2Fhome/], ["/reports/inbox", /redirect=%2Fboss%2Fdaily-reports/], ["/organization/employees", /redirect=%2Fboss%2Fpeople/]]) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  }
});

test("on a phone the menu opens as a drawer", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only");
  const tag = Date.now().toString(36);
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Phone Owner");
  await page.getByLabel("E-mail").fill(`phone-${tag}@e2e.local`);
  await page.getByLabel("Password", { exact: true }).fill("Mobile-2468a");
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Company name").fill(`Phone Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Department 1");
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);

  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(nav.getByRole("link", { name: "Menu & Stock" })).toBeVisible();
  await nav.getByRole("link", { name: "Menu & Stock" }).click();
  await page.waitForURL(/\/menu-stock/);
  await expect(page.getByRole("heading", { name: "Menu & Stock" })).toBeVisible();
  await expect(nav).toBeHidden();
  // No horizontal scrolling on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the sidebar is fixed on a computer screen", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop only");
  const tag = Date.now().toString(36);
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Desk Owner");
  await page.getByLabel("E-mail").fill(`desk-${tag}@e2e.local`);
  await page.getByLabel("Password", { exact: true }).fill("Bureau-2468a");
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Desk Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Department 1");
  await page.getByRole("button", { name: "Add department" }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Finish setup" })).toBeEnabled();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);
  await page.waitForLoadState("networkidle");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toBeVisible();
  const before = await nav.boundingBox();
  await page.mouse.wheel(0, 2000);
  const after = await nav.boundingBox();
  expect(after.y).toBe(before.y);
  expect(before.width).toBeGreaterThanOrEqual(250);
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeHidden();
});
