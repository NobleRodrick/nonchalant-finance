import { expect, test } from "@playwright/test";
import { login as signIn } from "./support/login.mjs";
import AxeBuilder from "@axe-core/playwright";
const login = (page, email, password, opts) => signIn(page, email, password, { clear: false, ...opts });

/**
 * Every page opens without a server error, an error screen, a console error or a serious
 * accessibility problem, for both roles: the Boss and department heads (one head of one
 * department, one head of two departments).
 * Pages a role may not use must be refused.
 */
test.describe.configure({ mode: "serial" });

const tag = `p${Date.now().toString(36)}`;
const boss = { email: `smoke-boss-${tag}@e2e.local`, password: "Baobab-1357" };
const people = {};
let dept = "";
let laundry = "";
const SHOTS = process.env.E2E_SCREENSHOTS;


async function visitAll(page, paths, { axe = false, shots = "" } = {}) {
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|React DevTools|404 \(Not Found\)|Download the/.test(m.text())) problems.push(`${page.url()} console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => problems.push(`${page.url()} pageerror: ${e.message.slice(0, 300)}`));
  for (const path of paths) {
    const res = await page.goto(path);
    if ((res?.status() ?? 0) >= 500) problems.push(`${path} HTTP ${res.status()}`);
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    if (/Application error|Unhandled Runtime Error|Something went wrong|This page could not be found/i.test(body)) problems.push(`${path} shows an error screen`);
    await expect(page, `${path} should not bounce to login`).not.toHaveURL(/\/login/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) problems.push(`${path} scrolls horizontally by ${overflow}px`);
    if (axe) {
      const result = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
      for (const v of result.violations.filter((x) => ["serious", "critical"].includes(x.impact))) {
        problems.push(`${path} a11y ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
      }
    }
    if (SHOTS && shots) {
      await page.screenshot({ path: `${SHOTS}/${shots}-${path.replace(/[/?=&]+/g, "_") || "root"}.png`, fullPage: true });
    }
  }
  return problems;
}

test("setup: owner, departments, two department heads (one heads two departments) and some records", async ({ page }) => {
  test.setTimeout(300_000); // the first test of a run also waits for the development server to compile the pages
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Smoke Owner");
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Company name").fill(`Smoke Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Department 1");
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByLabel("Department name").fill("Laundry");
  await page.getByRole("radio", { name: "Pressing (dress wash)" }).click();
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // Titles are free text; both are department heads. The accountant heads Department 1 and Laundry.
  for (const [i, [key, title, depts]] of [["MANAGER", "Manager", ["Department 1"]], ["ACCOUNTANT", "Accountant", ["Department 1", "Laundry"]]].entries()) {
    await page.getByRole("button", { name: "Add a department head" }).click();
    await page.locator(`#p-name-${i}`).fill(`${title} person`);
    await page.locator(`#p-email-${i}`).fill(`smoke-${key.toLowerCase()}-${tag}@e2e.local`);
    await page.locator(`#p-title-${i}`).fill(title);
    for (const dn of depts) await page.locator("label", { hasText: dn }).nth(i).click();
    people[key] = { email: `smoke-${key.toLowerCase()}-${tag}@e2e.local`, password: await page.locator(`#p-pass-${i}`).inputValue() };
  }
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);
  await page.goto("/boss/departments");
  for (const [name, set] of [["Department 1", (v) => (dept = v)], ["Laundry", (v) => (laundry = v)]]) {
    const card = page.locator("div.rounded-xl", { hasText: name }).filter({ has: page.getByRole("button", { name: "Edit" }) }).first();
    set((await card.getByRole("link", { name: "Open" }).getAttribute("href")).split("/")[2]);
  }
  // The Boss oversees; the department head records. A few records so every page has something to show.
  await expect(page.getByTestId("heads-Laundry")).toContainText("Accountant person");
  await expect(page.getByTestId("heads-Department 1")).toContainText("Manager person");
  await page.context().clearCookies();
  await login(page, people.MANAGER.email, people.MANAGER.password);
  await page.goto(`/d/${dept}/menu-stock`);
  await page.getByRole("button", { name: "Add dish" }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Dish name").fill("Dish 1");
  await d.getByLabel("Unit price (FCFA)").fill("1500");
  await d.getByLabel("Plates available now").fill("12");
  await d.getByRole("button", { name: "Add dish" }).click();
  await expect(page.getByTestId("dish-row-Dish 1")).toBeVisible();
  await page.goto(`/d/${dept}/sell`);
  await page.waitForLoadState("networkidle"); // the first visit compiles the page: tap once it is interactive
  await page.getByRole("button", { name: "Add Dish 1" }).click();
  await page.getByRole("button", { name: /Record sale/ }).click();
  await expect(page.getByRole("dialog")).toContainText("recorded");
});

