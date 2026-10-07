import { expect, test } from "@playwright/test";
import { login as signIn } from "./support/login.mjs";
const login = signIn;

/**
 * An event venue run through the real interface: the Boss creates the venue department and its
 * head; the head sets up the hall and its prices, books dates from the calendar (one event per
 * date), confirms, moves and cancels bookings (docs/VENUE_RENTAL_PLAN.md).
 */
test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const boss = { name: "Venue Owner", email: `vowner-${tag}@e2e.local`, password: "Plantain-2468" };
const head = { name: "Venue Head", email: `vhead-${tag}@e2e.local`, password: "" };
let deptId = "";
let stayId = "";

const fr = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Today + n days as YYYY-MM-DD (Africa/Douala = UTC+1). */
function dayKey(n) {
  const d = new Date(Date.now() + 3600000 + n * 86400000);
  return d.toISOString().slice(0, 10);
}


async function toast(page, text) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 30_000 });
}

test("the Boss creates an event venue department with its head", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(boss.name);
  await page.getByLabel("E-mail").fill(boss.email);
  await page.getByLabel("Password", { exact: true }).fill(boss.password);
  await page.getByRole("button", { name: /create account and continue/i }).click();
  await page.waitForURL(/\/onboarding/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Company name").fill(`Venue Company ${tag}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Salle Majestueuse");
  await page.getByRole("radio", { name: "Event venue / banquet hall" }).click();
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByLabel("Department name").fill("Executive Stay");
  await page.getByRole("radio", { name: "Rooms / guest house" }).click();
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add a department head" }).click();
  await page.locator("#p-name-0").fill(head.name);
  await page.locator("#p-email-0").fill(head.email);
  await page.locator("#p-title-0").fill("Events manager");
  await page.locator("label", { hasText: "Salle Majestueuse" }).first().click();
  await page.locator("label", { hasText: "Executive Stay" }).first().click();
  head.password = await page.locator("#p-pass-0").inputValue();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: /open the app/i }).click();
  await page.waitForURL(/\/boss/);
  // The Boss's sidebar: the business, then the venue opening to its own sections.
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  await expect(nav.getByTestId("dept-toggle-Salle Majestueuse")).toBeVisible();
  const venue = nav.getByTestId("dept-nav-Salle Majestueuse");
  await expect(venue.getByRole("link", { name: "Calendar" })).toBeVisible();
  await expect(venue.getByRole("link", { name: "Sell" })).toHaveCount(0);
  deptId = (await venue.getByRole("link", { name: "Dashboard" }).getAttribute("href")).split("/")[2];
  await nav.getByTestId("dept-toggle-Executive Stay").click();
  stayId = (await nav.getByTestId("dept-nav-Executive Stay").getByRole("link", { name: "Dashboard" }).getAttribute("href")).split("/")[2];
});

