# Springer Finance: Restaurant System Implementation Plan (v2)

> **Status:** implemented (phases 0–12 and 14; phase 13 postponed by design), see [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) · **Written:** 26 Sep 2026 · **Scope:** RESTAURANT department domain.
> Other domains (Bar, Pressing, Car wash, Room rental, Material rental, Shop) are designed for but **not built** in this plan.
>
> **Audience:** the owner (product decisions) and any engineer or AI agent who will implement it.
> Each phase in §9 can be picked up on its own. It names the files to touch, the exact behaviour, the acceptance criteria and the tests that prove it.
>
> **Rule for implementers:** where this document and older documents disagree, this one wins.
> Related documents: `docs/IMPLEMENTATION_STATUS.md` (what is built and tested) and `README.md`.

---

## Table of contents

1. [How to use this document](#1-how-to-use-this-document)
2. [The requirements (owner's brief, normalised)](#2-the-requirements-owners-brief-normalised)
3. [Vocabulary and accounting rules](#3-vocabulary-and-accounting-rules)
4. [What the system does today (as-is architecture)](#4-what-the-system-does-today-as-is-architecture)
5. [Gap analysis: requirement by requirement](#5-gap-analysis-requirement-by-requirement)
6. [Target design](#6-target-design)
7. [Calculation contracts (the maths, exactly)](#7-calculation-contracts-the-maths-exactly)
8. [User interface specification](#8-user-interface-specification)
9. [Implementation phases (step by step, start to finish)](#9-implementation-phases-step-by-step-start-to-finish)
10. [Test plan and the reference day](#10-test-plan-and-the-reference-day)
11. [Files and features to delete](#11-files-and-features-to-delete)
12. [Data migration and go-live](#12-data-migration-and-go-live)
13. [Decisions taken, open questions and risks](#13-decisions-taken-open-questions-and-risks)
14. [Future domains (how the design extends)](#14-future-domains-how-the-design-extends)
15. [Definition of done](#15-definition-of-done)
16. [Additional recommendations](#16-additional-recommendations)

---

## 1. How to use this document

**Stack (unchanged):**

- Next.js 16 with the App Router, server actions and `proxy.js`, on React 19.
- Prisma 6 on PostgreSQL (Supabase).
- Tailwind 4 with shadcn/Radix primitives.
- `jose` JWT sessions.
- Vitest (unit and integration tests) and Playwright (end-to-end tests).

**Working rules for every phase:**

1. **One phase = one branch = one pull request.** Name it `feat/restaurant-v2-phase-N-<slug>`. Never mix phases.
2. **Write the test first** for every behaviour listed under "Acceptance". A phase is not done until its tests pass together with the whole existing suite: `npm run lint && npm test && npm run test:e2e && npm run build`.
3. **Schema changes only through migrations:** `npx prisma migrate dev --name <change>`. Never use `prisma db push`. Every migration that changes existing data must be idempotent (safe to run twice) and must be rehearsed on a copy of production (§12).
4. **Money is integer FCFA** (whole francs, no decimals). **Quantities are plates** (whole numbers in the restaurant domain, see §7.1). Use `lib/money.js` helpers only; never use `parseFloat` on money.
5. **Business day = Africa/Douala calendar day** (organisation time zone). Use `lib/timezone.js` only; never `new Date().toDateString()`.
6. **No silent edits of history.** A financial or stock record is never updated in place or deleted. It is voided with a reason, and/or a correcting movement is written. Every write creates an `AuditEvent`.
7. **One source of truth per number.** Every figure on any screen, report or statement comes from the calculation services in §7. UI components never compute totals themselves (except live previews inside an unsaved form).
8. **After every mutation, refresh every page that shows the changed number.** Use `revalidatePath` for all affected routes (listed per action in §9). The UI must never show stale values.

---

## 2. The requirements (owner's brief, normalised)

The owner's brief, split into numbered requirements. Each one is traced through the gap analysis (§5), the phases (§9) and the tests (§10).

### A. Clean product (no demo data in the product)

| ID | Requirement |
|---|---|
| **R1** | No example or "use-case" names anywhere in the product UI (for example "Bistro Restaurant", "Bistro Snackbar", "Chris Complex", "Sunrise Holdings", "Marie Accountant"). Placeholders must be neutral instructions ("Enter your company name"). |
| **R2** | Remove files and features that add nothing to the restaurant product. Keep the app lean and robust. |

### B. Organisation, departments, domains, people

| ID | Requirement |
|---|---|
| **R3** | When the Boss creates a department, he names it **and classifies it by business domain**. The domains are Restaurant, Bar, Pressing (dress wash), Car wash, Room rental, Material rental, Shop and Other. Restaurant is the default. |
| **R4** | The domain decides what the department sees: navigation, forms, dashboards, stock model and reports. A restaurant has a menu of dishes; a car wash does not. Only **Restaurant** is built now; the others are chosen and stored, but show a "coming soon" workspace. |
| **R5** | The Boss can assign the **same person to one or more departments**, of the same or different domains. That person can switch between their departments easily, and every screen clearly shows which department is active. |
| **R6** | The Boss is an **overseer**. His screens show the whole business from a distance: every department's figures, daily reports to review, cash handed over, debts, stock value, trends and alerts. He does not need to key in operations. |

### C. Money

| ID | Requirement |
|---|---|
| **R7** | **Money in** comes in exactly three ways: **Sales, Rent income, Other income.** |
| **R8** | **Money out** goes in exactly four ways: **Discounts, Purchases, Expenses, Other expenses.** |
| **R9** | **Debts** are amounts the department head records, owed by customers. They affect the daily report and all reports: credit given, repayments and outstanding balance. |
| **R10** | **Cash handed over to the CEO/Boss** is recorded with amount, date, receiver and proof. It is reconciled against the cash the department should have. |
| **R11** | **Every transaction is traceable:** who recorded it, when, what it changed, a reference number, and a link from any report line back to the source record. |
| **R12** | **Every digit shown is live and correct.** There are no dormant or placeholder values. A change anywhere updates every total that depends on it, immediately. |

### D. Stock and menu (restaurant)

| ID | Requirement |
|---|---|
| **R13** | In the restaurant domain, **stock is food/dish stock** (plates or portions). Beverages are **not** part of restaurant stock; they will come with the Bar domain. |
| **R14** | **Menu and stock are one thing, on one page.** The menu is the list of dishes; stock is how many plates of each dish are available. There are no separate "Menu" and "Stock" tabs. |
| **R15** | The department head can **add a dish** (name, unit price, quantity), **edit** its name, price and quantity, and **remove** it. |
| **R16** | **Adding stock** requires a clearly defined **name, unit price and amount added**. |
| **R17** | For each dish the page shows **Opening, Added, Sold and Closing** plates, and the **value**. The **total stock value** (sum of every dish's value) is calculated **in real time**. |
| **R18** | **Closing stock = Opening stock + Purchases/Stock added − Plates sold.** This is computed live, never typed in. |
| **R19** | **Opening stock** is set by the department head and **can be edited** by them. An edit triggers every dependent calculation (closing, value, report). |
| **R20** | When a sale is recorded, the plates sold are **deducted from stock automatically**, and stock value and totals update. **A sale can never exceed the plates in stock.** |

### E. Reports

| ID | Requirement |
|---|---|
| **R21** | The **daily report** of the department is **always available, live and printable at any time of the day**. |
| **R22** | At the **end of the day** the department head **sends** the detailed daily report to the Boss. It then appears in the Boss's **"Daily reports"** section, which can be filtered **by date and by department**. |
| **R23** | The daily report includes closing stock details: plates per dish and total value at end of day. It also shows sales, rent, other income, discounts, purchases, expenses, other expenses, debts (given, repaid, outstanding), cash expected, cash handed over and variance. |
| **R24** | **Financial statements** (day, week, month, custom) are **printable** and **top-notch in design**. They truly reflect money flows: income statement, cash movement, stock movement and debts. |

### F. Interface

| ID | Requirement |
|---|---|
| **R25** | A **fixed left sidebar** that cannot be collapsed on desktop. All screens are laid out for it and look presentable. |
| **R26** | **Easy to use for anyone:** plain words, few clicks, big clear numbers, no jargon, forms that prevent mistakes. |
| **R27** | The **stock page must be rebuilt**. The current one does not reflect the desired model (see R14–R20). |
| **R28** | **Industry-grade and thoroughly tested:** every behaviour has automated tests, and every number is verified against a hand-calculated reference day. |

---

## 3. Vocabulary and accounting rules

These definitions are binding. Use these exact words in the UI, the code (as enum names) and the reports.

### 3.1 People and places

| Term (UI) | Code | Meaning |
|---|---|---|
| **Boss** | `UserRole.ADMIN` | Owner or CEO of the organisation. Sees and administers everything. Reviews daily reports and confirms cash handovers. |
| **Department head** | `UserRole.MANAGER` (per-department override allowed) | Runs one or more departments. Manages the menu and stock, records all operations, submits the daily report. |
| **Cashier** | `UserRole.STAFF` | Records sales (and optionally debts and repayments) in assigned departments. Cannot edit the menu, prices or opening stock, and cannot submit the report. |
| **Accountant** | `UserRole.ACCOUNTANT` | Read access to all departments' reports and statements. Can record expenses. Cannot approve. |
| **Organisation** | `Organization` | The company. It has a name, currency (FCFA) and time zone (Africa/Douala). |
| **Department** | `Department` | An operating unit with **one domain** (Restaurant, Bar, …), its own cash drawer, menu, stock, ledger and daily report. |
| **Domain** | `DepartmentDomain` | The kind of business the department runs. Decides its modules (§6.6). |
| **Business day** | date key `YYYY-MM-DD` | 00:00–23:59:59 in the organisation's time zone. Every record belongs to exactly one business day, the one in its `date` field. |

### 3.2 Money

| Flow | UI name | Code (`TransactionType`) | Changes cash drawer? | In statements |
|---|---|---|---|---|
| In | **Sales** | `SALE` | Only the part paid in cash/MoMo/bank. The credit part creates a Debt. | Revenue, at the **gross** (menu price) value |
| In | **Rent income** | `RENT_INCOME` | Yes (by payment method) | Revenue |
| In | **Other income** | `OTHER_INCOME` | Yes | Revenue |
| Out | **Discounts** | recorded on the sale (`Transaction.discountAmount`) *and* standalone `DISCOUNT` (rare, for example a goodwill refund) | A discount on a sale reduces cash collected. A standalone discount is paid out of the drawer. | Deduction from revenue |
| Out | **Purchases** | `PURCHASE` | Yes, unless bought on supplier credit | Cost |
| Out | **Expenses** | `EXPENSE` | Yes | Operating expense |
| Out | **Other expenses** | `OTHER_EXPENSE` | Yes | Non-operating expense |
| Neither (receivable) | **Debt given** (credit) | `Debt` record (+ the credit part of a `SALE`, or a manual debt, §6.3) | No | Shown in the debt statement; the revenue is already in Sales |
| Neither (collection) | **Debt repaid** | `DEBT_PAYMENT` | Yes (cash in) | Cash flow only; **not** revenue again |
| Neither (transfer) | **Cash handed over to Boss** | `CASH_HANDOVER` | Yes (cash out of the drawer) | Cash movement only; **not** an expense |

**Principle:** revenue is counted **once**, when the sale happens (whether paid now or on credit). Collecting a debt later moves cash but is **not** new revenue. Handing cash to the Boss is **not** an expense; it is an internal transfer.

### 3.3 Stock (restaurant)

| Term | Meaning |
|---|---|
| **Dish** (menu item) | Something the restaurant sells by the plate or portion: name, unit price (FCFA) and optional description/category. **A dish is also its own stock line.** The "menu" is the list of active dishes. |
| **Plates in stock** | Portions of a dish ready to sell right now. A whole number. |
| **Opening stock (day D)** | Plates at the start of day D. By default this is the closing stock of day D−1. The department head can correct it for D (§7.4). |
| **Added** (stock added) | Plates added during day D: prepared, bought ready-made, or received. Each addition records the quantity and optionally what it cost. If it cost money, it is also a Purchase (§6.4). |
| **Sold** | Plates sold during day D. Taken automatically from sales. |
| **Spoiled** (optional line) | Plates thrown away. Hidden when zero. Recommended for real kitchens (§13). |
| **Closing stock (day D)** | `Opening + Added − Sold − Spoiled ± Corrections`. Always computed, never typed. |
| **Stock value** | `Plates × unit price` per dish; **total stock value** is the sum over dishes (§7.3 for the valuation basis). |

---

## 4. What the system does today (as-is architecture)

This describes the code **as it is now** in this folder (after the September 2026 upgrade). It was verified by reading every file and by the passing test suite: 23 unit tests, 32 integration tests and 9 browser tests.

> **Important:** some things the owner observed are from the **previous version** of the app, or from **data**, not from the current code:
>
> - **The collapsible sidebar** was in the old version. The current code already has a fixed sidebar.
> - **The names "Bistro Restaurant", "Bistro Snackbar" and "Chris Complex"** appear nowhere in the current source code (checked by search).
>   - The old demo seed created "Sunrise Bistro & Dining". It has been removed.
>   - The other names are either **records in the live Supabase database** (organisations or departments created during earlier testing) or **browser autofill** suggestions from earlier typing.
>
> Phase 0 (§9) makes sure the owner runs the current code, and Phase 1 removes the remaining example names and cleans the data.

### 4.1 Runtime architecture

```
Browser ──HTTP──▶ proxy.js (JWT cookie check, redirects)            [edge of the app]
                    │
                    ▼
        app/(auth)/*  login, register (public)
        app/(main)/*  every signed-in page (server components, force-dynamic)
                    │   reads through lib/* services (Prisma)
                    │   writes through actions/* ("use server" server actions)
                    ▼
        lib/action.js  runAction(): auth → permission → validation → prisma.$transaction
                        → audit event → structured JSON log → {success,data|error,errorId}
                    ▼
        PostgreSQL (Supabase) via Prisma 6.19 (lib/prisma.js; optional pg driver adapter)
        Background: Inngest (22:30 missing-report reminder, monthly statement e-mail)
        E-mail: Resend (emails/template.jsx) · AI: Gemini (insights, receipt scan)
```

### 4.2 Code layout (what each part does)

| Folder / file | Responsibility today |
|---|---|
| `proxy.js` | Protects every non-public route; verifies the JWT (`lib/jwt-secret.js`) and redirects to `/login?redirect=` with a safe return path. |
| `lib/auth.js`, `actions/auth.js` | Register the Boss, log in and out, session user, active department switch (cookie), profile and password. Login is rate-limited (`lib/rate-limit.js`). |
| `lib/permissions.js`, `lib/access.js` | Role → permission sets. `resolveDepartment(user, id, {permission, write, restaurant})` enforces membership and domain for every action. |
| `lib/domain-capabilities.js` | Domain registry: modules, transaction types, dashboard cards and report sections. Only `RESTAURANT` is active. |
| `lib/money.js`, `lib/timezone.js` | Integer FCFA, 3-decimal quantities, business-day boundaries. |
| `lib/classification.js`, `lib/ledger-service.js` | Classification of every transaction (revenue, cash, cost …), sale totals, weighted-average cost, cash reconciliation, debt status, inventory closing and recipe maths. |
| `lib/reporting-service.js` | `buildDailyClose` (the daily report model), `buildPeriodSummary`, `buildApprovedStatement`, `openingCashBefore`, `currentStockValue`, `outstandingDebts`. |
| `lib/inventory.js` | Atomic conditional stock decrements (`updateMany … where currentQuantity >= n`), which prevent overselling even with two cashiers. Writes `StockMovement`. |
| `lib/transaction-runner.js`, `lib/idempotency.js` | Idempotency keys, so a double-clicked Save posts once. |
| `lib/posting-guard.js` | Blocks postings into a closed accounting period or a submitted/locked day. |
| `lib/void-service.js` | Voids with a reason and reverses stock and cash effects. |
| `lib/audit.js`, `lib/observability.js`, `lib/errors.js` | Audit events, JSON logs, error ids. |
| `lib/attachments.js`, `app/api/attachments/[id]` | Proof uploads (receipts, handover slips) stored in the DB, type-sniffed, 5 MB limit, organisation-scoped. |
| `lib/dashboards.js` | Department dashboard, Boss dashboard, notifications. |
| `actions/menu.js` | Dishes: create, edit, deactivate/reactivate; plate movements (prepared, wasted, counted); **recipes** (dish → ingredient quantities); history. |
| `actions/stock.js` | **Ingredient stock items** (kg, litres …) with opening quantity/cost, weighted-average valuation, reorder level, movements; plus read-only legacy daily records. |
| `actions/sales.js` | Itemised POS sale: lines, discount with reason, payment method; CREDIT requires a debtor and creates a `Debt`. Stock is decremented atomically, for plates **or** recipe ingredients. |
| `actions/purchases.js` | Purchase with header and lines (**ingredients or dishes**), supplier, reference and proof. Raises stock quantity and weighted-average cost. |
| `actions/money.js` | Rent income, other income, expenses, other expenses, standalone discounts; void; ledger listing; AI receipt scan. |
| `actions/debts.js` | List debts, record repayments (partial allowed). **No way to create a debt except a credit sale.** |
| `actions/handovers.js` | Cash handover (drawer-balance check, reference, proof); Boss confirms or disputes. |
| `actions/daily-report.js` | Draft, submit (needs the counted cash), Boss review, approve or return (reopens the day), version history, inbox. |
| `actions/organization.js` | Onboarding, departments (with domain), employees with multi-department memberships and role overrides, settings. |
| `actions/periods.js` | Accounting periods (open/close). |
| `components/shell/*` | App shell: **fixed sidebar on desktop** (drawer on mobile), top bar with department switcher, business date, period and notifications. |
| `components/restaurant/*` | Workspace panels: POS, dishes, stock (ingredients), purchases, money, debts, handovers, the daily report document, close actions. |
| `components/reports/*`, `app/(main)/reports/*` | Statements page (day/week/month/custom, comparison, per department, print), Boss report inbox, daily report detail. |

### 4.3 Data model today (restaurant-relevant)

- **`Organization`** 1─* `Department` (with `domain`); `User` *─* `Department` through `UserDepartment` (`isPrimary`, `roleOverride`).
- **Money:** `Transaction` holds one row per business event. It has a type, amount, gross/discount/net, payment method, account, date, status (`VOIDED`), void reason and idempotency key. Details hang off it:
  - `SaleLine[]`
  - `Purchase` → `PurchaseLine[]`
  - `Debt` / `DebtPayment`
  - `CashHandover`
- **Stock: two parallel models.** This is the core problem, see §5.
  1. `DepartmentStockItem`: **ingredients** (unit, opening qty and cost, `currentQuantity`, `valuationUnitCost`, reorder level).
  2. `MenuItem`: **dishes** (`sellingPrice`, `costPrice`, `inventoryMode` = `DIRECT_PLATE` | `RECIPE`, `openingQuantity`, `currentQuantity`). A `RECIPE` dish has no plate stock; selling it consumes ingredients through `RecipeIngredient`.
  - `StockMovement` records every quantity change for either kind (`OPENING`, `PURCHASE`, `PREPARATION`, `USAGE`, `WASTE`, `DAMAGE`, `ADJUSTMENT`, `REVERSAL`), with `balanceAfter`.
- **Reports:** `DailyReport` (one per department per day; `snapshotJson`, `totalsJson`, status DRAFT → SUBMITTED → REVIEWED → APPROVED / RETURNED, version) and `InventorySnapshot` (per item at submission).
- **Control:** `AccountingPeriod`, `AuditEvent`, `Attachment`, `Account` (cash drawers).
- **Legacy (unused):**
  - tables: `DailyStockRecord`, `Budget`;
  - `Transaction` fields: `isRecurring`, `recurringInterval`, `nextRecurringDate`, `lastProcessed`, `isDebtPaid`, `purchaseSupplier`, `purchaseReference`;
  - enum values `INCOME` in `TransactionType`, and `PURCHASE_DRINK` / `SALE_DRINK` in `OperationCategory`.

### 4.4 Screens today (restaurant department)

| Sidebar entry | Route | What it shows |
|---|---|---|
| Dashboard | `/dashboard` | Department dashboard (or Boss dashboard for the Boss). |
| Restaurant Workspace | `/restaurant` | Five stat cards and **five tabs**: Sales (POS), Menu & dishes, Stock, Purchases, Income & expenses. |
| Menu & Dishes | `/menu` | Dish list with inventory mode, prepared/wasted/counted plates, recipes and history. |
| Stock Control | `/stock` | Ingredient list (units, reorder levels, movements) and a legacy table. |
| Sales (POS) | `/restaurant?tab=pos` | The same POS as the tab. |
| Income & Expenses | `/restaurant?tab=money` | The same as the tab. |
| Debts & Receivables | `/debts` | Debt ledger with repayments. |
| Cash Handover | `/cash-handover` | Handover list and form. |
| Daily Close | `/daily-close` | The live daily report document, counted cash, save draft, submit, print. |
| Transactions | `/transactions` | Ledger with filters and voids. |
| Statements | `/reports` | Period statements with print. |
| *(Boss)* Report inbox, Staff & roles, Departments, Cash drawers & accounts, Accounting periods, Organization settings | `/reports/inbox`, `/organization/*` | Administration. |

### 4.5 What already works well and must be kept

- Server-side authorisation on every action, plus membership and domain checks (`resolveDepartment`).
- Atomic, oversell-proof stock decrements, idempotent posting, voids with reasons, audit events, locked days after submission, accounting periods.
- Integer money and time-zone-correct business days.
- Multi-department memberships with a department switcher and per-department role override.
- Domain field on departments, with a capability registry and a placeholder for inactive domains.
- Daily report pipeline: live report → submit → Boss inbox → review, approve or return → version history.
- Cash handover with Boss confirmation or dispute.
- The test infrastructure: a disposable test database rebuilt from migrations, integration tests on real server actions, Playwright scenarios and the every-page smoke test.

---

## 5. Gap analysis: requirement by requirement

Legend: ✅ met · 🟡 partly met or needs redesign · ❌ missing or wrong. **Severity:** S1 = blocks the owner's model, S2 = important, S3 = polish.

| Req | Today | Gap | Sev | Fix (phase) |
|---|---|---|---|---|
| R1 No example names | 🟡 Old demo names are gone from code, but the onboarding placeholders still say "e.g. Sunrise Holdings", "e.g. Marie Accountant", "marie@company.com" and "e.g. Main Restaurant". The demo seed still creates "Demo Restaurant Group" and "Ndolé & plantain plate" (only when `ALLOW_DEMO_SEED=true`). Autofill is not disabled on name fields. Live DB may contain test organisations ("Chris Complex" …). | Neutral placeholders; `autoComplete="off"` on organisation/department/person-name inputs; demo seed moved out of the product; data review of the live DB. | S2 | P1 |
| R2 Lean app | 🟡 Ingredient stock, recipes, purchase-to-ingredient lines, weighted-average cost, legacy tables and fields, receipt AI scan and "Drinks" categories are all present. | Delete (§11) after the new stock model lands. | S2 | P1, P3, P13 |
| R3 Domain on department | ✅ Required in onboarding and department create/edit; `RESTAURANT` is the default; all eight domains are listed. | Wording: "Pressing (dress wash)"; show a short description of each domain; lock the domain once the department has records (already enforced); illustrate "coming soon". | S3 | P2 |
| R4 Tailored per domain | 🟡 The registry exists, but the restaurant modules are generic and duplicated (Workspace + Menu + Stock + POS + Money all overlap). Inactive domains get only a dashboard. | New restaurant module set (§8.3); a clean "coming soon" workspace for other domains; registry drives navigation, dashboard cards, report sections and allowed transaction types. | S2 | P2, P8 |
| R5 Multi-department people | ✅ Memberships, primary department, role override, switcher in the top bar. | UX: switcher at the **top of the sidebar** with the domain badge; "My departments" landing when the user has more than one; the active department is shown on every page header and on printed reports. | S3 | P8 |
| R6 Boss overview | 🟡 A Boss dashboard exists (today's totals, reports to review, handovers). No departments × days report calendar, no drill-down cards per department, no alerts centre, no e-mail on submission. | Boss home redesign (§8.6): KPI strip, department cards, report calendar, alerts, cash and debt positions, trend charts, notification e-mails. | S1 | P10, P11 |
| R7 Money in (3 ways) | ✅ `SALE`, `RENT_INCOME`, `OTHER_INCOME`. | UI must present exactly these three on one "Money" page with the same form pattern. | S3 | P6 |
| R8 Money out (4 ways) | 🟡 Discount lives on the sale and as a standalone `DISCOUNT`; `PURCHASE` is tied to ingredient and dish stock lines; `EXPENSE` and `OTHER_EXPENSE` are fine. | Purchases become a plain money-out record (supplier, what was bought, amount, proof) that can **optionally** add plates to a dish (§6.4). Discounts are reported as their own money-out line in every report. | S1 | P4, P6 |
| R9 Debts entered by the head | ❌ Debts are created **only** by a credit sale. There is no manual debt, no due date, no debtor directory. | Add **"Record a debt"** (manual receivable, §6.3) and a **debtor directory** (name, phone, balance). Debts given, repaid and outstanding go in the daily report and statements. | S1 | P5 |
| R10 Cash to CEO | ✅ Handover with drawer check, proof, Boss confirm/dispute. | Receipt-style printable handover slip; Boss "Cash received" screen per department and day; handover reference numbers. | S3 | P7, P10 |
| R11 Traceability | 🟡 Audit events and void reasons exist. There are no **human-readable reference numbers**; report lines don't link to source records; no audit viewer. | Document numbers per department and type (`S-0001`, `P-0001`, `E-…`, `D-…`, `H-…`), see §6.5; "View history" drawer on every record; clickable report lines. | S2 | P3, P9 |
| R12 Live, correct digits | 🟡 Totals come from services, but several pages compute their own sums (panels), and some actions do not revalidate every affected route (for example `/dashboard` after a sale). | One calculation service per figure (§7); a revalidation map per action (§9, P3); an invariant test suite (§10.3). | S1 | P3, P12 |
| R13 Food stock only | ❌ Ingredient stock (kg, litres), a "Drinks" purchase category and `SALE_DRINK` exist. | Restaurant stock = dishes/plates only. Remove drinks from restaurant categories. Beverages wait for the Bar domain. | S1 | P3 |
| R14 Menu = stock, one page | ❌ Separate `/menu` and `/stock` pages, plus two more tabs inside the Workspace. | One **"Menu & Stock"** page (§8.4). | S1 | P4 |
| R15 Add, edit, remove dish | 🟡 Add, edit and deactivate exist, but the form asks for an inventory mode and recipes (confusing); quantity cannot be edited directly. | Simple dish form: **Name, Unit price, Opening quantity**, optional description. Quantity edits go through **"Correct count"** (writes a correction movement with a reason, never a silent overwrite). "Remove" archives the dish (history kept). | S1 | P4 |
| R16 Add stock (name, unit price, amount) | ❌ Adding plates is hidden in "record dish movement → prepared". | **"Add stock"** dialog: choose the dish (or create a new one inline with name and unit price), **amount added**, optional cost paid → optional linked Purchase. | S1 | P4 |
| R17 Opening/Added/Sold/Closing + live value | 🟡 The data exists in `buildDailyClose.dishSummary`, but not as the main stock view. Value uses **cost price** (often 0), which leaves dormant zeros. | Main table on the Menu & Stock page with these columns per dish and a live total stock value (§7.3). | S1 | P4 |
| R18 Closing formula | 🟡 The formula exists inside reporting, including waste and adjustments. | Presented exactly as the owner writes it; spoiled and corrections shown only when non-zero (§7.2). | S1 | P3, P4 |
| R19 Editable opening stock | ❌ Opening quantity is set only at dish creation. There is no per-day opening and no edit. | Per-day **opening override**: editable by the head while the day is not submitted. It writes an `OPENING_CORRECTION` movement at 00:00 of that day and recalculates everything (§7.4). | S1 | P3, P4 |
| R20 Sale deducts stock; no oversell | ✅ Atomic, tested with concurrent sales. | Keep. The POS shows plates left on every dish button and disables "+" at the limit. Recipe-mode dishes are removed. | S3 | P5 |
| R21 Live daily report, printable any time | 🟡 `/daily-close` shows the live document and prints, but it looks like a form page, not a report; the print layout is basic. | A "Today's report" page with a professional A4 print layout (§8.7); always one click away in the sidebar. | S2 | P9 |
| R22 Send to Boss; Daily reports section by date and department | 🟡 Submission and inbox exist; the inbox is called "Report inbox" and filters by status, department and date. | Rename to **"Daily reports"**; add the departments × days **calendar grid** and the **list**; filters for date range, department and status; e-mail and in-app notification on submission. | S2 | P9, P10 |
| R23 Report contents | 🟡 Most sections exist. Missing: manual debts, per-dish value at the chosen price, discounts as their own money-out line, document numbers, signatures block on print. | New report template (§8.7). | S2 | P9 |
| R24 Top-notch statements | 🟡 The statements page exists (period, comparison, per department, print) but is plain tables. | Four statements with professional layout and charts: **Income statement, Cash movement, Stock movement, Debts** (§8.8); print and PDF; drill-down. | S1 | P11 |
| R25 Fixed sidebar | ✅ In the current code (not collapsible on desktop, drawer on phones). | Visual polish: width 264 px, grouped sections, active-department card at the top, content max width, consistent page headers (§8.2). | S3 | P8 |
| R26 Easy for anyone | 🟡 Jargon in places ("inventory mode", "recipe", "valuation", "posting"). Too many places to do the same thing. | Plain-language copy guide (§8.1); one place per job; confirmation summaries before saving money. | S2 | P8, all |
| R27 Rebuild the stock page | ❌ See R13–R19. | Phase 4. | S1 | P4 |
| R28 Tested | 🟡 55 unit/integration tests and 9 end-to-end tests exist, but none cover the new model. | Full test plan (§10), including the reference day with hand-checked numbers, invariants, visual and print checks, and accessibility. | S1 | P12 |

**Summary of the biggest gaps:**

1. **The stock model is wrong for this business.** It is an ingredient warehouse with recipes, where the owner wants a plate-based stock that *is* the menu.
2. **Menu and stock are split across four places.**
3. **Opening stock cannot be set per day or edited.**
4. **Debts cannot be entered by hand.**
5. **The Boss experience and the printed documents are functional but not "top-notch".**

Everything else is refinement of solid foundations.

---

## 6. Target design

### 6.1 Design principles

1. **One dish = one menu line = one stock line.** There are no ingredients, recipes or units other than "plate" in the restaurant domain.
2. **Movements are the truth.** A dish's plates at any moment are the sum of its stock movements up to that moment. `MenuItem.currentQuantity` is a cached copy, updated in the same database transaction as every movement, and checked by a nightly consistency job (§9 P13).
3. **Days are derived, never stored as editable numbers.**
   - Opening, Added, Sold, Spoiled, Corrections and Closing for any day are computed from movements.
   - The only per-day input is an **opening correction**, and it is itself a movement.
4. **Money records are append-only.** Mistakes are voided (with reason) or corrected by a new record.
5. **Every record has a reference number** that people can read aloud ("sale S-0142").
6. **The domain decides the modules.** Restaurant-specific code lives under `domains/restaurant/*`, and shared code under `lib/*` (§6.6).

### 6.2 Schema changes (Prisma)

The diff is against the current `prisma/schema.prisma`. Column names are kept where possible to avoid needless churn; UI names are in comments.

```prisma
// ── Dishes (menu = stock) ─────────────────────────────────────────────
model MenuItem {                          // UI: "Dish"
  id               String   @id @default(uuid())
  name             String                 // unique per department (case-insensitive, see index)
  description      String?
  section          String?                // optional menu section, e.g. free text "Main dishes"
  sellingPrice     Decimal                // UI: "Unit price" (FCFA, integer)
  costPrice        Decimal  @default(0)   // optional "Cost per plate" (for margin), 0 = unknown
  currentQuantity  Decimal  @default(0)   // cached plates in stock (integer in restaurant)
  lowStockLevel    Int      @default(0)   // warn when plates <= this (0 = off)
  sortOrder        Int      @default(0)
  isActive         Boolean  @default(true)   // false = removed from menu (archived)
  archivedAt       DateTime?
  // REMOVED: inventoryMode, openingQuantity, recipe[], purchaseLines[] (after migration P3)
  ...relations unchanged (organization, department, user, saleLines, movements, inventorySnapshots)
  @@unique([departmentId, name])
}

// ── Stock movements (plates) ──────────────────────────────────────────
enum StockMovementType {
  OPENING             // first quantity when the dish is created
  STOCK_ADDED         // NEW: plates added (prepared / bought ready / received)
  SOLD                // NEW name for USAGE by a sale (USAGE kept for history)
  SPOILED             // NEW name for WASTE/DAMAGE (old values kept for history)
  CORRECTION          // NEW name for ADJUSTMENT: signed, after a physical count
  OPENING_CORRECTION  // NEW: signed, dated 00:00 of the day, edits that day's opening
  REVERSAL            // signed, when a sale / addition is voided
  // legacy, read-only: PURCHASE, PREPARATION, USAGE, WASTE, DAMAGE, ADJUSTMENT
}

model StockMovement {
  ...existing fields...
  referenceNo   String?          // NEW e.g. "A-0012" for additions, "C-0003" for corrections
  reason        String?          // NEW required for CORRECTION / OPENING_CORRECTION / SPOILED
  purchaseId    String?          // NEW optional link when stock was bought
  purchase      Purchase? @relation(fields: [purchaseId], references: [id], onDelete: SetNull)
  voidedAt      DateTime?        // NEW an addition can be voided (writes a REVERSAL)
  // stockItemId becomes legacy (nullable, no new writes); dropped in P13
}

// ── Debts ─────────────────────────────────────────────────────────────
model Debtor {                         // NEW: customer directory per department
  id           String @id @default(uuid())
  organizationId String
  departmentId String
  name         String
  phone        String?
  notes        String?
  isActive     Boolean @default(true)
  debts        Debt[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([departmentId, name])
}

enum DebtSource { CREDIT_SALE  MANUAL  OPENING_BALANCE }   // NEW

model Debt {
  ...existing fields...
  source      DebtSource @default(CREDIT_SALE)  // NEW
  debtorId    String?                            // NEW (debtorName kept as the printed name)
  debtor      Debtor? @relation(fields: [debtorId], references: [id], onDelete: SetNull)
  dueDate     DateTime?                          // NEW optional
  referenceNo String?                            // NEW "D-0007"
  description String?                            // NEW (replaces foodDescription for MANUAL)
  voidedAt    DateTime?                          // NEW manual debts can be voided with reason
  voidReason  String?
}

// ── Purchases (money out; may add plates) ─────────────────────────────
model Purchase {
  ...existing header fields (supplierName, reference, paymentMethod, totalAmount, date, receiptUrl, notes, status, transactionId)...
  referenceNo String?            // NEW "P-0031"
  lines       PurchaseLine[]
  stockAdds   StockMovement[]    // NEW: plates this purchase added (0..n dishes)
}
model PurchaseLine {             // becomes descriptive only
  id          String @id @default(uuid())
  purchaseId  String
  description String             // NEW e.g. "Fish 10 kg" (free text; food items)
  quantity    Decimal
  unitCost    Decimal
  totalCost   Decimal
  // REMOVED in P13: stockItemId, menuItemId
}

// ── Reference numbers ─────────────────────────────────────────────────
model DocumentSequence {          // NEW, row-locked counter
  id           String @id @default(uuid())
  departmentId String
  docType      String            // S sale, P purchase, E expense, X other expense, R rent,
                                 // I other income, K discount, D debt, Y debt repayment,
                                 // H handover, A stock added, C correction, DR daily report
  year         Int
  nextValue    Int    @default(1)
  @@unique([departmentId, docType, year])
}
model Transaction { ... referenceNo String? ... @@unique([organizationId, referenceNo]) }  // NEW
model CashHandover { ... referenceNo String? }                                          // NEW
model DailyReport  { ... referenceNo String?  schemaVersion Int @default(2) }           // NEW

// ── Department ────────────────────────────────────────────────────────
model Department {
  ...existing...
  code        String?             // NEW short code used in reference numbers, e.g. "RST"
  // domain stays; it becomes immutable once the department has any transaction (enforced in action)
}

// ── In-app notifications (Boss inbox, alerts) ─────────────────────────
model Notification {              // NEW
  id             String   @id @default(uuid())
  organizationId String
  userId         String            // recipient
  departmentId   String?
  kind           String            // REPORT_SUBMITTED, REPORT_RETURNED, HANDOVER_RECORDED,
                                   // HANDOVER_DISPUTED, REPORT_MISSING, LOW_STOCK, VARIANCE
  title          String
  href           String
  readAt         DateTime?
  createdAt      DateTime @default(now())
  @@index([userId, readAt, createdAt])
}

// ── Removed in P13 (after data migration and a release with no reads) ──
// DepartmentStockItem, RecipeIngredient, DailyStockRecord, Budget,
// Transaction.{isRecurring, recurringInterval, nextRecurringDate, lastProcessed, isDebtPaid,
//              purchaseSupplier, purchaseReference}, enum RecurringInterval, StockTrackingPeriod,
// DishInventoryMode, OperationCategory values PURCHASE_DRINK, SALE_DRINK.
```

### 6.3 Debts: the three ways a debt is born

| Source | How it is recorded | Revenue? | Cash? | Stock? |
|---|---|---|---|---|
| `CREDIT_SALE` | In the POS, payment method **"On credit (debt)"**, with a debtor chosen or created. | Yes (sale) | No | Plates deducted |
| `MANUAL` | **"Record a debt"** on the Debts page. The customer consumed food that was **not** rung through the POS (for example a delivery, or a late entry). The head picks the dishes and quantities **or** enters an amount with a description. | Yes, when dishes are picked (it is posted as a credit sale, so stock is deducted). An amount-only manual debt is posted as a credit sale of **"Unlisted items"**: revenue yes, no stock movement, flagged in the report. | No | Only if dishes were picked |
| `OPENING_BALANCE` | "Add an old debt" during setup or migration: debts that existed before the app. | **No** (earned before) | No | No |

- **Repayments:** full or partial, by cash, MoMo or bank, each with a reference number. A repayment cannot exceed the balance, and it enters the cash drawer.
- **Debt status:** Unpaid → Partly paid → Paid; a debt can also be Voided (manual debts only, with reason, same day or by the Boss).
- **Debtor directory:** a balance per customer, the list of debts, a printable statement per debtor.

### 6.4 Purchases and "Add stock": how they relate

The owner's formula treats "Purchases" and "Stock added" together, but they are two different facts:

- **A purchase** is **money out** (what was paid, to whom, for what).
- **Stock added** is **plates in** (how many portions became available).

Many purchases are raw food (fish, rice, oil) that become plates only after cooking. So:

| Action (UI) | Money effect | Stock effect |
|---|---|---|
| **Add stock** (Menu & Stock page) | None by default. Optional tick **"This stock was bought"** → cost, supplier, payment method → creates a linked **Purchase** in the same database transaction. | `STOCK_ADDED` +N plates on the chosen dish |
| **Record a purchase** (Money page) | Money out (Purchase) | None by default. Optional **"Add plates to stock"** section: dish and plates (0..n dishes), creating linked `STOCK_ADDED` movements. |

On the stock table and the daily report, the column is titled **"Added (purchased / prepared)"**. On the money side, purchases are always money out, whether or not they added plates. This satisfies `Closing = Opening + Purchases/Stock added − Sold` without inventing ingredient stock.

### 6.5 Reference numbers

- **Format:** `{docType}-{sequence padded to 4}`, per department per year, for example `S-0142`. The printed form adds the department code and year: `RST/2026/S-0142`.
- **Allocation:** allocated inside the posting transaction with `SELECT … FOR UPDATE` on `DocumentSequence` (or `INSERT … ON CONFLICT DO UPDATE … RETURNING`). There are no gaps except voids, and a voided number stays visible as "VOID".
- **Where it appears:** on every list row, detail drawer, report line, receipt and print.

### 6.6 Domain framework (how the app tailors itself)

```
lib/domains/
  registry.js           // DOMAINS = { RESTAURANT: restaurantDomain, BAR: comingSoon('BAR'), ... }
  types.js              // JSDoc typedef DomainDefinition (below)
  restaurant/
    index.js            // exports restaurantDomain
    navigation.js       // sidebar items for a restaurant department
    dashboard-cards.js  // card ids + loaders
    report-sections.js  // daily report sections, in order
    statements.js       // statement lines mapping
    copy.js             // domain words ("Dish", "Plates", "Menu & Stock")
```

```js
/** @typedef DomainDefinition
 * @property {string} key                // "RESTAURANT"
 * @property {string} label              // "Restaurant"
 * @property {string} description        // shown in the department form
 * @property {boolean} enabled           // false => "coming soon" workspace
 * @property {NavItem[]} navigation      // operations section of the sidebar
 * @property {string[]} moneyInTypes     // ["SALE","RENT_INCOME","OTHER_INCOME"]
 * @property {string[]} moneyOutTypes    // ["DISCOUNT","PURCHASE","EXPENSE","OTHER_EXPENSE"]
 * @property {"PLATES"|"UNITS"|"NONE"} stockModel
 * @property {boolean} hasMenu
 * @property {string[]} dashboardCards
 * @property {string[]} reportSections
 * @property {Record<string,string>} copy   // domain vocabulary
 */
```

- Every page and action asks the registry: `requireModule(department, "menu-stock")` → 404 or a "not available for this department type" page.
- Adding the Bar domain later means adding `lib/domains/bar/*` and enabling it. Restaurant code stays untouched.
- **Domain list shown to the Boss** (department form):
  - Restaurant ✔ *(available)*
  - Bar / snack bar *(coming soon)*
  - Pressing (dress wash) *(coming soon)*
  - Car wash *(coming soon)*
  - Room / hall rental *(coming soon)*
  - Material rental *(coming soon)*
  - Shop *(coming soon)*
  - Other *(coming soon)*
- A department of a coming-soon domain can be created (so the organisation structure is complete) and people can be assigned to it. Its workspace shows a friendly "This department type is coming soon" page with its description and no operations.

### 6.7 Roles and permissions (restaurant)

| Action | Boss | Dept head | Accountant | Cashier |
|---|---|---|---|---|
| See all departments / Boss home | ✔ | – | read-only all | – |
| Create / edit departments, domain, people | ✔ | – | – | – |
| Add / edit / remove dish, change price | ✔ | ✔ | – | – |
| Add stock, correct count, set opening stock | ✔ | ✔ | – | – |
| Record sale (POS) | ✔ | ✔ | – | ✔ |
| Discount on a sale | ✔ | ✔ | – | ✔ up to a limit set by the Boss (default 0 = not allowed) |
| Money in / money out (rent, other income, purchases, expenses, other expenses) | ✔ | ✔ | ✔ expenses only | – |
| Record debt / repayment | ✔ | ✔ | – | ✔ repayment only |
| Cash handover | ✔ | ✔ | – | – |
| Void a record | ✔ | ✔ same day, before submission | – | – |
| Submit daily report | – | ✔ | – | – |
| Review / approve / return report; confirm handover | ✔ | – | – | – |
| Statements (print) | ✔ all | ✔ own departments | ✔ all | – |

The permission set in `lib/permissions.js` must be updated to match this table exactly. Add `SALES_DISCOUNT_LIMITED` and adjust `ACCOUNTANT` and `STAFF`. Add one integration test per row: allowed **and** refused (§10.2).

---

## 7. Calculation contracts (the maths, exactly)

All figures live in **one module per concern**. Each function is pure, meaning data in and numbers out, and each has unit tests.

| Concern | Module |
|---|---|
| Plates per dish per day | `lib/restaurant/stock-math.js` |
| Money per day or period | `lib/finance/money-math.js` |
| Cash drawer | `lib/finance/cash-math.js` |
| Debts | `lib/finance/debt-math.js` |
| Statement building | `lib/finance/statements.js` |
| DB loaders (thin; call the pure functions) | `lib/restaurant/stock-service.js`, `lib/finance/*-service.js` |

### 7.1 Units and rounding

- **Money:** integer FCFA. Line totals are `quantity × unitPrice`, which is exact because quantity is an integer.
  - Discounts are integers.
  - There is no rounding inside sums; if a percentage discount is ever added, round **half up** once per sale.
- **Plates:** integers ≥ 0 in the restaurant domain. Validate `Number.isInteger(q) && q > 0` on every input.
  - The existing Decimal(…) columns are kept, but the restaurant validation rejects fractions.
- **Dates:** every record has `date` (the business instant). Day membership is `startOfBusinessDay(dateKey) ≤ date ≤ endOfBusinessDay(dateKey)` in the organisation time zone (`lib/timezone.js`).

### 7.2 Plates per dish for a day D

Let *M(d, t₁, t₂)* be the non-voided movements of dish *d* with `t₁ ≤ date ≤ t₂`, and *start*/*end* the bounds of D.

```
Opening(d, D)   = Σ signedQty( M(d, −∞, start) )                       // everything before D
                + Σ signedQty( OPENING_CORRECTION in M(d, start, start) ) // corrections dated at 00:00 of D
Added(d, D)     = Σ qty( STOCK_ADDED | OPENING(created during D) | legacy PURCHASE/PREPARATION in D )
Sold(d, D)      = Σ qty( SOLD | legacy USAGE in D )  − Σ qty( REVERSAL of SOLD in D )
Spoiled(d, D)   = Σ qty( SPOILED | legacy WASTE/DAMAGE in D )
Corrections(d,D)= Σ signedQty( CORRECTION | legacy ADJUSTMENT in D )    // after a physical count
Closing(d, D)   = Opening + Added − Sold − Spoiled + Corrections
```

- **Invariant S1:** `Closing(d, today) == MenuItem.currentQuantity`. It is checked in tests and in the nightly job.
- **Invariant S2:** `Opening(d, D+1) == Closing(d, D)` when there is no opening correction on D+1.
- **Invariant S3:** `Closing ≥ 0` always, because sales and spoilage use conditional decrements.

**Display rule:** the stock table and the report show **Opening · Added · Sold · Closing**. The Spoiled and Corrections columns appear only if any dish has a non-zero value that day (no dormant zero columns). The formula line under the table shows exactly what was used, for example `Closing = Opening + Added − Sold (− Spoiled + Corrections)`.

### 7.3 Stock value

```
UnitValue(d) = d.sellingPrice                       // DEFAULT basis: menu (unit) price  — owner's wording
Value(d, D)  = Closing(d, D) × UnitValue(d)
TotalStockValue(D) = Σ_active d  Value(d, D)
OpeningStockValue(D) = Σ Opening(d, D) × UnitValue(d)
```

- The price used for past days is **the price in force on that day**. Price changes are recorded as `AuditEvent` records with before and after values, and the report snapshot stores the price.
  - Live views of past days use `priceOn(d, D)`, derived from the audit trail (`MenuItemPriceHistory` view or a helper).
- **Optional second basis** (decision D1, §13): if the head fills in *Cost per plate*, the report also shows *"Stock value at cost"*. Otherwise that line is hidden (no dormant zeros).
- Stock value is **information about what is on hand**. It is **not** added to income in the income statement (§7.6), so nothing is counted twice.

### 7.4 Editing the opening stock of a day

1. The head opens Menu & Stock for day D (date picker; default today) and clicks **"Edit opening stock"**.
2. A dialog lists every dish with its **calculated** opening (Closing of D−1) and an input for the **actual** opening. The default equals the calculated value. A reason is required if anything changed.
3. On save, for each dish with `actual ≠ calculated`, the service writes an `OPENING_CORRECTION` movement:
   - `quantity = actual − calculated` (signed);
   - `date = startOfBusinessDay(D)`;
   - `reason`, `referenceNo = C-xxxx`, audit event.
4. `currentQuantity` is adjusted by the same delta, atomically. If `currentQuantity + delta < 0` (for example, lowering yesterday's opening below what was sold since), the save is **refused** with a clear message ("You already sold 12 plates since; opening cannot be lower than 12"). Guard: `Opening(d, D) + Added − Sold − Spoiled + Corrections ≥ 0` for **every** day from D to today.
5. **Allowed only while day D is not submitted** (DRAFT or RETURNED) and D is in an open accounting period. For an approved day the Boss must first return the report.
6. Everything that depends on it recalculates because it is all derived: Closing(D), all following days, stock value, the live report and statements.

### 7.5 Sales

```
LineGross   = quantity × unitPrice(at sale)            // unitPrice snapshotted on SaleLine
SaleGross   = Σ LineGross
SaleDiscount= integer, 0 ≤ SaleDiscount ≤ SaleGross, reason required if > 0
SaleNet     = SaleGross − SaleDiscount
Paid now    = SaleNet  (CASH | MOMO | BANK_TRANSFER)
On credit   = SaleNet  (CREDIT → Debt.amountOwed = SaleNet)
```

- **Split payments** (for example 5,000 cash + 3,000 credit) are **not** supported in v2 (decision D5). Record two sales instead.
- **Stock:** for each line, a conditional decrement `currentQuantity ≥ quantity`, else the whole sale is refused (all-or-nothing) with the dish name and the plates available.

### 7.6 Money for a day or period P (department or organisation)

Non-voided records dated within P:

```
SalesGross        = Σ SaleGross            (all payment methods, incl. credit)
RentIncome        = Σ RENT_INCOME.amount
OtherIncome       = Σ OTHER_INCOME.amount
MoneyIn           = SalesGross + RentIncome + OtherIncome

Discounts         = Σ SaleDiscount + Σ standalone DISCOUNT.amount
Purchases         = Σ PURCHASE.amount      (cash + supplier credit)
Expenses          = Σ EXPENSE.amount
OtherExpenses     = Σ OTHER_EXPENSE.amount
MoneyOut          = Discounts + Purchases + Expenses + OtherExpenses

NetResult         = MoneyIn − MoneyOut      // "Profit / (Loss) for the period"
```

- The Income statement layout is §8.8.1. "Net sales" (`SalesGross − Σ SaleDiscount`) is shown as a sub-total, for managers who think in net sales.
- **Debt lines** (information and cash, not income):

```
DebtOpening   = outstanding at start of P
DebtGiven     = Σ Debt.amountOwed created in P (CREDIT_SALE + MANUAL)       // already inside SalesGross
DebtOldAdded  = Σ OPENING_BALANCE debts created in P                         // not income
DebtRepaid    = Σ DebtPayment.amount in P (non-voided)
DebtClosing   = DebtOpening + DebtGiven + DebtOldAdded − DebtRepaid − DebtVoided
```

### 7.7 Cash drawer for a day D (per department)

"Cash" means everything received physically or electronically into the department's drawer account(s). The report splits it by method: Cash / MoMo / Bank.

```
OpeningCash(D)  = closing expected cash of D−1 after handover           // = openingCashBefore(start)
CashIn          = (SalesGross − SaleDiscount) paid by non-credit methods
                + RentIncome + OtherIncome (non-credit methods)
                + DebtRepaid
CashOut         = standalone DISCOUNT paid out
                + Purchases paid now (not on supplier credit)
                + Expenses + OtherExpenses (paid now)
ExpectedCash    = OpeningCash + CashIn − CashOut                         // before handover
HandedOver      = Σ CashHandover.amount (RECORDED + CONFIRMED; DISPUTED excluded)
ExpectedAfterHandover = ExpectedCash − HandedOver                        // "should remain in drawer"
CountedCash     = typed by the head at close (required to submit)
Variance        = CountedCash − ExpectedAfterHandover                    // 0 = balanced; −ve = shortage
```

**Invariant C1:** `OpeningCash(D+1) == ExpectedAfterHandover(D)`.

The counted cash is **not** posted as an adjustment. A variance stays visible on the report, and the Boss decides (decision D6).

### 7.8 Statements for a period P

Built from the **approved** daily reports when every day of P is approved ("Final"). Otherwise the statement is built from the **live ledger** and marked "Provisional: N days not yet approved" (existing behaviour, keep). Totals must match the sum of the daily reports exactly (Invariant R1).

---

## 8. User interface specification

### 8.1 Design language and copy rules

**Visual rules**

- **Colours.** Neutral slate UI with one accent colour. The palette is built from tokens in `app/globals.css` (`--color-accent`, `--color-in` for money in (emerald), `--color-out` for money out (rose), `--color-warn` (amber)).
  - Use colour for meaning only: money in is green, money out is red, and warnings are amber.
- **Typography.** Inter, with tabular numbers for all figures (`font-variant-numeric: tabular-nums`).
  - Big figures on stat cards are 28 px semibold.
  - Table figures are right-aligned, with the FCFA suffix only in headers and totals.
- **Number format.** Written as `1 250 000 FCFA` (space thousands separator, fr-CM style) everywhere, on screen and in print. One helper, `formatMoney`, does this.
  - Negative values are shown as `(12 500)` in statements and `−12 500` on screens.
- **Empty states.** Every list and card has an empty state that explains what to do ("No dishes yet. Add your first dish.").
  - Show `0 FCFA` for a figure only when it is truly zero; never show `—` for zero.
- **Loading.** Skeletons on every server-rendered section (`loading.jsx` per route). Buttons show a spinner while a server action runs and are disabled to prevent double posts. Idempotency keys stay as a safety net.
- **Confirmation.** Every money-changing form shows a summary line before saving ("Record sale S-0143: 3 plates, 7 500 FCFA, cash"). A toast after saving shows the reference number and links to it.
- **Accessibility.** Every input has a label; focus is visible; the colour contrast ratio is at least 4.5:1; everything can be done with the keyboard; dialogs trap focus. Automated axe checks run in end-to-end tests.

**Copy rules (plain language)**

| Never show | Show instead |
|---|---|
| inventory mode, recipe, valuation, posting, ledger (on operator screens), idempotency, domain | removed, "Unit price", "Stock value", "Record", "History", "Department type" |

- Name buttons as verbs and objects: "Add dish", "Add stock", "Record sale", "Record expense", "Send report to Boss".
- Write error messages in two sentences, what happened and what to do: "Only 4 plates of Fried fish left. Reduce the quantity or add stock first."
- Placeholders are instructions, never examples of real businesses: "Enter the department name".

### 8.2 Application shell (fixed sidebar)

```
┌──────────────┬──────────────────────────────────────────────────────────────────┐
│ [logo] Name  │  Top bar: Page title · breadcrumb        Business date ▾  🔔 3  (A)│
│──────────────│──────────────────────────────────────────────────────────────────│
│ ACTIVE DEPT  │                                                                  │
│ ┌──────────┐ │   Page content (max-width 1280px, 24px padding, 12-col grid)     │
│ │Restaurant│ │                                                                  │
│ │ Ground fl│ │                                                                  │
│ │ Switch ▾ │ │                                                                  │
│ └──────────┘ │                                                                  │
│ TODAY        │                                                                  │
│  Home        │                                                                  │
│  Sell (POS)  │                                                                  │
│  Menu & Stock│                                                                  │
│  Money in/out│                                                                  │
│  Debts       │                                                                  │
│  Cash to Boss│                                                                  │
│  Today's rpt │                                                                  │
│ RECORDS      │                                                                  │
│  History     │                                                                  │
│  Statements  │                                                                  │
│ BOSS         │  (only for the Boss)                                              │
│  Overview    │                                                                  │
│  Daily rpts 2│                                                                  │
│  Cash recvd  │                                                                  │
│  Departments │                                                                  │
│  People      │                                                                  │
│  Settings    │                                                                  │
│──────────────│                                                                  │
│ (A) Name     │                                                                  │
│ role · logout│                                                                  │
└──────────────┴──────────────────────────────────────────────────────────────────┘
```

**Desktop (≥ 1024 px)**

- The sidebar is **fixed**: `position: fixed; inset-y: 0; width: 264px`, and `main` gets `padding-left: 264px`.
- There is **no collapse control**. The sidebar scrolls on its own if the list is long.

**Tablet and phone (< 1024 px)**

- The same sidebar opens as a drawer from a menu button, because a fixed 264 px column does not fit a phone.
- A bottom action bar shows **Sell · Menu & Stock · Money · Report** for department users.

**Active-department card**

- Shows the name, a domain badge and a "Switch department" dropdown.
- The dropdown lists the user's departments grouped by domain, each with today's report status dot.
- Switching changes the whole navigation to that department's domain modules.

**Business date**

- Default today. Changing it puts the whole department workspace on that day, with a clear amber banner "You are viewing 24 Sep 2026 (past day)".

**Print**

- The sidebar, top bar and buttons are hidden (`print:hidden`). The printed report uses its own A4 header (§8.7).

### 8.3 Navigation per role (restaurant department)

| Section | Item | Route | Boss | Head | Accountant | Cashier |
|---|---|---|---|---|---|---|
| Today | Home (department dashboard) | `/d/[deptId]` | ✔ | ✔ | ✔ | ✔ |
| Today | Sell (POS) | `/d/[deptId]/sell` | ✔ | ✔ | – | ✔ |
| Today | Menu & Stock | `/d/[deptId]/menu-stock` | ✔ | ✔ | view | view |
| Today | Money in / out | `/d/[deptId]/money` | ✔ | ✔ | ✔ | – |
| Today | Debts | `/d/[deptId]/debts` | ✔ | ✔ | view | ✔ repay |
| Today | Cash to Boss | `/d/[deptId]/cash-handover` | ✔ | ✔ | view | – |
| Today | Today's report | `/d/[deptId]/report` | ✔ | ✔ | ✔ | – |
| Records | History (all records) | `/d/[deptId]/history` | ✔ | ✔ | ✔ | own |
| Records | Statements | `/statements` | ✔ | ✔ | ✔ | – |
| Boss | Overview | `/boss` | ✔ | | | |
| Boss | Daily reports | `/boss/daily-reports` | ✔ | | read | |
| Boss | Cash received | `/boss/cash` | ✔ | | | |
| Boss | Departments | `/boss/departments` | ✔ | | | |
| Boss | People | `/boss/people` | ✔ | | | |
| Boss | Settings (organisation, periods, cash drawers) | `/boss/settings` | ✔ | | | |

**Routing decision (D7).** Department pages move under `/d/[deptId]/…` so that the active department is in the URL. Links can then be shared, back and forward work, and there is no hidden cookie state. The cookie only remembers the **last** department, used for the redirect from `/`.

**Redirects.** Old routes (`/restaurant`, `/menu`, `/stock`, `/daily-close`, `/transactions`, `/reports`, `/reports/inbox`, `/organization/*`) permanently redirect (308) to the new ones for one release, then are deleted.

### 8.4 Menu & Stock page (the heart of the restaurant)

```
Menu & Stock — Restaurant Ground floor                   [◀ 25 Sep] 26 Sep 2026 [▶]
────────────────────────────────────────────────────────────────────────────────────
┌ Dishes on menu ┐ ┌ Plates in stock ┐ ┌ Stock value ────┐ ┌ Sold today ───────┐
│      12        │ │      143        │ │  318 500 FCFA   │ │ 61 plates         │
│ 2 low on stock │ │ opening 158     │ │ opening 356 000 │ │ 142 000 FCFA      │
└────────────────┘ └─────────────────┘ └─────────────────┘ └───────────────────┘
[+ Add dish]  [+ Add stock]  [Edit opening stock]  [Correct a count]   [Print stock sheet]
Search dishes… ▢  Show removed dishes ▢

 Ref  Dish            Unit price  Opening  Added  Sold  Closing  Value (FCFA)  ⋯
 ───  ──────────────  ──────────  ───────  ─────  ────  ───────  ────────────  ─
 #01  Fried fish        3 000        20     10    18      12       36 000     ⋯
 #02  Rice & stew       2 000        10      0     8       2 ⚠      4 000     ⋯
 …
 ───────────────────────────────────────────────────────────────────────────────
 TOTAL                               158     46    61     143      318 500
 Closing = Opening + Added − Sold            (all numbers update the moment a sale is recorded)
```

**Row menu (⋯):**

- Edit dish (name, unit price, description, low-stock level)
- Add stock
- Correct count
- View history (movement list with reference numbers, who and when, and links to sales and purchases)
- Remove from menu (archive; only if plates = 0, otherwise first "Correct count" to 0 with reason "removed")

**Add dish dialog** (fields in this order):

1. Dish name (required, unique in the department, case-insensitive).
2. Unit price in FCFA (required, integer > 0).
3. Plates available now (opening quantity, integer ≥ 0).
4. Description (optional).
5. Low-stock warning at (optional, default 0 = off).

Save creates the dish and an `OPENING` movement (reference `A-xxxx`).

**Add stock dialog**

| Field | Rule |
|---|---|
| Dish | Searchable select, plus "+ New dish" inline (name and unit price). |
| Plates added | Required, integer > 0. |
| This stock was bought ☐ | When ticked: amount paid (FCFA), supplier (optional), payment method (Cash, MoMo, Bank, Supplier credit), proof upload (optional). |
| Note | Optional. |

Preview: "Fried fish: 12 → 22 plates · stock value +30 000 FCFA · purchase P-0032 of 25 000 FCFA (cash)".

**Correct a count:** dish, counted plates (the system shows the expected number), reason (required: "Physical count", "Spoiled", "Given to staff", "Other…"). If the reason is "Spoiled", a `SPOILED` movement is written; otherwise a `CORRECTION`. The dialog shows the difference and its value.

**Edit opening stock:** see §7.4. The table in the dialog shows Dish · Calculated opening · Actual opening (input) · Difference, then a reason.

**Live updates**

- After any action on this page or a sale on the POS, the table refreshes (`revalidatePath` plus `router.refresh()`).
- A lightweight **poll every 20 s** runs when the page is visible (`visibilitychange`), so a second screen (the head watching while a cashier sells) stays current. SSE or websockets are optional later (D8).

**Past days:** read-only unless the day is DRAFT/RETURNED (then Add stock, Corrections and Edit opening stock are allowed with that date).

**Printable stock sheet:** A4, the same columns plus blank "Physical count" and "Signature" columns, for kitchen counting.

### 8.5 Sell (POS)

```
┌ Dishes (tap to add) ──────────────────────────────┐ ┌ Current sale ─────────────┐
│ [Fried fish 3 000 · 12 left] [Rice & stew 2 000·2]│ │ Fried fish   ×2   6 000 ✕ │
│ [Grilled chicken 3 500 · 0 left — disabled]       │ │ Rice & stew  ×1   2 000 ✕ │
│ search…                                           │ │ Subtotal          8 000   │
│                                                   │ │ Discount  [    ] reason ▾ │
│                                                   │ │ TOTAL             8 000   │
│                                                   │ │ Paid by (Cash)(MoMo)(Bank)│
│                                                   │ │        (On credit → debtor)│
│                                                   │ │ [ Record sale ]           │
└───────────────────────────────────────────────────┘ └───────────────────────────┘
 Today's sales: S-0141 13:02 3 plates 7 500 cash  [receipt] [void]  …
```

- Tiles show plates left, live. A tile with 0 left is disabled. The **+ button stops at the plates available**, and the server re-checks atomically (R20).
- **On credit:** pick a debtor from the directory or create one (name required, phone optional). The sale creates the debt.
- **After saving:** a toast with the reference, and a **printable 80 mm receipt** (optional print), which includes "Debt D-0007 opened" for credit sales.
- **Void a sale:** Head/Boss only, same day, before the report is submitted, with a reason. It restores plates (`REVERSAL`) and removes the revenue; the reference stays, marked "VOID".

### 8.6 Money in / out, Debts, Cash to Boss

**Money in / out page**

- Two columns: **Money in** (Sales total, read-only from POS · Rent income · Other income) and **Money out** (Discounts, read-only total from sales plus standalone · Purchases · Expenses · Other expenses).
- Each type has one **"+ Record"** button opening the same form pattern:
  - amount;
  - date (defaults to the viewed day);
  - category (from the type's list; no drinks);
  - paid/received by;
  - counterpart (supplier, tenant, payee);
  - reference or proof upload;
  - note.
- Below the columns: today's list of records with reference, type chip (green/red), amount, who and time, a view drawer, and void.

**Debts page**

- Stat cards: Outstanding, Given today, Repaid today, Customers owing.
- Tabs: **Open debts · Customers · Paid · All**.
- Buttons: **Record a debt**, **Record repayment**, **Add an old debt**.
- The customer view shows the balance, history and a printable statement.

**Cash to Boss page**

- Shows expected cash now (live, per §7.7), split by method, then **Hand over cash**: amount (≤ expected), receiver (default Boss name), reference, proof, note.
- A list of handovers with status: Waiting for Boss / Confirmed / Disputed (with the Boss's note).
- Printable handover slip with two signature lines.

### 8.7 Today's report (department) and the printed daily report

**On screen (`/d/[deptId]/report?date=`)**

- Always live.
- Status bar: `Draft · not sent` / `Sent to Boss 21:47` / `Approved by Boss` / `Returned: "check fish count"`.
- Buttons: **Print** · **Enter counted cash** · **Send report to Boss** (Head only; needs the counted cash; confirmation dialog shows the key totals).
- After sending, the day is locked. A returned report unlocks the day and shows the Boss's note at the top.

**Printed / PDF daily report (A4 portrait, 1–3 pages)**

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [Org logo] ORGANISATION NAME                          DAILY REPORT          │
│ Department: Restaurant — Ground floor (RST)            Date: Sat 26 Sep 2026│
│ Ref: RST/2026/DR-0001 · Status: SENT 21:47 by <head> · Printed 22:03       │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. SUMMARY            Money in 77 000 │ Money out 19 000 │ Result 58 000   │
│                       Cash expected 66 000 │ Handed over 60 000 │ Var −500  │
├────────────────────────────────────────────────────────────────────────────┤
│ 2. MONEY IN                                                                 │
│   Sales (gross)                       60 000   (cash 53 000 · credit 6 000 │
│                                                 · after 1 000 discount)     │
│   Rent income                         15 000                                │
│   Other income                         2 000                                │
│   TOTAL MONEY IN                      77 000                                │
│ 3. MONEY OUT                                                                │
│   Discounts                            1 000                                │
│   Purchases                           12 000                                │
│   Expenses                             5 000                                │
│   Other expenses                       1 000                                │
│   TOTAL MONEY OUT                     19 000                                │
│   RESULT OF THE DAY                   58 000                                │
│ 4. SALES BY DISH   Dish · Plates · Unit price · Gross · (list, sorted)      │
│ 5. STOCK (plates)  Dish · Opening · Added · Sold · Closing · Unit · Value   │
│    Totals + opening stock value → closing stock value                      │
│ 6. DEBTS           Opening 9 000 + Given 6 000 − Repaid 4 000 = 11 000      │
│    lists: new debts (ref, customer, amount) · repayments (ref, customer)    │
│ 7. CASH            Opening 10 000 + In 74 000 − Out 18 000 = Expected 66 000│
│    Handed to Boss 60 000 (H-0001 confirmed) · Should remain 6 000           │
│    Counted 5 500 · Variance −500 (shortage)                                 │
│ 8. DETAIL OF RECORDS  every record: time · ref · type · description · amount│
│ 9. NOTES & SIGN-OFF   Head: ________  Boss: ________   (+ Boss review note) │
└────────────────────────────────────────────────────────────────────────────┘
Footer: page x / y · generated by Springer Finance · figures in FCFA
```

**Print technology.** The report is a React component rendered for the screen **and** for print, with a dedicated `@media print` stylesheet:

- `@page { size: A4; margin: 14mm }`;
- `break-inside: avoid` on sections;
- repeated table headers.

**PDF export** (`/api/reports/daily/[id]/pdf`) renders the same component server-side with Playwright/Chromium (`page.pdf`). The Boss gets identical documents on any device.

**Sending.** Submit creates the `DailyReport` snapshot (§9 P9), a `Notification` for every Boss user, and an e-mail (Resend) with the summary and a link.

### 8.8 Statements (financial statements)

The page is `/statements`. Pick the **period** (Day, Week, Month, Year, Custom), the **scope** (one department / several / whole organisation) and the **basis** (Final = approved reports only, or Live), then choose **Compare with** (previous period, or the same period last year).

There are four statement tabs. Each is printable (A4) and exportable (PDF and CSV).

#### 8.8.1 Income statement (Profit & loss)

```
                                         This month    Last month    Change
MONEY IN
  Sales (gross)                           1 820 000     1 640 000    +11.0%
  Rent income                               150 000       150 000      0.0%
  Other income                               42 000        18 000   +133.3%
TOTAL MONEY IN                            2 012 000     1 808 000    +11.3%
MONEY OUT
  Discounts                                  31 000        25 000
  Purchases                                 820 000       760 000
  Expenses                                  260 000       240 000
  Other expenses                             19 000        12 000
TOTAL MONEY OUT                           1 130 000     1 037 000
RESULT (PROFIT / LOSS)                      882 000       771 000    +14.4%
Result margin (Result ÷ Money in)             43.8%         42.6%
Memo: Net sales (gross − discounts)       1 789 000
```

#### 8.8.2 Cash movement statement

- Opening cash (all drawers in scope).
- Cash in by source (sales paid, rent, other income, debt repayments) and by method (cash, MoMo, bank).
- Cash out by type.
- Handed over to Boss (confirmed / pending / disputed).
- Closing expected cash.
- Counted-cash variances (the sum and the list of days with variance).

#### 8.8.3 Stock movement statement

- Per dish: Opening · Added · Sold · Spoiled · Corrections · Closing (plates), and values at unit price.
- Top 10 dishes by plates sold and by revenue.
- Dishes never sold in the period.
- Stock value at the start and end of the period.

#### 8.8.4 Debts statement

- Opening outstanding + Given − Repaid − Voided = Closing outstanding.
- Ageing buckets (0–7, 8–30, 31–60, > 60 days).
- The top customers owing.
- The list with references.

**Charts** (on screen, and printed as SVG): money in vs money out per day (bars), result trend (line), money-out composition (stacked bar), sales by dish (horizontal bars).

**Drill-down.** Every amount is a link to the History page, pre-filtered to exactly the records that make it up (Invariant R2: the history sum equals the figure).

**Coverage banner.** "Final: all 30 days approved" or "Provisional: 4 days not approved (list)".

### 8.9 Boss overview (`/boss`)

```
Good evening, <Boss> — Sat 26 Sep 2026                      [Today ▾] [All departments ▾]
┌ Money in ─────┐┌ Money out ────┐┌ Result ───────┐┌ Cash received ┐┌ Debts owed ──┐
│ 214 000       ││ 61 000        ││ 153 000 ▲12%  ││ 180 000 (2 ⏳) ││ 96 000 ▲     │
└───────────────┘└───────────────┘└───────────────┘└───────────────┘└──────────────┘
Alerts: ⚠ Restaurant 2 has not sent yesterday's report · ⚠ Variance −500 at Ground floor ·
        ⚠ 3 dishes out of stock at Terrace · ⏳ 2 handovers waiting for your confirmation
Departments
┌ Restaurant — Ground floor ───────────┐ ┌ Restaurant — Terrace ─────────────────┐
│ In 120 000  Out 40 000  Result 80 000 │ │ In 94 000 Out 21 000 Result 73 000    │
│ Stock value 318 500 · Debts 11 000    │ │ Stock value 204 000 · Debts 85 000    │
│ Report: SENT 21:47 [Open]  Cash ✓     │ │ Report: DRAFT (not sent)  Cash ⏳      │
└───────────────────────────────────────┘ └───────────────────────────────────────┘
Daily reports this week (calendar)          Trend: money in vs out, last 30 days (chart)
          Mon Tue Wed Thu Fri Sat Sun
Ground fl  ✔   ✔   ✔   ✔   ⏳  ●   ·        ✔ approved ⏳ sent, waiting ● draft ✖ missing
Terrace    ✔   ✔   ✖   ✔   ✔   ●   ·
```

- The Boss can open any department's workspace in **read mode** (Boss view banner). He does not need to operate.
- **Daily reports** (`/boss/daily-reports`) has two views:
  - **Calendar** (departments × days, colour status; click opens the report);
  - **List** (filters: date range, department, status; columns: date, department, sent by and at, money in, money out, result, cash expected, handed, variance, status).
- The **report detail** is the printed layout (§8.7) plus **Approve** / **Return with note** and the version history (v1, v2 … with differences highlighted).
- **Cash received** lists handovers across departments, with confirm/dispute buttons and a monthly total per department.
- **E-mails (optional, per Boss preference):**
  - "Report sent" (instant, or digest at 22:30);
  - "Missing report" (next morning 08:00);
  - weekly summary (Monday 07:00);
  - monthly statement PDF (1st of the month).

### 8.10 Department head home (`/d/[deptId]`)

- Today's cards: Money in, Money out, Result, Stock value (with plates), Expected cash, Debts outstanding.
- A to-do list:
  - "Opening stock not confirmed" (optional check, D9);
  - "Counted cash not entered";
  - "Report not sent";
  - "Report returned by Boss: <note>";
  - "2 dishes out of stock".
- Quick buttons: Sell · Add stock · Record expense · Today's report.
- Last 7 days mini-chart.

### 8.11 Onboarding, departments, people

**Onboarding** has four steps:

1. **Company:** name, city, currency (FCFA locked), time zone (default Africa/Douala).
2. **Departments:** name and **department type** (cards with icon and description; Restaurant preselected; the others show "coming soon").
3. **People:** name, e-mail or phone, role, department(s) (multi-select), and a generated temporary password shown **once** with a copy button.
4. **Done:** a checklist ("Add your dishes", "Create a cash drawer": created automatically per department in v2, "Invite people").

Placeholders are neutral: "Enter your company name", "Enter the department name", "Full name", "name@example.com". `autoComplete="off"` is set on organisation and department names.

**Departments (Boss)**

- Card list: name, type, people, status (active/archived), today's report status.
- The form has name, type, short code (auto: RST, RST2 …) and description.
- The type is locked after the first record; explain why in a tooltip.

**People (Boss)**

- Table: name, role, departments (chips with type colours), last login, active.
- The edit drawer assigns any number of departments (any types), marks the primary one, and sets a per-department role override.
- Reset password; deactivate.

---

## 9. Implementation phases (step by step, start to finish)

Order matters: each phase builds on the previous one. The estimates are for one experienced engineer (or one AI agent with review). For every phase:

- **Branch** as in §1.
- **Tests** as listed, plus the whole suite green.
- **Docs**: update `docs/IMPLEMENTATION_STATUS.md` (tick the phase) and this plan if a decision changed.

### Phase 0: Baseline and environment (0.5 day)

**Goal:** everyone runs the current code; nothing is lost.

1. On the owner's machine: `npm install`, then `npm run dev`. Confirm the fixed sidebar and the absence of "Bistro" names. This proves the owner's screenshots were from the old version.
2. Take a Supabase backup (dashboard → Database → Backups, or `pg_dump`).
3. List live organisations and departments (read-only SQL, run by the owner):
   ```sql
   SELECT o.name AS organisation, d.name AS department, d.domain, d."createdAt"
   FROM organizations o LEFT JOIN departments d ON d."organizationId" = o.id ORDER BY o."createdAt";
   ```
   The owner marks which ones are test data ("Chris Complex", "Bistro …"). They are removed in P1 by an **explicit, reviewed** script, never automatically.
4. Set up a separate **staging** Supabase project (or a local Postgres) for development. Never develop against production.
5. CI (GitHub Actions `.github/workflows/ci.yml`):
   - Postgres 16 service;
   - `npm ci`, `npm run lint`, `npm test`, `npx playwright install --with-deps chromium`, `npm run test:e2e`, `npm run build`;
   - upload the Playwright report on failure.

**Acceptance:** CI is green on `main`; the owner has seen the current UI; a backup file exists.

### Phase 1: Product clean-up: names, placeholders, test data (0.5 day)

**Files**

| File | Change |
|---|---|
| `app/(main)/onboarding/_components/onboarding-wizard.jsx` | Placeholders become "Enter your company name", "Enter the department name", "Full name", "name@example.com". Add `autoComplete="off"` on the organisation and department inputs and `autoComplete="name"`/`"email"` on people inputs. |
| `app/(main)/organization/departments/_components/departments-client.jsx` | Placeholder "Enter the department name". |
| `actions/seed.js`, `app/api/seed/route.js` | **Delete.** Replace them with `scripts/seed-dev.mjs`, a CLI-only script that refuses to run when `DATABASE_URL` points to a `*.supabase.com` host unless `--force-remote` is passed. It uses neutral names ("Test Company", "Department 1", "Dish 1"). |
| `scripts/cleanup-test-data.mjs` (new) | Takes a list of organisation ids, prints what will be deleted (counts per table), requires typing the organisation name to confirm, and deletes inside one transaction. It is used once by the owner in P0/P1. |
| `e2e/*.spec.mjs` | Use the neutral placeholders in selectors. |

**Acceptance:** `grep -riE "bistro|sunrise|marie|chris|snack|holdings" app components lib actions` returns nothing. The onboarding placeholders are neutral.

**Tests:** end-to-end onboarding with the new placeholders; a unit test that `scripts/seed-dev.mjs` refuses remote URLs.

### Phase 2: Domain framework and department types (1 day)

**Files**

- New `lib/domains/registry.js`, `lib/domains/types.js`, `lib/domains/restaurant/{index,navigation,dashboard-cards,report-sections,statements,copy}.js` and `lib/domains/coming-soon.js`.
- `lib/domain-capabilities.js` becomes a thin re-export and is deleted at the end of P8.

**Changes**

- Labels and descriptions: Restaurant; Bar / snack bar; **Pressing (dress wash)**; Car wash; Room / hall rental; Material rental; Shop; Other.
- The department form uses **type cards** (icon, label, description, "coming soon" pill). Restaurant is preselected.
- `Department.code` (migration) is auto-generated from the type and a counter (RST, RST2, BAR …) and editable by the Boss (unique per organisation, 2–6 uppercase letters and digits).
- `updateDepartment`: the type cannot change once the department has any transaction, movement, debt or report. Enforce this server-side (it exists) and add a clear UI message.
- A department whose type is "coming soon" shows `components/domains/coming-soon.jsx`: type icon, "This department type is coming soon", what it will offer, and who is assigned. No operations.

**Acceptance:** creating one department of each type works. Only restaurant departments get operations; the others show the coming-soon page and their people can still sign in and see it.

**Tests:**

- Integration: create a department of each type; refuse a type change after the first sale; `requireModule` refuses restaurant actions on a Bar department.
- End-to-end: the Boss creates a "Pressing (dress wash)" department and sees the coming-soon page.

### Phase 3: Stock model v2 (plates), reference numbers, calculation services (3 days)

This is the core back-end phase. **Do not change UI pages in this phase** beyond what compiles.

**3.1 Migration `restaurant_v2_stock`** (additive, idempotent):

- Enum values: `STOCK_ADDED`, `SOLD`, `SPOILED`, `CORRECTION`, `OPENING_CORRECTION` in `StockMovementType`.
- Columns:
  - `StockMovement.referenceNo`, `reason`, `purchaseId`, `voidedAt`;
  - `MenuItem.lowStockLevel`, `sortOrder`, `archivedAt`, `section`;
  - `Transaction.referenceNo` (plus a unique index `(organizationId, referenceNo)` where not null);
  - `CashHandover.referenceNo`; `DailyReport.referenceNo`, `schemaVersion`; `Department.code`; `PurchaseLine.description`.
- Tables: `DocumentSequence`, `Debtor`, `Notification`; enum `DebtSource`; `Debt.source`, `debtorId`, `dueDate`, `referenceNo`, `description`, `voidedAt`, `voidReason`.

**3.2 Data migration `restaurant_v2_backfill`** (idempotent SQL + a Node script for anything complex):

- **`RECIPE` dishes** become plate dishes with `currentQuantity` 0. The script prints the list for the head to add opening stock. (Recipe-based stock cannot be converted to plates automatically; see §12.)
- **`DIRECT_PLATE` dishes** keep their quantities; `openingQuantity` is already reflected by `OPENING` movements (verify, and create any missing ones dated at `createdAt`).
- **Ingredient stock items** (`DepartmentStockItem`) are **frozen**: `isActive=false`. Their history stays readable in a legacy report until P13. The script exports them to `docs/migration/legacy-ingredients-<date>.csv`.
- **Reference numbers** are assigned to existing records in date order per department and type, and `DocumentSequence.nextValue` is set accordingly.
- **Debtors** are created from distinct `Debt.debtorName` per department; `Debt.debtorId` is linked and `source=CREDIT_SALE` set.
- **`PurchaseLine.description`** is filled from the item name, quantity and unit.
- The legacy **`INCOME`** type moves to `OTHER_INCOME` (already done by the earlier backfill; re-assert). `PURCHASE_DRINK`/`SALE_DRINK` categories are relabelled "Legacy drinks" for display.

**3.3 Services (new, pure and tested first):**

- `lib/restaurant/stock-math.js`: `dayPositions(movements, dishes, start, end)` returns per dish `{opening, added, sold, spoiled, corrections, closing}` (§7.2); `stockValue(positions, priceOf)`; `validateOpeningEdit(...)`.
- `lib/finance/money-math.js`: `dayMoney(records)` returns `{salesGross, saleDiscounts, rentIncome, otherIncome, moneyIn, discounts, purchases, expenses, otherExpenses, moneyOut, netResult, netSales}` (§7.6).
- `lib/finance/cash-math.js`: `drawer({openingCash, records, handovers, counted})` (§7.7).
- `lib/finance/debt-math.js`: `debtMovement({opening, debts, payments, voids})` (§7.6).
- `lib/documents/sequence.js`: `nextReference(tx, departmentId, docType, date)` does an `INSERT … ON CONFLICT (departmentId, docType, year) DO UPDATE SET "nextValue" = document_sequences."nextValue" + 1 RETURNING "nextValue" - 1`.
- `lib/restaurant/stock-service.js`, which runs inside the caller's transaction:
  - `addStock({dishId, plates, date, note, purchase?})`: conditional logic, a movement, a reference, and an optional purchase in the same transaction;
  - `sellPlates(lines)` (moves the existing `lib/inventory.js` logic, no recipes);
  - `correctCount({dishId, counted, reason})`;
  - `setOpening({dateKey, entries:[{dishId, actual}], reason})` (§7.4, including the forward non-negative guard, done with one SQL window query over the movements after the date);
  - `archiveDish`, `restoreDish`.
- `lib/reporting-service.js` is refactored to call the pure modules; `buildDailyClose` returns **schema v2** (§9 P9) and drops ingredient and recipe branches.
- **Revalidation map** in `lib/revalidate.js`: `revalidateDepartment(deptId, {stock, money, debts, cash, report})` calls `revalidatePath` for every affected route (`/d/[id]`, `/d/[id]/menu-stock`, `/d/[id]/sell`, `/d/[id]/money`, `/d/[id]/debts`, `/d/[id]/cash-handover`, `/d/[id]/report`, `/boss`, `/boss/daily-reports`, `/statements`). **Every** action calls it.

**3.4 Actions (rewrite on top of the services):**

- `actions/menu.js`: `createDish`, `updateDish` (name, price, description, section, low-stock), `archiveDish`, `restoreDish`, `addStock`, `correctCount`, `setOpeningStock`, `getMenuStock(deptId, dateKey)`, `getDishHistory(dishId)`. Remove the recipe and inventory-mode functions.
- `actions/sales.js`: remove the recipe paths, add the reference `S-`, add a debtor link for credit sales (`debtorId` or a new debtor).
- `actions/purchases.js`: descriptive lines; optional `stockAdds:[{dishId, plates}]`; reference `P-`.
- `actions/money.js`: references `R-`, `I-`, `E-`, `X-`, `K-`.

**Acceptance:** all new unit tests pass (§10.1). Integration tests cover add stock, sell, correct, opening edit (including refusal cases), purchase with stock adds, references (sequential, no duplicates under 20 concurrent posts), and invariants S1–S3.

### Phase 4: Menu & Stock page (2 days)

**Files**

- New route `app/(main)/d/[deptId]/menu-stock/page.jsx` (+ `loading.jsx`).
- Components in `components/restaurant/menu-stock/`:
  - `menu-stock-table.jsx` (sortable, searchable, sticky header, totals row, optional columns rule);
  - `add-dish-dialog.jsx`, `edit-dish-dialog.jsx`, `add-stock-dialog.jsx`, `correct-count-dialog.jsx`, `opening-stock-dialog.jsx`;
  - `dish-history-drawer.jsx`, `stock-summary-cards.jsx`, `stock-sheet-print.jsx`;
  - `use-live-refresh.js` (20 s visible-only refresh).
- Delete `components/restaurant/dishes-panel.jsx`, `stock-panel.jsx` and the pages `app/(main)/menu`, `app/(main)/stock` (redirects in P8).

**Behaviour:** exactly §8.4.

**Acceptance**

- Every column recomputes after each action without a page reload.
- The totals row equals the sum of the rows.
- The formula line is visible.
- Remove is blocked while plates > 0.
- Opening edit follows §7.4, with the refusal message.
- Past days behave as specified.

**Tests:**

- Component tests (Vitest + Testing Library) for the dialogs' validation.
- End-to-end: create 2 dishes → add stock with a purchase → sell on the POS in a second tab → Menu & Stock shows the new Sold/Closing/Value within 20 s and immediately after a reload → edit opening → closing recalculates → print the stock sheet (PDF snapshot).

### Phase 5: POS and debts (2 days)

**POS** (`/d/[deptId]/sell`): the §8.5 layout.

- Tiles from `getMenuStock`.
- The quantity stepper is capped at the plates available.
- Payment segmented control.
- Debtor combobox (search and create).
- Receipt component `components/restaurant/receipt-80mm.jsx` with a print stylesheet `@page { size: 80mm auto }`.

**Debts** (`/d/[deptId]/debts`):

- `actions/debts.js`: `createDebt({source: MANUAL|OPENING_BALANCE, debtorId|newDebtor, lines?|amount+description, date})`, `recordRepayment`, `voidDebt` (MANUAL only), `getDebtors`, `getDebtorStatement`.
- A MANUAL debt with lines posts a credit sale through the same service as the POS (one code path). An amount-only manual debt posts a credit sale with no lines, flagged `unlistedItems=true`.

**Acceptance**

- A credit sale creates a debt with reference `D-`.
- A repayment cannot exceed the balance and enters the drawer.
- The debtor balance equals the sum of that debtor's debts minus repayments.
- Debts appear in the report (§8.7 section 6).

**Tests:**

- Integration: all three sources, repayments (partial, full, over-payment refused), void manual, oversell refused, a concurrent sale of the last plate (one wins).
- End-to-end: a credit sale → the customer pays half → the debts page and report numbers match.

### Phase 6: Money in / out page (1 day)

- Route `/d/[deptId]/money` with the two-column layout (§8.6).
- One `money-entry-dialog.jsx` configured per type from the registry (`moneyInTypes`, `moneyOutTypes`).
- Categories in `data/categories.js`:
  - remove drinks;
  - keep the restaurant expenses (gas, electricity, water, transport, wages, cleaning, packaging, repairs, other);
  - keep rent and other-income categories;
  - discount reasons.
- Purchases are recorded here and in "Add stock" (same service).
- The standalone discount stays available (Head/Boss).

**Acceptance:** the four money-out and three money-in types can be recorded, voided (with reason) and listed with references. The totals at the top equal the report's figures.

**Tests:** integration for each type, plus void, plus the permission matrix; end-to-end: record one of each and compare with the report.

### Phase 7: Cash to Boss (0.5 day)

- Route `/d/[deptId]/cash-handover`.
- Live expected cash (§7.7) split by method.
- A handover cannot exceed the expected cash (the existing check) and gets reference `H-`.
- Printable slip.
- Boss confirm/dispute is moved to `/boss/cash`.

**Tests:** handover > expected refused; confirmed/disputed statuses affect the report as §7.7.

### Phase 8: Shell, navigation, routing, design system (2 days)

- `components/shell/*`: the fixed sidebar per §8.2 (active-department card, sections, role-based items from the domain registry), a top bar, a mobile drawer and a bottom bar.
- `app/(main)/d/[deptId]/layout.jsx` resolves the department from the URL (membership check), sets the "last department" cookie and provides the context.
- `/` redirects to `/boss` for the Boss, or to `/d/<last or primary>` for others. A user with more than one department and no last one goes to `/my-departments` (card chooser).
- **308 redirects** in `next.config.mjs`: `/restaurant`, `/menu`, `/stock`, `/daily-close`, `/transactions`, `/reports`, `/reports/inbox`, `/reports/daily/:id`, `/organization/:path*`, `/cash-handover`, `/debts`, `/dashboard`. The department-less ones go to a small resolver route `/go/[module]` that picks the active department.
- **Design tokens** in `app/globals.css`. `components/ops/primitives.jsx` is split into `components/ui-kit/` (PageHeader, StatCard, MoneyText, QtyText, DataTable with a totals row, EmptyState, StatusBadge, SectionCard, FormField, ConfirmSummary).
- **Copy pass:** apply §8.1 to every page.

**Acceptance:**

- No page has horizontal scroll at 1280 px or at 390 px.
- The sidebar never collapses at ≥ 1024 px.
- Every old URL redirects.
- Axe finds no serious or critical violations.

**Tests:** end-to-end navigation per role (the §8.3 matrix, visible and hidden items); screenshot tests of 6 key pages at desktop and mobile widths (Playwright `toHaveScreenshot`, 0.2% tolerance).

### Phase 9: Today's report, submission and the printed report (2 days)

- **Report snapshot schema v2** (`lib/reports/daily-report-model.js`), JSON-schema validated (zod) before saving:
  `{ schemaVersion:2, department:{id,name,code,domain}, dateKey, generatedAt, money:{…§7.6}, sales:{byDish:[…], count, plates}, stock:{rows:[{dishId,name,unitPrice,opening,added,sold,spoiled,corrections,closing,value}], totals:{…}, openingValue, closingValue}, debts:{opening,given,oldAdded,repaid,voided,closing, newDebts:[…], repayments:[…]}, cash:{…§7.7, byMethod:{…}}, handovers:[…], records:[{time, ref, type, description, amount, by, status}], notes, signOff:{submittedBy, submittedAt} }`
- Route `/d/[deptId]/report`: the live view, the counted-cash dialog, and "Send report to Boss" (confirmation with the summary).
- On submit (transaction): build the model, validate, save the `DailyReport` (+ `referenceNo DR-`) and `InventorySnapshot` rows per dish, lock the day, create a `Notification` for Boss users, and queue an e-mail (Inngest event `report/submitted`).
- Return and resubmit create version v+1; the old versions are kept (the existing behaviour).
- Components: `components/reports/daily-report-document.jsx`, one component for screen, print and PDF (sections 1–9, §8.7), with `print.css`.
- PDF route `app/api/reports/daily/[id]/pdf/route.js`: Playwright Chromium renders `/print/daily/[id]?token=` (a short-lived signed token) and uses `page.pdf({format:'A4', printBackground:true})`. Where headless Chrome is unavailable (serverless without Chromium), fall back to the browser print dialog (decision D10).

**Acceptance**

- The report is available any time.
- The printed version matches the screen figures.
- After submission the day is locked (refusal tests for every write action on a locked day).
- The Boss is notified.
- The snapshot re-renders identically even after the dish names or prices change later.

**Tests:**

- The reference day (§10.4) checks every printed number.
- A PDF text-extraction test asserts the key totals appear.
- Locked-day refusals.
- Resubmission versioning.

### Phase 10: Boss overview, daily reports section, cash received (2 days)

- `/boss`: §8.9 (KPIs with comparison to yesterday and the same weekday last week, alerts, department cards, report calendar, 30-day trend).
- `/boss/daily-reports`: calendar + list, filters in the URL (`?from=&to=&dept=&status=`), CSV export, "Mark all as reviewed".
- `/boss/daily-reports/[id]`: the printed layout plus Approve / Return with note (required) plus version diff.
- `/boss/cash`: pending handovers first, confirm/dispute (note required for dispute), monthly totals.
- `lib/boss/alerts.js`: missing report (yesterday not submitted by 08:00), variance ≠ 0, out-of-stock dishes, pending handovers > 24 h, report returned and not resubmitted, big discount (> 10% of the day's sales).
- Notifications: a bell dropdown backed by the `Notification` table (read/unread). E-mails through Inngest functions (`report-submitted`, `missing-report-morning`, `weekly-summary`, `monthly-statement`), each with a Boss preference toggle in settings.

**Acceptance:** the Boss can answer these from `/boss` without opening a department:

- how much came in and went out today and this month;
- which reports are missing;
- how much cash he received;
- who owes money;
- which dishes are out.

**Tests:** integration for the alert rules (each with a fixture); end-to-end: two departments, one submits, one doesn't → the calendar and alerts are correct → approve and return flows.

### Phase 11: Financial statements (2 days)

- `lib/finance/statements.js`: `incomeStatement`, `cashStatement`, `stockStatement`, `debtStatement` for `{scope, from, to, basis, compare}`, built only from §7 functions.
- Route `/statements`: the period picker (presets plus custom), the scope picker (Boss: any departments; Head: own), the basis toggle, the compare toggle, four tabs (§8.8) and charts (Recharts, printed as SVG).
- Print A4 landscape for the stock statement and portrait for the others; PDF via the same PDF route pattern; CSV export per statement.
- Drill-down links to `/d/[id]/history?type=&from=&to=` with exact filters.

**Acceptance:**

- For the reference month fixture, every statement line equals the hand-computed value.
- The sum of daily reports equals the monthly statement (Invariant R1).
- Drill-down sums equal the figure (R2).
- Printing has no clipped tables.

**Tests:** unit tests of the statement builders on fixtures; an integration test for R1/R2; end-to-end: print and export.

### Phase 12: History and traceability (1 day)

- `/d/[deptId]/history`: one list of **all** records (sales, money, debts, repayments, handovers, stock additions and corrections). Filters: date range, type, person, status, reference search; totals of the filtered rows.
- The record drawer shows: reference, type, amounts, lines, who and when, device/IP (from the audit), status, and the void reason. The **audit trail** shows each `AuditEvent` with before/after (human-readable diff), links to related records (sale ↔ debt ↔ repayments; purchase ↔ stock additions), and attachments.
- Every report and statement line links here.

**Tests:** for each record type, create → find by reference → the drawer shows the correct links and audit.

### Phase 13: Remove the legacy model and dead code (1 day), after P3–P12 have been in production for ≥ 2 weeks

- Migration `drop_legacy`: drop `RecipeIngredient`, `DepartmentStockItem` (after the CSV export exists and the owner confirms), `DailyStockRecord`, `Budget`, the legacy `Transaction` columns, `PurchaseLine.stockItemId/menuItemId`, `MenuItem.inventoryMode/openingQuantity`, `InventorySnapshot.stockItemId`, and enums `DishInventoryMode`, `StockTrackingPeriod`, `RecurringInterval`.
  - PostgreSQL cannot drop enum values easily. Keep the legacy movement types but make them read-only, and document this.
- Delete the files in §11.
- Nightly **consistency job** (Inngest cron 02:00): recompute `currentQuantity` from the movements for every dish. On mismatch, **do not auto-fix**: create an alert for the Boss and log it (with the dish and the difference).

**Tests:** the suite stays green; the migration is rehearsed on a production copy (§12).

### Phase 14: Hardening, performance, release (1.5 days)

**Performance**

- Indexes: `(departmentId, date)` on `StockMovement` (exists), `(menuItemId, date)` (exists), `(departmentId, type, date)` on `Transaction`, `(departmentId, status)` on `Debt`, `(userId, readAt)` on `Notification`.
- Day queries must run in < 150 ms for 10 000 records per department; the statement for a month in < 1 s.
- Use `EXPLAIN ANALYZE` in a test script.

**Other hardening**

- **Security:**
  - rate-limit sensitive actions (login already; add submit and void);
  - session rotation on password change;
  - `httpOnly`, `secure`, `sameSite=lax` cookies;
  - CSP headers in `next.config.mjs`;
  - file-upload scanning stays (type sniffing, 5 MB).
- **Backups:** Supabase PITR or daily backups enabled; restore rehearsal documented.
- **Error monitoring:** Sentry (or equivalent), with the error id shown to the user ("Error E-7F3A; tell your admin").
- **Release:** follow §12, with release notes for the owner in plain language.

---

## 10. Test plan and the reference day

### 10.1 Unit tests (Vitest, pure functions; target ≥ 95% line coverage of `lib/restaurant`, `lib/finance`, `lib/reports`)

| Module | Cases (minimum) |
|---|---|
| `stock-math.dayPositions` | Empty day; only opening; add + sell; spoiled; correction ±; opening correction ±; legacy movement types mapped; voided movements ignored; movements exactly at 00:00:00.000 and 23:59:59.999 in Africa/Douala; a dish created mid-day; an archived dish with history. |
| `stock-math.validateOpeningEdit` | Allowed increase; allowed decrease; decrease refused because later days would go negative (message includes the dish and the minimum); no-change is a no-op. |
| `stock-math.stockValue` | Selling-price basis; the price in force on the day; zero plates; many dishes (total = Σ rows). |
| `money-math.dayMoney` | Each of the 3 in and 4 out types alone; all together (the reference day); voided excluded; credit sale counted in sales gross; debt repayment **not** counted as income; handover **not** counted as out. |
| `cash-math.drawer` | Opening cash; each in/out; supplier-credit purchase not reducing cash; handover statuses (RECORDED/CONFIRMED counted, DISPUTED not); counted and variance sign. |
| `debt-math` | Opening + given + old − repaid − voided; ageing buckets. |
| `sequence` formatting | `S-0001`, year rollover, padding beyond 9999 (`S-10000`). |
| `formatMoney` | `1 250 000 FCFA`, negatives in both styles, 0. |
| `daily-report-model` | The zod schema accepts the reference snapshot and rejects missing sections. |

### 10.2 Integration tests (real server actions on a disposable Postgres; the existing harness)

- **Stock:** add dish; duplicate name refused (case-insensitive); add stock (with and without purchase); correct count (each reason); opening edit (allowed, refused, locked-day refused); archive with plates > 0 refused; restore.
- **Sales:**
  - cash, MoMo, bank and credit;
  - discount with reason (refused without a reason; refused above gross; cashier discount above the limit refused);
  - oversell refused;
  - **concurrency:** 10 parallel sales of the last 5 plates, where exactly 5 succeed and stock ends at 0;
  - void restores stock and removes the revenue; void after submission refused.
- **Money:** each type; categories valid per type; void with reason; accountant can record expenses only.
- **Debts:** 3 sources; repayments; over-payment refused; void manual only; debtor balance.
- **Handover:** > expected refused; confirm; dispute; effect on expected cash.
- **Reports:** submit needs counted cash; the day is locked for **every** write action (a table-driven test over all actions); return unlocks; resubmit makes v2; the snapshot is immutable after later dish or price edits.
- **Permissions:** the §6.7 matrix, one allowed and one refused test per cell (table-driven).
- **Multi-department:** a user in a Restaurant and a Bar department can operate only the restaurant one; the active-department switch; the Boss of organisation A cannot read organisation B (for every read action).
- **References:** 20 concurrent posts produce 20 distinct consecutive numbers.
- **Invariants** (run after every integration test file, as a global `afterEach` for the stock/money suites):
  - S1 `closing(today) == currentQuantity` for every dish;
  - S2 `opening(D+1) == closing(D)` (no correction);
  - S3 no negative plates;
  - C1 `openingCash(D+1) == expectedAfterHandover(D)`;
  - R1 Σ daily reports = statement;
  - R2 drill-down Σ = figure.

### 10.3 Property-based tests (fast-check)

Generate random valid sequences of operations for one department over 3 days:

- add dish;
- add stock;
- sell (random quantities, some exceeding stock);
- correct;
- edit opening;
- money in/out;
- debt and repay;
- handover;
- void.

After every step, assert the invariants S1–S3 and C1, and that refused operations changed nothing. Run 200 sequences in CI (seeded).

### 10.4 The reference day (hand-computed; the acceptance oracle for P3–P11)

**Setup, day D−1 (closing state, created by a fixture):**

- The organisation "Test Company", with department "Department 1" (Restaurant, code RST).
- Dishes:
  - **Dish A**, unit price 2 000, closing 20 plates;
  - **Dish B**, unit price 3 000, closing 10 plates.
- Drawer expected cash after handover **10 000**.
- Customer 1 owes **9 000** (debt from D−1).
- The fixture inserts D−1 records directly, so every reference sequence starts at 0001 on day D, except debts: Customer 1's debt is D-0001.

**Day D events** (in this order; times in Africa/Douala):

| # | Time | Who | Action | Reference |
|---|---|---|---|---|
| 1 | 07:50 | Head | Edit opening stock: Dish B calculated 10 → actual **9**, reason "Morning count" | C-0001 |
| 2 | 08:30 | Head | Add stock: Dish A **+10** plates, "This stock was bought" 12 000 cash, supplier "Market" | A-0001 + P-0001 |
| 3 | 11:00 | Cashier | Sale: Dish A × 15, cash | S-0001 = 30 000 |
| 4 | 12:10 | Cashier | Sale: Dish A × 3, **on credit** to Customer 2 | S-0002 = 6 000 · D-0002 |
| 5 | 13:00 | Cashier | Sale: Dish B × 8, discount 1 000 "Promotion", cash | S-0003 gross 24 000, net 23 000 |
| 6 | 13:05 | Cashier | Sale: Dish B × 2 → **refused** (only 1 plate left) | none (no change) |
| 7 | 14:00 | Cashier | Sale: Dish A × 1, cash | S-0004 = 2 000 |
| 8 | 14:02 | Head | Void S-0004, reason "Entered twice" | S-0004 VOID |
| 9 | 15:00 | Head | Rent income 15 000 cash (tenant "Stall 3") | R-0001 |
| 10 | 15:30 | Head | Other income 2 000 cash ("Event fee") | I-0001 |
| 11 | 16:00 | Head | Expense 5 000 cash ("Cooking gas") | E-0001 |
| 12 | 16:10 | Head | Other expense 1 000 cash ("Bank charges") | X-0001 |
| 13 | 17:00 | Cashier | Customer 1 repays 4 000 cash | Y-0001 |
| 14 | 20:00 | Head | Cash handover 60 000 to Boss | H-0001 |
| 15 | 21:30 | Boss | Confirms H-0001 | |
| 16 | 21:45 | Head | Counted cash **5 500**, sends report | DR-0001 |

**Expected figures (every one is asserted in tests and in the printed PDF):**

| Figure | Value | Working |
|---|---|---|
| Dish A: opening / added / sold / closing | 20 / 10 / 18 / **12** | 20 + 10 − 18 (S-0004 voided) |
| Dish B: opening / added / sold / closing | **9** / 0 / 8 / **1** | 10 − 1 correction; 9 − 8 |
| Plates closing total | **13** | 12 + 1 |
| Opening stock value | **67 000** | 20×2 000 + 9×3 000 |
| Closing stock value | **27 000** | 12×2 000 + 1×3 000 |
| Sales (gross) | **60 000** | 30 000 + 6 000 + 24 000 |
| Discounts | **1 000** | |
| Net sales (memo) | **59 000** | |
| Rent income / Other income | 15 000 / 2 000 | |
| **Money in** | **77 000** | 60 000 + 15 000 + 2 000 |
| Purchases / Expenses / Other expenses | 12 000 / 5 000 / 1 000 | |
| **Money out** | **19 000** | 1 000 + 12 000 + 5 000 + 1 000 |
| **Result of the day** | **58 000** | 77 000 − 19 000 |
| Cash in | **74 000** | 30 000 + 23 000 + 15 000 + 2 000 + 4 000 |
| Cash out | **18 000** | 12 000 + 5 000 + 1 000 |
| Expected cash (before handover) | **66 000** | 10 000 + 74 000 − 18 000 |
| Handed over (confirmed) | 60 000 | |
| Should remain | **6 000** | |
| Counted / Variance | 5 500 / **−500** | shortage |
| Debts: opening / given / repaid / closing | 9 000 / 6 000 / 4 000 / **11 000** | |
| Next day D+1 | Opening A = 12, B = 1; opening cash = 6 000; debts = 11 000 | Invariants S2, C1 |
| After submission | Every write on D is refused; Boss has 1 notification; e-mail queued | |

A **reference month** fixture (30 generated days with a fixed seed, plus 3 returned-and-resubmitted days) is used for the statement tests. Its expected totals are computed by an **independent** simple script (`tests/support/oracle.mjs`) that re-implements §7 in the most naive way. Two independent implementations must agree.

### 10.5 End-to-end tests (Playwright; desktop 1440×900 and mobile 390×844)

1. **Owner onboarding:** register → company → 2 departments (Restaurant, Pressing) → 3 people (head of both, cashier, accountant) → done checklist.
2. **Reference day through the UI:** the head and the cashier in two browser contexts perform §10.4 steps 1–16; after each step, assert the Menu & Stock totals, the Money page totals, the Debts totals, the expected cash, and at the end every number of the printed report (DOM) plus the PDF text.
3. **Boss review:** the calendar shows sent → open → return with note → the head sees the note, fixes it, resends (v2) → the Boss approves → the statements show "Final".
4. **Multi-department head:** switches between the Restaurant and Pressing departments; the navigation changes; the coming-soon page renders for Pressing.
5. **Permissions in the UI:** the cashier doesn't see price edits, opening edits, money-out, submit or Boss pages; direct URL access is refused.
6. **Every page smoke test** for each role (the existing `all-pages.spec.mjs`, extended to the new routes and roles), asserting no console errors and no error boundary.
7. **Redirects:** every old URL lands on the new page.
8. **Accessibility:** `@axe-core/playwright` on 10 key pages, with no serious or critical issues.
9. **Visual:** screenshot baselines for Menu & Stock, POS, Today's report (screen and print media), Boss overview, Daily reports calendar, and the Income statement.

### 10.6 Non-functional checks

- **Print:** emulate `media: print` and assert no element overflows the A4 width (a script checks `scrollWidth` ≤ the page width for each section); page breaks are not inside tables' rows.
- **Performance:** seed 10 000 records/department; the day page is < 300 ms server time, the statement month < 1 s (a script in `scripts/perf-check.mjs`, run manually before release).
- **Security:** an authorisation test for every server action (unauthenticated → refused; other organisation → refused); file upload of a non-image or PDF is refused; > 5 MB is refused.

---

## 11. Files and features to delete

Delete these in the phase indicated. All history remains in git and in the pre-upgrade backup zip.

| Phase | Path / item | Reason |
|---|---|---|
| P1 | `actions/seed.js`, `app/api/seed/route.js` | A demo seed inside the product. It is replaced by the CLI-only `scripts/seed-dev.mjs` with neutral names. |
| P4 | `app/(main)/menu/`, `app/(main)/stock/`, `components/restaurant/dishes-panel.jsx`, `components/restaurant/stock-panel.jsx` | Replaced by Menu & Stock. |
| P5 | `components/restaurant/pos-panel.jsx`, `components/restaurant/debt-ledger.jsx`, `app/(main)/debts/` | Replaced by `/d/[id]/sell` and `/d/[id]/debts`. |
| P6 | `components/restaurant/money-panel.jsx`, `components/restaurant/purchases-panel.jsx`; `scanReceipt` in `actions/money.js` (Gemini receipt scan) | Replaced. Receipt AI is unreliable for handwritten local receipts and adds cost and complexity. It can come back later behind a flag (D11). |
| P7 | `app/(main)/cash-handover/`, `components/restaurant/handover-list.jsx` | Moved to `/d/[id]/cash-handover` and `/boss/cash`. |
| P8 | `app/(main)/restaurant/` (workspace with tabs), `components/restaurant/workspace-tabs.jsx`, `app/(main)/dashboard/`, `app/(main)/transactions/`, `app/(main)/transaction/create/`, `app/(main)/account/[id]/` (moved to `/boss/settings/drawers/[id]`), `app/(main)/organization/*` (moved to `/boss/*`), `lib/domain-capabilities.js`, `components/ops/primitives.jsx` (split into ui-kit), `app/(auth)/sign-in`, `app/(auth)/sign-up` (the old Clerk URLs; keep a redirect in `next.config.mjs` instead of the pages) | Replaced by the new routes and shell. |
| P9 | `app/(main)/daily-close/`, `components/restaurant/daily-close-actions.jsx`, the old `components/restaurant/daily-report-document.jsx` | Replaced by the report module. |
| P10 | `app/(main)/reports/inbox/`, `app/(main)/reports/daily/[id]/`, `components/reports/inbox-filters.jsx`, `components/reports/review-actions.jsx` | Replaced by `/boss/daily-reports`. |
| P11 | `app/(main)/reports/page.jsx`, `components/reports/statement-filters.jsx`, `lib/reporting-service.js` statement parts (`buildPeriodSummary`, `buildApprovedStatement`) | Replaced by `/statements` and `lib/finance/statements.js`. |
| P13 | `actions/stock.js` (ingredient stock), recipe functions in `lib/ledger-service.js` (`recipeAvailability`, `recipeUnitCost`, `aggregateIngredientNeeds`), `calculateWeightedAverageCost`, `reverseWeightedAverageCost`, `lib/inventory.js` ingredient functions, `getLegacyStockRecords`, `data/categories.js` drink entries, `PURCHASE_CATEGORIES` drink entry; DB objects in §9 P13 | The ingredient/recipe model is not wanted in the restaurant domain. It is **not** thrown away conceptually: the **Bar** and **Shop** domains will need unit-based stock, which will be designed fresh in `lib/domains/bar` using the same movement pattern. |
| P13 | `lib/inngest/function.js` `monthlyStatementEmail` | Replaced by the P10 e-mail functions. |
| any | `public/banner.jpg` if unused after the P8 landing redesign; `components.json` stays (shadcn tooling). | Unused asset. |

**Keep:** `lib/access.js`, `lib/permissions.js` (updated), `lib/money.js`, `lib/timezone.js`, `lib/audit.js`, `lib/attachments.js`, `lib/idempotency.js`, `lib/transaction-runner.js`, `lib/posting-guard.js`, `lib/void-service.js` (simplified), `lib/rate-limit.js`, `lib/observability.js`, `lib/errors.js`, `lib/action.js`, `lib/jwt-secret.js`, `lib/auth.js`, `proxy.js`, the email template, periods, accounts/drawers, tests and harness.

---

## 12. Data migration and go-live

1. **Freeze:** announce a 1-hour window (evening, after the reports are sent).
2. **Backup** production: `pg_dump` plus a Supabase snapshot. Store two copies.
3. **Rehearse** on a restored copy (staging):
   - `npx prisma migrate deploy`;
   - run `node scripts/migrate-v2.mjs --dry-run`, then run it for real;
   - run `node scripts/verify-v2.mjs`, which recomputes invariants S1–S3, C1 and R1 for the last 60 days and prints mismatches.
   - It must print **0 mismatches**, or the owner must accept each listed one (for example recipe dishes that start at 0 plates).
4. **Owner review on staging:**
   - log in as the Boss and a head;
   - check yesterday's report and this month's statement against his own paper records;
   - enter the opening stock of the former recipe dishes.
5. **Production:** repeat step 3 on production and deploy the application build.
6. **Smoke** (10 min): the every-page smoke test against production with a read-only test user; one real sale by the head; check the report.
7. **Rollback plan:** migrations are additive until P13. Rollback is "redeploy the previous build". The data written in the meantime stays valid because the old code ignores the new columns. P13 (drops) runs only after 2 weeks of stable use, and only after a fresh backup.
8. **Communicate** plain-language release notes to users: "Menu and stock are now one page", "Opening stock can be corrected each morning", "Debts can be recorded directly", "Reports go to the Boss's Daily reports".

---

## 13. Decisions taken, open questions and risks

Decisions marked **(default)** are what the implementer does unless the owner says otherwise. Change the default by editing this table before the phase starts.

| # | Question | Default taken | Alternatives |
|---|---|---|---|
| D1 | Stock value basis | **Unit (menu) price** × plates, as the owner described. If a cost per plate is entered, also show "value at cost". | Cost-only valuation (standard accounting); both always. |
| D2 | Spoiled plates | **Supported** as an optional reason in "Correct a count". The column is shown only when non-zero. | Not supported (every loss is a plain correction). |
| D3 | Can a cashier give discounts? | **No** by default. The Boss can set a limit per department (FCFA per sale). | Always allowed with a reason. |
| D4 | Amount-only manual debt (no dishes) | **Allowed**, posted as a credit sale of "Unlisted items" (revenue, no stock), flagged in the report. | Force choosing dishes. |
| D5 | Split payment on one sale (part cash, part credit) | **Not in v2.** Record two sales. | Add payment lines per sale (schema `SalePayment`). |
| D6 | Cash variance handling | **Stays visible.** The Boss decides; no automatic write-off. | An automatic "cash over/short" record on approval. |
| D7 | Department in the URL (`/d/[id]/…`) | **Yes.** | Keep the cookie-only active department. |
| D8 | Live updates | **Refresh after actions plus a 20 s visible-tab poll.** | Server-sent events or Supabase Realtime (later). |
| D9 | Must the head confirm the opening stock every morning? | **Optional** (a to-do reminder, not a blocker). | Block sales until the opening is confirmed. |
| D10 | PDF generation | **Headless Chromium** where available, with a browser print fallback. | `@react-pdf/renderer` (a separate layout to maintain). |
| D11 | Receipt AI scan (Gemini) | **Removed** from v2. | Keep behind a feature flag. |
| D12 | Keep the Accountant role | **Yes** (read-all + expenses). | Remove it. |
| D13 | Should approved reports allow later edits? | **No.** Only the Boss can return a report, which reopens the day, and a new version is created. | Adjustments posted on a later day. |
| D14 | Purchases on supplier credit | Recorded as a purchase with method "Supplier credit" (money out, no cash out); **supplier debts ledger not in v2.** | A payables module. |

**Open questions for the owner** (answers change only details, not the plan):

1. Are there dishes sold both as a full plate and a half portion? If yes, a later "portion size" option or two dishes (the default: two dishes).
2. Should takeaway packaging be charged separately (as a dish "Packaging")? (Default: yes, as a normal dish.)
3. Who is the **"CEO"** receiving cash: always the Boss user, or also a named cashier or administrator? (Default: a free-text receiver, defaulting to the Boss.)
4. Report deadline: what time counts as "late"? (Default: 23:59 of the day; "missing" from 08:00 the next morning.)
5. Do you want SMS/WhatsApp notifications later? (The design allows adding channels to `Notification`.)

**Risks and mitigations**

| Risk | Impact | Mitigation |
|---|---|---|
| Recipe dishes and ingredient stock in the live DB cannot be auto-converted to plates | Wrong opening stock on day 1 | CSV export, the owner enters the opening on staging before go-live, and the opening edit stays available (§7.4). |
| Editing a past opening makes later days negative | Impossible stock | The forward guard (§7.4) and property tests. |
| Two cashiers selling the last plate | Oversell | Atomic conditional decrement (kept), plus the concurrency tests. |
| Price change alters past reports | Disputes | Prices are snapshotted on the sale lines and report; the valuation uses the price on the day. |
| Staff type into the wrong department | Wrong figures | The department is in the URL and the header; the confirmation summary names the department; void and resubmit flows. |
| PDF engine missing on the host | No PDF | The browser print fallback; test both. |
| Scope creep into other domains | Delay | The domains are coming-soon placeholders only; the registry keeps them isolated. |

---

## 14. Future domains (how the design extends)

When restaurant v2 is complete and stable:

| Domain | Catalog | Stock model | Special modules | Reuses |
|---|---|---|---|---|
| **Bar / snack bar** | Drinks and snacks | **Units** (bottles, crates → bottles conversion) with movements, same pattern as plates | Crate deposits (empties), happy-hour pricing | POS, money, debts, handover, report, statements |
| **Pressing (dress wash)** | Services (wash, iron, dry-clean per garment type) | None (optional consumables) | **Garment tickets**: intake → washing → ready → collected; a pickup code; unpaid-on-pickup becomes a debt | Money, debts, handover, report |
| **Car wash** | Services per vehicle type | Consumables (optional) | Vehicle queue, washer assignment and commission | Money, handover, report |
| **Room / hall rental** | Rooms and halls | None | Booking calendar, deposits, check-in/out | Rent income, debts, report |
| **Material rental** | Items (chairs, canopies …) | Units out / in (rented out, returned, damaged) | Deposits, late fees | Movements pattern, debts |
| **Shop** | Products | Units, cost and price | Barcode, supplier payables | POS, movements, statements |

Each new domain:

1. adds `lib/domains/<domain>/*`;
2. declares its navigation, money types, dashboard cards and report sections;
3. adds domain-specific tables only when the shared ones do not fit;
4. adds its own reference-day test before it is enabled.

The Boss overview and statements work unchanged, because every domain reports through the same money model (§7.6).

---

## 15. Definition of done

The restaurant v2 is done when **all** of the following are true:

- [ ] Every requirement R1–R28 has its phase merged and its tests green.
- [ ] The reference day (§10.4) passes at the unit, integration, end-to-end (DOM) and PDF levels, and the reference month statements pass against the independent oracle.
- [ ] Invariants S1–S3, C1, R1 and R2 are checked in CI, and the nightly job has reported no mismatch for 7 days in production.
- [ ] No page shows `NaN`, `undefined`, an empty figure, or a figure that is not produced by the §7 services (checked by a grep test for inline `reduce(` on money in `components/`, plus code review).
- [ ] Lint, unit, integration, end-to-end, accessibility and visual tests are green in CI; the production build passes.
- [ ] The owner has signed off on staging with his own real day's data.
- [ ] `README.md`, `docs/IMPLEMENTATION_STATUS.md` and user release notes are updated; old routes redirect; the legacy code is deleted (P13).

---

## 16. Additional recommendations

These go beyond the brief; each is small and adds robustness.

1. **Offline-tolerant POS (later):** keep a local queue of sales when the network drops and sync with idempotency keys (the keys already exist). This is important in Cameroon connectivity conditions.
2. **Daily opening checklist for the head:** confirm opening stock, and confirm the opening cash float (counted) at shift start. This makes cash variances attributable to a shift.
3. **Shifts (later):** tag each record with a shift (morning/evening) and cashier so the report can split by shift. The schema can add `Shift` without touching the money model.
4. **Price list history page** per dish (who changed a price and when). It comes almost for free from the audit events.
5. **Boss mobile first:** the Boss overview and daily reports must be excellent on a phone (a large-number cards layout, the calendar scrolls horizontally, the PDF opens in the phone viewer).
6. **Backups visible to the Boss:** a settings card "Last backup: today 03:00" (read from the Supabase API, or a nightly job that records a heartbeat).
7. **Data export:** a Boss can export all records of a period as CSV/Excel for his accountant.
8. **Two-person rule for big voids:** voiding a sale above a threshold (for example 50 000 FCFA) requires Boss approval (a notification plus approve).
9. **Session safety:** auto-logout after 12 h of inactivity on shared POS devices, with a quick switch-user PIN for cashiers (later).
10. **Monitoring:** uptime check on `/login`; alert the owner by e-mail if the site is down for more than 5 minutes.

---

### Appendix A: Effort summary

| Phase | Days |
|---|---|
| P0 Baseline | 0.5 |
| P1 Clean-up | 0.5 |
| P2 Domains | 1 |
| P3 Stock model and services | 3 |
| P4 Menu & Stock | 2 |
| P5 POS and debts | 2 |
| P6 Money | 1 |
| P7 Cash to Boss | 0.5 |
| P8 Shell and design system | 2 |
| P9 Report | 2 |
| P10 Boss | 2 |
| P11 Statements | 2 |
| P12 History | 1 |
| P13 Legacy removal | 1 |
| P14 Hardening and release | 1.5 |
| **Total** | **≈ 22 working days** (one engineer), plus owner reviews |

### Appendix B: Checklist per pull request (copy into the PR description)

- [ ] Phase and requirement ids referenced (for example "P4 · R14 R15 R17").
- [ ] Tests added first; the whole suite green locally and in CI.
- [ ] Migrations are additive and idempotent; rehearsed on a staging copy if they touch data.
- [ ] Every new action: permission check, domain check, locked-day and period guard, idempotency key, audit event, reference number, revalidation map.
- [ ] No money maths in components; figures come from the §7 services.
- [ ] Plain-language copy (§8.1); empty and loading states; mobile checked; print checked if printable.
- [ ] Screenshots of the changed screens attached.
- [ ] `docs/IMPLEMENTATION_STATUS.md` updated.
