import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./support/login.mjs";

/**
 * Shop, bar, pressing and car wash through the real interface (docs/TRADE_AND_SERVICES_PLAN.md):
 * the Boss creates the four departments with one manager; the manager adds a product with its
 * barcode and sells it by scanning (the USB scanner types the code and Enter), on credit too; the
 * bar buys beer with its crates and serves a table on a tab; the pressing takes two shirts with an
 * advance and hands them over; the car wash washes a vehicle with its washer's commission; the
 * dashboards, reports, search and documents show it all.
 */
test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const boss = { name: "Trade Owner", email: `towner-${tag}@e2e.local`, password: "Plantain-2468" };
const head = { name: "Trade Manager", email: `tmanager-${tag}@e2e.local`, password: "" };
const DEPTS = [["Corner Shop", "Shop"], ["Le Bar", "Bar / snack bar"], ["Clean Pressing", "Pressing (dress wash)"], ["Speed Wash", "Car wash"]];
const ids = {};
const barcode = `600${Date.now().toString().slice(-10)}`;

async function toast(page, text) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 30_000 });
}
const main = (page) => page.locator("main");

test("the Boss creates a shop, a bar, a pressing and a car wash with their manager", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(boss.name);
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Trade Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  for (const [name, type] of DEPTS) {
    await page.getByLabel("Department name").fill(name);
    await page.getByRole("radio", { name: type, exact: true }).click();
    await page.getByRole("button", { name: "Add department" }).click();
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add a department head" }).click();
  await page.locator("#p-name-0").fill(head.name);
  await page.locator("#p-email-0").fill(head.email);
  await page.locator("#p-title-0").fill("Manager");
  for (const [name] of DEPTS) await page.locator("label").filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).click();
  head.password = await page.locator("#p-pass-0").inputValue();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  for (const [name] of DEPTS) ids[name] = (await main(page).getByRole("link", { name, exact: true }).first().getAttribute("href", { timeout: 60_000 })).split("/")[2];
  // The sidebar opens one department at a time: each shows its own sections.
  await nav.getByRole("button", { name: /^Le Bar/ }).click();
  await expect(nav.getByTestId("dept-nav-Le Bar").getByRole("link", { name: "Crates & empties" })).toBeVisible();
  await nav.getByRole("button", { name: /^Speed Wash/ }).click();
  await expect(nav.getByTestId("dept-nav-Speed Wash").getByRole("link", { name: "Washers" })).toBeVisible();
});

test("shop: a product with its barcode; sold by scanning, with change; on credit; the stock follows", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, head.email, head.password);
  const id = ids["Corner Shop"];
  await page.goto(`/d/${id}/products`);
  await main(page).getByRole("button", { name: "Add a product" }).click({ timeout: 60_000 });
  let d = page.getByRole("dialog");
  await d.locator("#pr-n").fill("Rice 5 kg");
  await d.locator("#pr-b").fill(barcode);
  await d.locator("#pr-c").fill("Food & groceries");
  await d.locator("#pr-u").fill("bag");
  await d.locator("#pr-p").fill("5000");
  await d.locator("#pr-cp").fill("4000");
  await d.locator("#pr-o").fill("10");
  await d.locator("#pr-l").fill("3");
  await d.getByRole("button", { name: "Add", exact: true }).click();
  await toast(page, "Rice 5 kg added");

  await page.goto(`/d/${id}/sell`);
  const search = main(page).getByTestId("pos-search");
  await search.fill(barcode);
  await search.press("Enter");
  await search.fill(barcode);
  await search.press("Enter");
  await expect(main(page).getByTestId("cart")).toContainText("Rice 5 kg");
  await expect(main(page).getByTestId("cart-total")).toContainText("10 000");
  await main(page).locator("#co-t").fill("12000");
  await expect(main(page).getByTestId("change")).toContainText("2 000");
  await main(page).getByRole("button", { name: "Record the sale" }).click();
  await toast(page, "change 2 000");

  await main(page).getByRole("button", { name: /Rice 5 kg/ }).click();
  await main(page).getByRole("radio", { name: "On credit" }).click();
  await main(page).locator("#co-cn").fill("Mama Ngono");
  await main(page).locator("#co-cp").fill("699000111");
  await main(page).getByRole("button", { name: "Record on credit" }).click();
  await toast(page, "recorded");
  await expect(main(page).getByText("On credit · Mama Ngono")).toBeVisible();

  await main(page).getByRole("link", { name: /^S-/ }).last().click();
  await expect(main(page).getByTestId("business-document")).toContainText("Rice 5 kg");
  await expect(main(page).getByTestId("business-document")).toContainText("Cash");

  await page.goto(`/d/${id}/debts`);
  await expect(main(page).getByText("Mama Ngono").first()).toBeVisible({ timeout: 30_000 });
  await page.goto(`/d/${id}/stock`);
  await expect(main(page).getByRole("row").filter({ hasText: "Rice 5 kg" })).toContainText("7 bag");
  await page.goto(`/d/${id}/search?q=${barcode}`);
  await expect(main(page).getByTestId("search-results")).toContainText("Rice 5 kg");
  await page.goto(`/d/${id}`);
  await expect(main(page).getByTestId("trade-today")).toContainText("15 000");
  await page.goto(`/d/${id}/reports`);
  await expect(main(page).getByTestId("trade-report")).toContainText("15 000");
});

