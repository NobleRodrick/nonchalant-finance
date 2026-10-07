import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./support/login.mjs";

/**
 * Production, farm and salon / gym through the real interface: the Boss creates a bakery, a farm
 * and a salon with their manager; the bakery adds flour and bread, a recipe, a batch, and sells
 * bread at the till; the farm starts a poultry band, feeds it from stock, records deaths and eggs,
 * sells birds; the salon books an appointment that opens a visit on arrival, sells a membership
 * and checks the member in; every page opens cleanly for the manager and the Boss.
 */
test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const boss = { name: "Makers Owner", email: `mkowner-${tag}@e2e.local`, password: "Plantain-2468" };
const head = { name: "Makers Manager", email: `mkmanager-${tag}@e2e.local`, password: "" };
const DEPTS = [["Golden Bakery", "Production (bakery, workshop)"], ["Green Farm", "Farm (livestock, crops, fish)"], ["Bella Salon", "Salon, spa or gym"]];
const ids = {};
let batchUrl = "";
const main = (page) => page.locator("main");
async function toast(page, text) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 30_000 });
}
async function addProduct(page, { name, kind, unit, price, cost, opening }) {
  await main(page).getByRole("button", { name: "Add a product" }).click({ timeout: 60_000 });
  const d = page.getByRole("dialog");
  await d.locator("#pr-n").fill(name);
  if (kind) await d.locator("#pr-k").selectOption(kind);
  await d.locator("#pr-u").fill(unit);
  if (price) await d.locator("#pr-p").fill(price);
  if (cost) await d.locator("#pr-cp").fill(cost);
  if (opening) await d.locator("#pr-o").fill(opening);
  await d.getByRole("button", { name: "Add", exact: true }).click();
  await toast(page, `${name} added`);
}

