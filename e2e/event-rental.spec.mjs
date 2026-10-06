import { expect, test } from "@playwright/test";
import { login } from "./support/login.mjs";

/**
 * Deco Diva (event & decoration rental) run through the real interface
 * (docs/EVENT_RENTAL_PLAN.md): the Boss creates the department with a manager; the manager fills
 * the stock, books the requirements' wedding (290 000 FCFA), is refused a booking that would need
 * more chairs than remain, and finds everything on the calendar and the customer's page.
 */
test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const boss = { name: "Diva Owner", email: `downer-${tag}@e2e.local`, password: "Plantain-2468" };
const head = { name: "Diva Manager", email: `dmanager-${tag}@e2e.local`, password: "" };
let deptId = "";

/** Today + n days as YYYY-MM-DD (Africa/Douala = UTC+1). */
const dayKey = (n) => new Date(Date.now() + 3600000 + n * 86400000).toISOString().slice(0, 10);
const label = (k) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${k}T00:00:00Z`));

async function toast(page, text) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 30_000 });
}

test("the Boss creates Deco Diva with its manager; its sidebar opens to its sections", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(boss.name);
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Diva Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Deco Diva");
  await page.getByRole("radio", { name: "Event & decoration rental" }).click();
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add a department head" }).click();
  await page.locator("#p-name-0").fill(head.name);
  await page.locator("#p-email-0").fill(head.email);
  await page.locator("#p-title-0").fill("Manager");
  head.password = await page.locator("#p-pass-0").inputValue();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  const deco = nav.getByTestId("dept-nav-Deco Diva");
  for (const name of ["Dashboard", "Calendar", "Bookings", "Customers", "Stock"]) await expect(deco.getByRole("link", { name, exact: true })).toBeVisible();
  deptId = (await deco.getByRole("link", { name: "Dashboard" }).getAttribute("href")).split("/")[2];
});

test("the manager fills the stock: items with their opening count, a correction", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/stock`);
  for (const [name, cat, price, buy, n] of [["Chairs", "Chairs", "500", "15000", "300"], ["Tables", "Tables", "5000", "40000", "30"], ["Plates", "Tableware", "200", "1500", "400"], ["Flowers", "Flowers", "5000", "8000", "20"]]) {
    await page.getByRole("button", { name: "Add an item" }).click({ timeout: 60_000 });
    const d = page.getByRole("dialog");
    await d.getByLabel("Item name").fill(name);
    await d.getByLabel("Category").fill(cat);
    await d.getByLabel("Rental price per event (FCFA)").fill(price);
    await d.getByLabel("Purchase price of one (FCFA)").fill(buy);
    await d.getByLabel("Units you have now").fill(n);
    await d.getByRole("button", { name: "Add to the stock" }).click();
    await toast(page, `${name} added to the stock`);
  }
  const sheet = page.locator("main").getByTestId("stock-sheet");
  await expect(sheet).toContainText("CHR-001");
  await expect(sheet).toContainText("300 / 300");
  await page.locator("main").getByTestId("item-Chairs").click();
  await page.getByRole("button", { name: "Correct the count" }).click();
  const c = page.getByRole("dialog");
  await c.getByLabel("Good units counted in the store").fill("298");
  await c.getByLabel("Reason").fill("Two broken chairs thrown away");
  await c.getByRole("button", { name: "Save the count" }).click();
  await toast(page, "count corrected");
  await expect(page.locator("main")).toContainText("Count corrected");
});

test("the manager books the requirements' wedding: 290 000 FCFA computed, items held", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/bookings/new`);
  await page.getByRole("button", { name: "New customer" }).click({ timeout: 60_000 });
  await page.locator("main").getByLabel("Customer name").fill("John");
  await page.locator("main").getByLabel("Phone").first().fill("677000001");
  await page.locator("main").getByLabel("Type of event").fill("Wedding");
  await page.locator("main").getByLabel("Event date").fill(dayKey(20));
  await page.locator("main").getByLabel("Location").fill("Hotel Akwa Palace");
  for (const [name, q] of [["Chairs", "200"], ["Tables", "20"], ["Plates", "200"], ["Flowers", "10"]]) {
    await page.getByRole("button", { name: `Add ${name}` }).click();
    await page.locator("main").getByLabel(`Quantity of ${name}`).fill(q);
  }
  await expect(page.locator("main").getByTestId("booking-total")).toContainText("290 000");
  await expect(page.getByText("Every item is available for these days.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirm the booking" }).click();
  await toast(page, "Booking B-0001 saved (290 000 FCFA)");
  await page.waitForURL(/\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.locator("main")).toContainText("Booking confirmed");
});

test("150 more chairs for the same days are refused; the calendar and the customer show the wedding", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/bookings/new?date=${dayKey(20)}`);
  await page.locator("main").getByPlaceholder("Find a customer by name or phone").fill("John", { timeout: 60_000 });
  await page.getByRole("button", { name: /John/ }).first().click();
  await page.locator("main").getByLabel("Type of event").fill("Birthday");
  await page.getByRole("button", { name: "Add Chairs" }).click();
  await page.locator("main").getByLabel("Quantity of Chairs").fill("150");
  await expect(page.getByText("Only 98 available")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Confirm the booking" })).toBeDisabled();
  await page.getByRole("button", { name: "Save as an inquiry" }).click();
  await toast(page, "Booking B-0002 saved");
  await page.waitForURL(/\/bookings\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Confirm the booking" }).click();
  await toast(page, `Insufficient chairs available for ${label(dayKey(20))}. Only 98 chairs are available.`);

  await page.goto(`/d/${deptId}/calendar?month=${dayKey(20).slice(0, 7)}`);
  await page.locator("main").getByTestId(`day-${dayKey(20)}`).click();
  const agenda = page.locator("main").getByTestId("day-agenda");
  await expect(agenda).toContainText("John");
  await expect(agenda).toContainText("200 × Chairs");
  await page.goto(`/d/${deptId}/calendar?view=items&from=${dayKey(19)}`);
  await expect(page.locator("main").getByTestId("availability-board")).toContainText("Chairs");

  await page.goto(`/d/${deptId}/customers`);
  await page.getByRole("link", { name: "John" }).click();
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.locator("main")).toContainText("B-0001", { timeout: 60_000 });
  await expect(page.locator("main")).toContainText("Wedding");
});