test("bar: a crate with its deposit; beer bought with its crates; a table's tab paid at the end", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, head.email, head.password);
  const id = ids["Le Bar"];
  await page.goto(`/d/${id}/crates`);
  await main(page).getByRole("button", { name: "Add a kind of crate" }).click({ timeout: 60_000 });
  let d = page.getByRole("dialog");
  await d.locator("#cr-n").fill("SABC crate (12)");
  await d.locator("#cr-d").fill("3600");
  await d.locator("#cr-b").fill("300");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Crate saved");

  await page.goto(`/d/${id}/products`);
  await main(page).getByRole("button", { name: "Add a drink" }).click({ timeout: 60_000 });
  d = page.getByRole("dialog");
  await d.locator("#pr-n").fill("33 Export 65 cl");
  await d.locator("#pr-p").fill("700");
  await d.locator("#pr-cp").fill("500");
  await d.locator("#pr-pk").fill("12");
  await d.locator("#pr-cr").selectOption({ label: "SABC crate (12) · 3 600 FCFA" });
  await d.getByRole("button", { name: "Add", exact: true }).click();
  await toast(page, "added");

  await page.goto(`/d/${id}/purchases`);
  await main(page).getByRole("button", { name: "Record a purchase" }).click({ timeout: 60_000 });
  d = page.getByRole("dialog");
  await d.locator("#pu-s").fill("SABC Depot");
  await d.getByLabel("Product", { exact: true }).selectOption({ index: 1 });
  await d.getByLabel("Quantity", { exact: true }).fill("24");
  await d.getByLabel("Unit cost", { exact: true }).fill("500");
  await expect(d.getByLabel("Full crates of SABC crate (12) received")).toHaveValue("2");
  await d.getByRole("button", { name: "Record the purchase" }).click();
  await toast(page, "the stock went up");

  await page.goto(`/d/${id}/sell`);
  await main(page).getByRole("button", { name: /33 Export/ }).click();
  await main(page).getByRole("button", { name: "One more" }).click();
  await main(page).getByRole("button", { name: "Put on a tab" }).click();
  d = page.getByRole("dialog");
  await d.locator("#tab-new").fill("Table 4");
  await d.getByRole("button", { name: "Open the tab" }).click();
  await toast(page, "Tab Table 4 opened");
  const tab = main(page).getByTestId("tab-card").filter({ hasText: "Table 4" });
  await expect(tab).toContainText("1 400");
  await tab.getByRole("button", { name: "Pay" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Record the payment" }).click();
  await toast(page, "Table 4 paid");
  await expect(main(page).getByTestId("tab-card")).toHaveCount(0);

  await page.goto(`/d/${id}/crates`);
  await expect(main(page).getByRole("row").filter({ hasText: "SABC crate (12)" }).first()).toContainText("7 200");
});

test("pressing: two shirts with an advance; ready; collected with the balance; the drop-off slip", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, head.email, head.password);
  const id = ids["Clean Pressing"];
  await page.goto(`/d/${id}/prices`);
  await main(page).getByRole("button", { name: "Add a service" }).click({ timeout: 60_000 });
  const d = page.getByRole("dialog");
  await d.locator("#si-n").fill("Wash & iron");
  await d.locator("#si-p").fill("1000");
  await d.getByLabel("Shirt", { exact: true }).fill("500");
  await d.getByLabel("Suit (2 pieces)").fill("3000");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Price list saved");

  await page.goto(`/d/${id}/tickets/new`);
  await main(page).locator("#tk-n").fill("Mme Ngo");
  await main(page).locator("#tk-p").fill("677112233");
  await main(page).locator("#tl-v-0").selectOption("Shirt");
  await main(page).locator("#tl-q-0").fill("2");
  await main(page).locator("#tk-tag").fill("A101-A102");
  await expect(main(page).getByTestId("ticket-total")).toContainText("1 000");
  await main(page).getByRole("button", { name: "Half" }).click();
  await main(page).getByRole("button", { name: "Create the ticket" }).click();
  await page.waitForURL(/\/tickets\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(main(page).getByText("Mme Ngo").first()).toBeVisible();
  const actions = main(page).getByTestId("ticket-actions");
  await actions.getByRole("button", { name: "Ready" }).click();
  await toast(page, "is ready");
  await expect(actions.getByRole("link", { name: /Tell the customer/ })).toBeVisible();
  await actions.getByRole("button", { name: "Collected" }).click();
  await expect(page.getByRole("dialog")).toContainText("500 FCFA left to pay");
  await page.getByRole("dialog").getByRole("button", { name: "Collected" }).click();
  await toast(page, "collected");
  await page.getByRole("link", { name: "Drop-off slip" }).click();
  await expect(main(page).getByTestId("business-document")).toContainText("A101-A102");
  await page.goto(`/d/${id}`);
  await expect(main(page).getByTestId("service-today")).toContainText("1 000");
});