test("the head sets up the hall and its prices", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}`);
  await expect(page.locator("main").getByText("Start by setting up the hall")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Set up the hall" }).click();
  await page.waitForURL(/\/hall/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await page.locator("main").getByLabel("Name of the hall").fill("Salle Majestueuse");
  await page.locator("main").getByLabel("Capacity (guests)").fill("500");
  await page.locator("main").getByLabel("Base price of a date (FCFA)").fill("300000");
  await expect(page.getByRole("button", { name: "Set up the hall" })).toBeEnabled();
  await page.getByRole("button", { name: "Set up the hall" }).click();
  await toast(page, "Hall set up");
  await page.getByRole("button", { name: "Add a price" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Kind of price").selectOption("WEEKDAY");
  await d.getByLabel("Day of the week").selectOption("6");
  await d.getByLabel("Price of the date (FCFA)").fill("500000");
  await d.getByRole("button", { name: "Add the price" }).click();
  await toast(page, "Price added");
  await expect(page.locator("main").getByTestId("rules-WEEKDAY")).toContainText("Saturdays");
  await expect(page.locator("main").getByTestId("rules-WEEKDAY")).toContainText("500 000");
  await expect(page.locator("main").getByTestId("price-preview")).toContainText("Saturday price");
});

test("the head books a free date from the calendar; the date can no longer be booked", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/calendar`);
  const date = dayKey(3);
  if (date.slice(0, 7) !== dayKey(0).slice(0, 7)) await page.goto(`/d/${deptId}/calendar?month=${date.slice(0, 7)}`);
  const cell = page.locator("main").getByTestId(`day-${date}`);
  await expect(cell).toHaveAttribute("data-state", "AVAILABLE");
  await cell.click();
  const d = page.getByRole("dialog");
  await expect(d.getByLabel("Date of the event")).toHaveValue(date);
  await d.getByRole("button", { name: /New client/ }).click();
  await d.getByLabel("Client's name").fill("Ngono Family");
  await d.getByLabel("Phone", { exact: true }).fill("699001122");
  await d.getByLabel("Type of event").fill("Wedding");
  await d.getByLabel("Guests expected").fill("300");
  await d.getByRole("button", { name: "Reserve the date" }).click();
  await toast(page, "Booking B-0001 saved");
  await expect(cell).toHaveAttribute("data-state", "RESERVED");
  await expect(cell).toContainText("Ngono Family");

  // Another booking of the same date is refused in the form.
  await page.getByRole("button", { name: "New booking" }).click();
  const d2 = page.getByRole("dialog");
  await d2.getByLabel("Date of the event").fill(date);
  await expect(d2.getByText("This date is already booked.")).toBeVisible();
  await expect(d2.getByRole("button", { name: "Reserve the date" })).toBeDisabled();
  await page.keyboard.press("Escape");
});