test("the Boss creates a bakery, a farm and a salon with their manager", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(boss.name);
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Makers Company ${tag}`);
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
  for (const [name] of DEPTS) ids[name] = (await main(page).getByRole("link", { name, exact: true }).first().getAttribute("href", { timeout: 60_000 })).split("/")[2];
});

test("bakery: flour and bread, a recipe, a batch at its real cost, bread sold at the till", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, head.email, head.password);
  const id = ids["Golden Bakery"];
  await page.goto(`/d/${id}/products`);
  await addProduct(page, { name: "Flour", kind: "RAW", unit: "kg", cost: "500", opening: "100" });
  await addProduct(page, { name: "Baguette", kind: "GOODS", unit: "loaf", price: "150" });
  await page.goto(`/d/${id}/recipes`);
  await main(page).getByRole("button", { name: "Add a recipe" }).click({ timeout: 60_000 });
  let d = page.getByRole("dialog");
  await d.locator("#rc-y").fill("100");
  await d.getByLabel("Material", { exact: true }).selectOption({ label: "Flour (kg)" });
  await d.getByLabel("Quantity", { exact: true }).fill("25");
  await expect(d).toContainText("125");
  await d.getByRole("button", { name: "Save the recipe" }).click();
  await toast(page, "Recipe saved");
  await expect(main(page).getByTestId("recipes")).toContainText("4 round(s) possible");

  await page.goto(`/d/${id}/production`);
  await main(page).getByRole("button", { name: "Record a batch" }).click({ timeout: 60_000 });
  d = page.getByRole("dialog");
  await d.locator("#pb-pl").fill("200");
  await d.locator("#pb-pr").fill("190");
  await expect(d.getByTestId("batch-materials")).toContainText("Flour: 50 kg");
  await d.getByRole("button", { name: "Record the batch" }).click();
  await toast(page, "a unit");
  await expect(main(page).getByRole("row").filter({ hasText: "Baguette" }).first()).toContainText("25 000");

  await page.goto(`/d/${id}/sell`);
  await expect(main(page).getByTestId("pos-products")).not.toContainText("Flour");
  const search = main(page).getByTestId("pos-search");
  await search.fill("Baguette");
  await search.press("Enter");
  await main(page).getByLabel("Quantity of Baguette").fill("10");
  await main(page).getByRole("button", { name: "Record the sale" }).click();
  await toast(page, "recorded");
  await page.goto(`/d/${id}/stock`);
  await expect(main(page).getByRole("row").filter({ hasText: "Baguette" })).toContainText("180 loaf");
});

test("farm: a poultry band fed from stock, deaths and eggs recorded, birds sold; the batch's profit", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, head.email, head.password);
  const id = ids["Green Farm"];
  await page.goto(`/d/${id}/products`);
  await addProduct(page, { name: "Broiler feed", kind: "RAW", unit: "bag", cost: "15000", opening: "10" });
  await addProduct(page, { name: "Eggs tray", kind: "GOODS", unit: "tray", price: "2500" });
  await page.goto(`/d/${id}/batches`);
  await main(page).getByRole("button", { name: "Start a batch" }).click({ timeout: 60_000 });
  const d = page.getByRole("dialog");
  await d.locator("#fb-n").fill("Layers house 1");
  await d.locator("#fb-c").fill("500");
  await d.getByRole("button", { name: "Start the batch" }).click();
  await toast(page, "Layers house 1 started");
  await main(page).getByTestId("batch-card").filter({ hasText: "Layers house 1" }).click();
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}/);
  batchUrl = new URL(page.url()).pathname;
  const actions = main(page).getByTestId("batch-actions");
  const event = async (button, fill) => {
    await actions.getByRole("button", { name: button }).click();
    const dlg = page.getByRole("dialog");
    await fill(dlg);
    await dlg.getByRole("button", { name: "Record", exact: true }).click();
    await toast(page, "Recorded");
  };
  await event("Feeding", async (dlg) => {
    await dlg.locator("#fe-p").selectOption({ index: 1 });
    await dlg.locator("#fe-q").fill("2");
  });
  await event("Deaths / losses", async (dlg) => dlg.locator("#fe-q").fill("5"));
  await event("Produce / harvest", async (dlg) => {
    await dlg.locator("#fe-p").selectOption({ index: 1 });
    await dlg.locator("#fe-q").fill("10");
  });
  await actions.getByRole("button", { name: "Sell" }).click();
  const sell = page.getByRole("dialog");
  await sell.locator("#fs-q").fill("20");
  await sell.locator("#fs-a").fill("70000");
  await sell.getByRole("button", { name: "Record the sale" }).click();
  await toast(page, "recorded");
  const figures = main(page).getByTestId("batch-figures");
  await expect(figures).toContainText("475 birds");
  await expect(figures).toContainText("40 000"); // profit: 70 000 − 2 bags × 15 000
  await page.goto(`/d/${id}/stock`);
  await expect(main(page).getByRole("row").filter({ hasText: "Eggs tray" })).toContainText("10 tray");
  await expect(main(page).getByRole("row").filter({ hasText: "Broiler feed" })).toContainText("8 bag");
});

test("salon: an appointment opens a visit on arrival; a membership sold and checked in", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, head.email, head.password);
  const id = ids["Bella Salon"];
  await page.goto(`/d/${id}/prices`);
  await main(page).getByRole("button", { name: "Add a service" }).click({ timeout: 60_000 });
  let d = page.getByRole("dialog");
  await d.locator("#si-n").fill("Braids");
  await d.locator("#si-p").fill("8000");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Price list saved");
  await page.goto(`/d/${id}/workers`);
  await main(page).getByRole("button", { name: "Add a staff member" }).click({ timeout: 60_000 });
  await page.getByRole("dialog").locator("#wk-n").fill("Aïcha");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Saved");

  await page.goto(`/d/${id}/appointments`);
  await main(page).getByRole("button", { name: "Book an appointment" }).click({ timeout: 60_000 });
  d = page.getByRole("dialog");
  await d.locator("#ap-n").fill("Mme Fotso");
  await d.locator("#ap-w").selectOption({ label: "Aïcha" });
  await d.locator("#ap-t").fill("10:00");
  await d.getByRole("button", { name: "Book", exact: true }).click();
  await toast(page, "Appointment booked");
  const card = main(page).getByTestId("appointment").filter({ hasText: "Mme Fotso" });
  await card.getByRole("button", { name: "Arrived" }).click();
  await toast(page, "visit opened");
  await expect(card.getByRole("link", { name: /Visit TK-/ })).toBeVisible();

  await page.goto(`/d/${id}/memberships`);
  await main(page).getByRole("button", { name: "Add a plan" }).click({ timeout: 60_000 });
  d = page.getByRole("dialog");
  await d.locator("#pl-n").fill("Gym – 1 month");
  await d.locator("#pl-p").fill("15000");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Plan saved");
  await main(page).getByRole("button", { name: "Sell a membership" }).click();
  d = page.getByRole("dialog");
  await d.locator("#ms-n").fill("Paul Ndi");
  await d.locator("#ms-ph").fill("677333444");
  await d.getByRole("button", { name: "Sell", exact: true }).click();
  await toast(page, "sold");
  await main(page).getByRole("row").filter({ hasText: "Paul Ndi" }).getByRole("button", { name: "Check in" }).click();
  await toast(page, "checked in");
  await expect(main(page).getByRole("row").filter({ hasText: "Paul Ndi" })).toContainText("1 visit(s)");
  await page.goto(`/d/${id}`);
  await expect(main(page).getByTestId("salon-today")).toContainText("15 000");
});

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

test("every page of the three types opens cleanly, for the manager and for the Boss", async ({ page }) => {
  test.setTimeout(420_000);
  const common = ["", "/money", "/reports", "/search?q=pa", "/settings"];
  const byType = {
    "Golden Bakery": ["/sell", "/production", "/recipes", "/products", "/stock", "/purchases", "/debts"],
    "Green Farm": ["/batches", "/batches?show=all", "/sell", "/products", "/stock", "/purchases", "/debts"],
    "Bella Salon": ["/appointments", "/tickets", "/tickets/new", "/memberships", "/memberships?view=all", "/prices", "/workers", "/customers"],
  };
  await login(page, head.email, head.password);
  const headPaths = [batchUrl, ...Object.entries(byType).flatMap(([name, own]) => [...common, ...own].map((p) => `/d/${ids[name]}${p}`))];
  const problems = await visitAll(page, headPaths);
  await login(page, boss.email, boss.password);
  const bossPaths = Object.entries(byType).flatMap(([name, own]) => [...common, ...own.filter((p) => !["/sell", "/tickets/new"].includes(p))].map((p) => `/d/${ids[name]}${p}`));
  problems.push(...(await visitAll(page, ["/boss", batchUrl, ...bossPaths])));
  expect(problems).toEqual([]);
});