test("the wedding leaves and comes back 5 chairs short; the missing ones are charged; payments and documents", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/bookings?status=all`);
  await page.locator("main").getByTestId("order-B-0001").click({ timeout: 60_000 });
  await page.waitForURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();

  // A deposit by Mobile Money, with its receipt.
  await page.getByRole("button", { name: "Record a payment" }).click();
  const p = page.getByRole("dialog");
  await p.getByLabel("Amount received (FCFA)").fill("100000");
  await p.getByLabel("Paid by").selectOption("MOMO");
  await p.getByLabel("Transaction reference").fill("MP26.0001");
  await p.getByRole("button", { name: /Record 100 000/ }).click();
  await toast(page, "Payment RC-0001 recorded. Balance: 190 000 FCFA");
  await expect(page.locator("main")).toContainText("Deposit paid");

  // Dispatch: everything booked leaves.
  await page.getByRole("button", { name: "Dispatch the items" }).click();
  const ds = page.getByRole("dialog");
  await ds.getByLabel("Taken by").fill("Driver Paul");
  await ds.getByRole("button", { name: "Confirm: the items leave" }).click();
  await toast(page, "DN-0001: 430 item(s) out");
  await expect(page.locator("main").getByTestId("check-DN-0001")).toContainText("200 out");

  // Return: 195 chairs back, 3 damaged, 2 missing; the rest all good.
  await page.getByRole("button", { name: "Record a return" }).click();
  const rt = page.getByRole("dialog");
  await rt.getByLabel("Back good: Chairs").fill("195");
  await rt.getByLabel("Damaged: Chairs").fill("3");
  await rt.getByLabel("Missing: Chairs").fill("2");
  await expect(rt.getByTestId("short-Chairs")).toContainText("5 short");
  await rt.getByLabel("What happened: Chairs").fill("Rain at the venue");
  await rt.getByRole("button", { name: "Record the return" }).click();
  await toast(page, "GR-0001: 2 difference(s) to settle");
  await expect(page.locator("main")).toContainText("2 × Chairs missing");

  // The missing chairs are charged at their purchase price (no replacement value set).
  await page.getByRole("button", { name: /Settle IN-\d+/ }).last().click();
  const st = page.getByRole("dialog");
  await expect(st.getByLabel("Amount charged (FCFA)")).toHaveValue("30000");
  await st.getByRole("button", { name: "Save the decision" }).click();
  await toast(page, "charged (CH-0001)");
  await expect(page.locator("main")).toContainText("Charged to customer");

  // Documents: the receipt and the invoice (with the charge) are printable.
  await page.goto(`${bookingUrl}/documents/invoice`);
  const doc = page.locator("main").getByTestId("business-document");
  await expect(doc).toContainText("Invoice");
  await expect(doc).toContainText("2 × Chairs missing");
  await expect(doc).toContainText("320 000");
  await page.goto(bookingUrl);
  const receipt = await page.getByRole("link", { name: "Receipt" }).first().getAttribute("href");
  await page.goto(receipt);
  await expect(page.locator("main").getByTestId("business-document")).toContainText("RC-0001");
  await expect(page.locator("main").getByTestId("business-document")).toContainText("MP26.0001");
});

test("reports, search and the dashboard show the wedding, its profit and what needs attention", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, head.email, head.password);

  // Reports: the wedding counts on its date (290 000) and the charge on its own (30 000).
  await page.goto(`/d/${deptId}/reports?period=custom&from=${dayKey(0)}&to=${dayKey(30)}`);
  const report = page.locator("main").getByTestId("rental-report");
  await expect(report).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("main").getByTestId("report-kpis")).toContainText("320 000");
  await expect(report).toContainText("Wedding · John");
  await expect(report).toContainText("Profit per event");
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();

  // Search: by the customer's name and by the receipt number.
  await page.goto(`/d/${deptId}/search?q=John`);
  const results = page.locator("main").getByTestId("search-results");
  await expect(results).toContainText("Wedding · John", { timeout: 60_000 });
  await page.goto(`/d/${deptId}/search?q=RC-0001`);
  await expect(page.locator("main").getByTestId("search-results")).toContainText("RC-0001");

  // Dashboard: the damaged chairs wait for a decision; the wedding's balance is owed.
  await page.goto(`/d/${deptId}`);
  await expect(page.locator("main").getByTestId("attention-list")).toContainText("damaged", { timeout: 60_000 });
  await expect(page.locator("main").getByTestId("rental-kpis")).toContainText("Owed by customers");
});