test("car wash: a washer and his commission; a vehicle from arrival to departure", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, head.email, head.password);
  const id = ids["Speed Wash"];
  await page.goto(`/d/${id}/workers`);
  await main(page).getByRole("button", { name: "Add a washer" }).click({ timeout: 60_000 });
  await page.getByRole("dialog").locator("#wk-n").fill("Paul");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Saved");

  await page.goto(`/d/${id}/prices`);
  await main(page).getByRole("button", { name: "Add a service" }).click({ timeout: 60_000 });
  const d = page.getByRole("dialog");
  await d.locator("#si-n").fill("Full wash");
  await d.getByLabel("Car (saloon)").fill("3000");
  await d.getByLabel("4x4 / SUV").fill("4000");
  await d.locator("#si-ct").selectOption("PERCENT");
  await d.locator("#si-cv").fill("30");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Price list saved");

  await page.goto(`/d/${id}/tickets/new`);
  await main(page).locator("#tk-plate").fill("LT 123 AB");
  await main(page).locator("#tk-vt").selectOption("4x4 / SUV");
  await main(page).locator("#tl-w-0").selectOption({ label: "Paul" });
  await expect(main(page).getByTestId("ticket-total")).toContainText("4 000");
  await main(page).getByRole("button", { name: "Create the wash" }).click();
  await page.waitForURL(/\/tickets\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await page.goto(`/d/${id}`);
  await expect(main(page).getByTestId("wash-queue")).toContainText("LT123AB");
  await main(page).getByTestId("wash-queue").getByRole("button", { name: "Ready" }).click();
  await toast(page, "is ready");
  await main(page).getByTestId("wash-queue").getByRole("button", { name: "Collected…" }).click();
  await main(page).getByTestId("ticket-actions").getByRole("button", { name: "Collected" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Collected" }).click();
  await toast(page, "collected");
  await page.goto(`/d/${id}/workers`);
  await expect(main(page).getByRole("row").filter({ hasText: "Paul" })).toContainText("1 200");
});

test("the Boss sees the four departments' figures on his overview", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, boss.email, boss.password);
  await page.goto("/boss");
  await expect(main(page).getByText("Sales today").first()).toBeVisible({ timeout: 60_000 });
  await expect(main(page).getByText(/Washed today/).first()).toBeVisible();
});

/** Every page of the four types opens without a server error, an error screen, a console error, a horizontal scroll or a serious accessibility problem. */
async function visitAll(page, paths) {
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|React DevTools|404 \(Not Found\)|Download the/.test(m.text())) problems.push(`${page.url()} console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => problems.push(`${page.url()} pageerror: ${e.message.slice(0, 300)}`));
  for (const path of paths) {
    const res = await page.goto(path);
    if ((res?.status() ?? 0) >= 400) problems.push(`${path} HTTP ${res.status()}`);
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    if (/Application error|Unhandled Runtime Error|Something went wrong|This page could not be found/i.test(body)) problems.push(`${path} shows an error screen`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) problems.push(`${path} scrolls horizontally by ${overflow}px`);
    const result = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
    for (const v of result.violations.filter((x) => ["serious", "critical"].includes(x.impact))) problems.push(`${path} a11y ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  }
  return problems;
}

test("every page of the four types opens cleanly, for the manager and for the Boss", async ({ page }) => {
  test.setTimeout(420_000);
  const common = ["", "/money", "/reports", "/search?q=ri", "/settings"];
  const byType = {
    "Corner Shop": ["/sell", "/products", "/stock", "/purchases", "/purchases?tab=bills", "/debts", "/cash-handover"],
    "Le Bar": ["/sell", "/products", "/stock", "/crates", "/purchases", "/debts"],
    "Clean Pressing": ["/tickets", "/tickets?view=collected", "/tickets/new", "/prices", "/customers"],
    "Speed Wash": ["/tickets", "/tickets/new", "/prices", "/workers", "/customers"],
  };
  await login(page, head.email, head.password);
  await page.goto(`/d/${ids["Corner Shop"]}/products`);
  const product = await main(page).getByRole("link", { name: "Rice 5 kg" }).getAttribute("href");
  await page.goto(`/d/${ids["Clean Pressing"]}/tickets?view=collected`);
  const ticket = await main(page).getByRole("link", { name: /^TK-/ }).first().getAttribute("href");
  const headPaths = [product, ticket, `${ticket}/documents/slip`, `${ticket}/documents/invoice`, ...Object.entries(byType).flatMap(([name, own]) => [...common, ...own].map((p) => `/d/${ids[name]}${p}`))];
  const problems = await visitAll(page, headPaths);
  await login(page, boss.email, boss.password);
  const bossPaths = Object.entries(byType).flatMap(([name, own]) => [...common, ...own.filter((p) => !["/sell", "/cash-handover", "/tickets/new"].includes(p))].map((p) => `/d/${ids[name]}${p}`));
  problems.push(...(await visitAll(page, ["/boss", ...bossPaths])));
  expect(problems).toEqual([]);
});