test("the booking page: confirm, change the price, move the date, cancel", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/bookings`);
  await page.getByRole("link", { name: "B-0001" }).click();
  await expect(page.getByRole("heading", { name: "B-0001 · Wedding" })).toBeVisible({ timeout: 60_000 }); // first visit compiles the page (dev)
  await expect(page.locator("main").getByText("the date is held until")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await toast(page, "Booking confirmed");
  await expect(page.locator("main").getByTestId("booking-actions").getByRole("button", { name: "Confirm" })).toHaveCount(0);

  await page.getByRole("button", { name: "Change" }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Agreed price (FCFA)").fill("250000");
  await expect(d.getByRole("button", { name: "Save" })).toBeDisabled(); // a lower price needs a reason
  await d.getByLabel("Why is the price lower?").fill("Negotiated");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Booking updated");
  await expect(page.locator("main").getByText(`${fr(250000)} FCFA`).first()).toBeVisible();

  await page.getByRole("button", { name: "Move date" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("New date").fill(dayKey(10));
  await d.getByLabel("Why does the event move?").fill("Client asked");
  await d.getByRole("button", { name: "Move the booking" }).click();
  await toast(page, "Moved to");

  await page.getByRole("button", { name: "Cancel" }).first().click();
  d = page.getByRole("dialog");
  await d.getByLabel("Why is it cancelled?").fill("The family changed plans");
  await d.getByRole("button", { name: "Cancel the booking" }).click();
  await toast(page, "Booking cancelled");
  await expect(page.locator("main").getByText("Cancelled: The family changed plans. The date is free.")).toBeVisible();
  await expect(page.locator("main").getByText("Moved", { exact: true })).toBeVisible(); // history
  await page.getByRole("link", { name: "See it in the calendar" }).click();
  await expect(page.locator("main").getByTestId(`day-${dayKey(10)}`)).toHaveAttribute("data-state", "AVAILABLE");
});

test("payments with receipts and proof, a charge, the statement; the cash reaches the drawer", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/bookings`);
  await page.getByRole("button", { name: "New booking" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Date of the event").fill(dayKey(15));
  await d.getByRole("button", { name: /New client/ }).click();
  await d.getByLabel("Client's name").fill("Société Alpha");
  await d.getByLabel("Type of event").fill("Corporate event");
  await d.getByLabel("Agreed price (FCFA)").fill("600000");
  await d.getByLabel("Status").selectOption("CONFIRMED");
  await d.getByRole("button", { name: "Book and confirm" }).click();
  await toast(page, "Booking B-0002 saved");
  await page.getByRole("link", { name: "B-0002" }).click();
  await expect(page.getByRole("heading", { name: "B-0002 · Corporate event" })).toBeVisible({ timeout: 60_000 });

  // A deposit in cash.
  await page.getByRole("button", { name: "Record a payment" }).click();
  let p = page.getByRole("dialog");
  await p.getByLabel("Amount received (FCFA)").fill("200000");
  await p.getByLabel("Received by").fill("Aline");
  await p.getByLabel("Remarks").fill("Deposit");
  await p.getByRole("button", { name: /^Record/ }).click();
  await toast(page, "Payment RC-0001 recorded. Balance: 400 000 FCFA");
  await expect(page.locator("main").getByText("Deposit / partly paid").first()).toBeVisible();

  // Mobile Money needs its reference; a proof is attached.
  await page.getByRole("button", { name: "Record a payment" }).click();
  p = page.getByRole("dialog");
  await p.getByLabel("Amount received (FCFA)").fill("150000");
  await p.getByLabel("Paid by").selectOption("MOMO");
  await expect(p.getByRole("button", { name: /^Record/ })).toBeDisabled();
  await p.getByLabel("Transaction reference").fill("MP261010.1234.A");
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c489", "hex");
  await p.getByTestId("proof-input").setInputFiles({ name: "momo.png", mimeType: "image/png", buffer: png });
  await p.getByRole("button", { name: /^Record/ }).click();
  await toast(page, "Payment RC-0002 recorded. Balance: 250 000 FCFA");
  await expect(page.getByRole("link", { name: "momo.png" })).toBeVisible();

  // An extra service is charged.
  await page.getByRole("button", { name: "Add a charge" }).click();
  const c = page.getByRole("dialog");
  await c.getByLabel("What is charged").fill("Two extra hours");
  await c.getByLabel("Amount (FCFA)").fill("50000");
  await c.getByRole("button", { name: "Add the charge" }).click();
  await toast(page, "Charge CH-0001 added");

  // The receipt of the first payment.
  await page.getByRole("link", { name: "RC-0001", exact: true }).click();
  const r = page.locator("main").getByTestId("receipt");
  await expect(r).toContainText("Société Alpha", { timeout: 60_000 });
  await expect(r).toContainText("Corporate event");
  await expect(r).toContainText("600 000 FCFA"); // total at that time (the charge came later)
  await expect(r).toContainText("Amount paid now200 000 FCFA");
  await expect(r).toContainText("Outstanding balance400 000 FCFA");
  await expect(r).toContainText("Aline");
  await expect(r).toContainText("Deposit");
  await page.getByRole("link", { name: "← B-0002" }).click();
  await page.getByRole("link", { name: "Statement", exact: true }).click();
  const s = page.locator("main").getByTestId("statement-doc");
  await expect(s).toContainText("Two extra hours", { timeout: 60_000 });
  await expect(s).toContainText("Balance due300 000 FCFA");

  // The cash payment is in the drawer: the head can hand it over.
  await page.goto(`/d/${deptId}/cash-handover`);
  await expect(page.getByRole("heading", { name: "Cash to Boss" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("main").getByText("200 000 FCFA").first()).toBeVisible();
  await page.goto(`/d/${deptId}/money`);
  await expect(page.locator("main").getByText("Received from clients", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("main").getByText("RC-0002")).toBeVisible();
});

test("a package with a free room at Executive Stay: the room is given and occupied there", async ({ page }) => {
  await login(page, head.email, head.password);
  // The head of both departments: each opens to its own sections.
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  await expect(nav.getByTestId("dept-toggle-Salle Majestueuse")).toBeVisible();
  await expect(nav.getByTestId("dept-toggle-Executive Stay")).toBeVisible();

  // Executive Stay: two rooms.
  await page.goto(`/d/${stayId}/rooms`);
  for (const name of ["101", "102"]) {
    await page.getByRole("button", { name: "Add an apartment" }).click({ timeout: 60_000 });
    const d = page.getByRole("dialog");
    await d.getByLabel("Name or number").fill(name);
    await d.getByLabel("Rate of a night (FCFA)").fill("35000");
    await d.getByRole("button", { name: "Add the apartment" }).click();
    await toast(page, "Apartment added");
  }

  // The venue: a package with one free room.
  await page.goto(`/d/${deptId}/packages`);
  await page.getByRole("button", { name: "New package" }).click();
  const p = page.getByRole("dialog");
  await p.getByLabel("Name").fill("Hall + Executive room");
  await p.getByLabel("Price added to the hall (FCFA)").fill("50000");
  await p.getByLabel("Kind").selectOption("ROOM");
  await p.getByLabel("What").fill("Free room at Executive Stay");
  await p.getByRole("button", { name: "Create the package" }).click();
  await toast(page, "Package created");
  await expect(page.locator("main").getByTestId("package-Hall + Executive room")).toContainText("Free room at Executive Stay (1 night)");

  // A booking with the package; its room is given.
  await page.goto(`/d/${deptId}/bookings`);
  await page.getByRole("button", { name: "New booking" }).click();
  const b = page.getByRole("dialog");
  await b.getByLabel("Date of the event").fill(dayKey(20));
  await b.getByRole("button", { name: /New client/ }).click();
  await b.getByLabel("Client's name").fill("Famille Eto");
  await b.getByLabel("Type of event").fill("Wedding");
  await b.getByLabel("Package").selectOption({ label: "Hall + Executive room (+50 000 FCFA)" });
  await expect(b.getByTestId("booking-price")).toContainText("350 000 FCFA");
  await b.getByRole("button", { name: "Reserve the date" }).click();
  await toast(page, "Booking B-0003 saved");
  await page.getByRole("link", { name: "B-0003" }).click();
  await expect(page.locator("main").getByText("Rooms of the package (0 of 1 given)")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Give a room" }).click();
  const a = page.getByRole("dialog");
  await a.locator("#al-room").selectOption({ label: "101" });
  await a.getByRole("button", { name: "Give the room" }).click();
  await toast(page, "Room 101 given (RB-0001)");
  await expect(page.locator("main").getByText("Rooms of the package (1 of 1 given)")).toBeVisible();

  // Executive Stay shows the room as taken that night, free with the package.
  await page.goto(`/d/${stayId}/occupancy?from=${dayKey(18)}`);
  await expect(page.locator("main").getByTestId(`night-101-${dayKey(20)}`)).toHaveAttribute("aria-label", /Famille Eto \(free with a venue package\)/, { timeout: 60_000 });
  await page.goto(`/d/${stayId}/stays`);
  await expect(page.locator("main").getByText("Free (venue package)")).toBeVisible({ timeout: 60_000 });
});

test("assets checked before and after an event: the difference is charged to the client or recorded as a loss", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/assets`);
  await page.getByRole("button", { name: "Add an asset" }).click({ timeout: 60_000 });
  const a = page.getByRole("dialog");
  await a.getByLabel("Name").fill("Chairs");
  await a.getByLabel("Units owned").fill("100");
  await a.getByLabel("Value of one unit (FCFA)").fill("8000");
  await a.getByRole("button", { name: "Add the asset" }).click();
  await toast(page, "Asset added");

  await page.goto(`/d/${deptId}/bookings`);
  await page.getByRole("link", { name: "B-0003" }).click();
  await page.getByRole("button", { name: "Check before the event" }).click({ timeout: 60_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Save the check" }).click();
  await toast(page, "Check saved: nothing missing or damaged");

  await page.getByRole("button", { name: "Check after the event" }).click();
  const c = page.getByRole("dialog");
  await c.getByLabel("Chairs good").fill("95");
  await c.getByLabel("Chairs damaged").fill("3");
  await expect(c).toContainText("+3 damaged, +2 missing");
  await c.getByRole("button", { name: "Save the check" }).click();
  await toast(page, "2 difference(s) to settle");

  await page.getByRole("row", { name: /3 × Chairs damaged/ }).getByRole("button", { name: "Settle" }).click();
  const s = page.getByRole("dialog");
  await expect(s.getByLabel("Amount charged (FCFA)")).toHaveValue("24000");
  await s.getByRole("button", { name: "Settle" }).click();
  await toast(page, "24 000 FCFA charged to the client");
  await page.getByRole("row", { name: /2 × Chairs missing/ }).getByRole("button", { name: "Settle" }).click();
  const s2 = page.getByRole("dialog");
  await s2.getByLabel("What happens").selectOption("LOSS");
  await s2.getByRole("button", { name: "Settle" }).click();
  await toast(page, "Difference settled");
  await expect(page.locator("main").getByText("3 × Chairs damaged").first()).toBeVisible();
  await expect(page.locator("main").getByText("Charged to the client").first()).toBeVisible();
  await page.goto(`/d/${deptId}/assets`);
  await expect(page.getByRole("row", { name: /Chairs/ }).first()).toContainText("98"); // 2 missing left the inventory
});

test("leads: recorded, one lost with its reason, one booked; the conversion rate follows", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}/leads`);
  for (const [name, source] of [["Mme Ekane", "Facebook"], ["M. Tchoua", "Referral"]]) {
    await page.getByRole("button", { name: "New lead" }).click({ timeout: 60_000 });
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill(name);
    await d.getByLabel("Source").fill(source);
    await d.getByLabel("Type of event").fill("Birthday");
    await d.getByRole("button", { name: "Record the lead" }).click();
    await toast(page, "Lead recorded");
  }
  await page.getByRole("button", { name: "Change M. Tchoua" }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Status").selectOption("LOST");
  await d.getByLabel("Why was it lost?").fill("Chose another venue");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Lead updated");

  await page.getByRole("row", { name: /Mme Ekane/ }).getByRole("button", { name: "Book" }).click();
  d = page.getByRole("dialog");
  await expect(d.getByRole("heading", { name: "Book for Mme Ekane" })).toBeVisible();
  await d.getByLabel("Date of the event").fill(dayKey(40));
  await d.getByRole("button", { name: "Reserve the date" }).click();
  await toast(page, "Booking B-0004 saved");
  await expect(page.getByRole("row", { name: /Mme Ekane/ })).toContainText("Booked");
  await expect(page.locator("main").getByText("Conversion rate").locator("xpath=../..")).toContainText("50%");
});

test("dashboard, reports with a cash count, and the Boss's card of the venue", async ({ page }) => {
  await login(page, head.email, head.password);
  await page.goto(`/d/${deptId}`);
  const kpis = page.locator("main").getByTestId("venue-kpis");
  await expect(kpis).toContainText("Revenue", { timeout: 60_000 });
  await expect(kpis).toContainText("Still owed by clients");
  await expect(page.locator("main").getByTestId("venue-upcoming")).toContainText("Mme Ekane");
  await expect(page.getByRole("heading", { name: "Revenue by month" })).toBeVisible();

  await page.goto(`/d/${deptId}/reports`);
  await expect(page.getByRole("heading", { name: "Income statement" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "This month", exact: true }).click();
  await expect(page).toHaveURL(/period=month/);
  await expect(page.getByRole("heading", { name: "Balances owed by clients" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Mme Ekane/ })).toBeVisible();

  // Count the cash 1 000 short: an explanation is required, then the count is listed.
  const box = page.locator("main").getByTestId("cash-count");
  const expected = Number((await box.locator("strong").first().innerText()).replace(/\D/g, ""));
  await box.getByLabel("Cash counted (FCFA)").fill(String(expected - 1000));
  await expect(box.getByText("1 000 FCFA short.")).toBeVisible();
  await expect(box.getByRole("button", { name: "Record count" })).toBeDisabled();
  await box.getByLabel(/Why is it different/).fill("Change given to the decorator");
  await box.getByRole("button", { name: "Record count" }).click();
  await toast(page, "1 000 FCFA short");
  await expect(page.getByRole("row", { name: /Change given to the decorator/ })).toBeVisible({ timeout: 30_000 });

  // The Boss sees the venue's card with its own figures and the discrepancy.
  await login(page, boss.email, boss.password);
  await page.goto("/boss");
  await expect(page.locator("main").getByText("Received from clients").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("main").getByText(/cash discrepancies/).first()).toBeVisible();
});