test("Boss: every page", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, boss.email, boss.password);
  const pages = [
    "/boss", "/boss/daily-reports", "/boss/cash", "/boss/departments", "/boss/people", "/boss/settings",
    `/d/${dept}`, `/d/${dept}/menu-stock`, `/d/${dept}/money`, `/d/${dept}/debts`, `/d/${dept}/cash-handover`,
    `/d/${dept}/report`, `/d/${dept}/history`, `/d/${laundry}`, "/statements", "/statements?tab=cash", "/statements?tab=stock", "/statements?tab=debts",
    "/statements?period=week", "/profile", "/my-departments", "/",
  ];
  const problems = await visitAll(page, pages, { axe: true, shots: "boss" });
  expect(problems, problems.join("\n")).toEqual([]);
  // Oversight, not data entry: no selling, no stock or money buttons, a view-only strip.
  expect((await page.goto(`/d/${dept}/sell`)).status()).toBe(404);
  await page.goto(`/d/${dept}/menu-stock`);
  await expect(page.getByTestId("boss-view-only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add dish" })).toHaveCount(0);
  await page.goto(`/d/${dept}/money`);
  await expect(page.getByRole("button", { name: /^Record / })).toHaveCount(0);
  await page.goto(`/d/${dept}`);
  await expect(page.getByRole("heading", { name: "Department heads" })).toBeVisible();
  await expect(page.locator("main")).toContainText("Manager person");
  await expect(page.locator("main")).toContainText("Accountant person");
});

test("Department head: every page; the Boss's pages are refused", async ({ page }) => {
  await login(page, people.MANAGER.email, people.MANAGER.password);
  await expect(page).toHaveURL(new RegExp(`/d/${dept}$`));
  const problems = await visitAll(page, [`/d/${dept}`, `/d/${dept}/sell`, `/d/${dept}/menu-stock`, `/d/${dept}/money`, `/d/${dept}/debts`, `/d/${dept}/cash-handover`, `/d/${dept}/report`, `/d/${dept}/history`, "/statements", "/profile"], { axe: true, shots: "head" });
  expect(problems, problems.join("\n")).toEqual([]);
  await page.goto("/boss/people");
  await expect(page).not.toHaveURL(/\/boss\/people/);
  await page.waitForLoadState("networkidle"); // the redirect has arrived
  const res = await page.goto(`/d/${laundry}`);
  expect(res.status()).toBe(404);
});

test("A head of two departments: an overview of both, every page in each, full recording", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, people.ACCOUNTANT.email, people.ACCOUNTANT.password);
  await expect(page).toHaveURL(/\/d\/|\/my-departments/);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toContainText("Accountant · Department head");
  await nav.getByRole("link", { name: "All my departments" }).click();
  await expect(page.getByTestId("my-departments")).toContainText("Department 1");
  await expect(page.getByTestId("my-departments")).toContainText("Laundry");
  const problems = await visitAll(page, ["/my-departments", `/d/${dept}`, `/d/${dept}/sell`, `/d/${dept}/menu-stock`, `/d/${dept}/money`, `/d/${dept}/debts`, `/d/${dept}/cash-handover`, `/d/${dept}/report`, `/d/${dept}/history`, `/d/${laundry}`, "/statements", "/profile"], { axe: true, shots: "multihead" });
  expect(problems, problems.join("\n")).toEqual([]);
  await page.goto(`/d/${dept}/money`);
  await expect(page.getByRole("button", { name: "Record an expense", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record rent income", exact: true })).toBeVisible();
  await page.goto("/profile");
  await expect(page.locator("main")).toContainText("Departments you head");
  await expect(page.locator("main")).toContainText("Laundry");
});
