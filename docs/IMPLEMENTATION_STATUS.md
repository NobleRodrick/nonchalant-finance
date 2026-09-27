# Implementation status: Restaurant v2

Status as of 26 Sep 2026, against [`RESTAURANT_V2_IMPLEMENTATION_PLAN.md`](RESTAURANT_V2_IMPLEMENTATION_PLAN.md).
Phases 0–12 and 14 are implemented and tested. Phase 13 (dropping the legacy tables) is intentionally
postponed until v2 has run in production, as the plan requires.

## Phases (§9)

| Phase | What was built | Evidence |
|---|---|---|
| 0 Baseline | Test database rebuilt from migrations; lint, unit, integration, E2E and build all green. | `scripts/reset-test-db.mjs`, `e2e/global-setup.mjs` |
| 1 Clean-up | No example business names anywhere; neutral placeholders; no drinks in restaurant categories; demo seed removed. | `data/categories.js`, `app/(setup)/onboarding`, `app/page.jsx` |
| 2 Department types | Type chosen at creation (restaurant, bar, pressing, car wash, room rental, material rental, shop, other); only restaurant enabled; others show "coming soon"; type locked once the department has records; department codes. | `lib/domains/registry.js`, `components/boss/department-type-picker.jsx`, `components/domains/coming-soon.jsx`; test "department types" |
| 3 Stock model & references | A dish is a menu line and a stock line (plates); signed movements; `currentQuantity` kept with conditional decrements; opening edit as `OPENING_CORRECTION`; per-department reference numbers (`S-`, `P-`, `E-`, `H-` …). | `lib/restaurant/*`, `lib/documents/sequence.js`, migrations `20261001090000_restaurant_v2` and `…_backfill` |
| 4 Menu & Stock page | One page: add / edit / remove / restore dishes, add stock (optionally a purchase), correct a count (spoiled, staff, other), edit the opening, live value, low stock, dish history, printable stock sheet. | `components/restaurant/menu-stock*.jsx`, `actions/menu-stock.js`; integration "menu & stock", E2E test 2 |
| 5 POS & debts | Point of sale with cash / Mobile Money / bank / credit; discount with reason (cashier limit per department); unlisted items; no overselling; debtors, old debts, repayments, cancel. | `components/restaurant/pos.jsx`, `debts.jsx`, `lib/finance/posting-service.js`; integration "concurrency", "debts", "discount limit"; E2E tests 3–4 |
| 6 Money in / out | Rent, other income, purchases (lines, optional stock), expenses, other expenses; permissions per role (accountant: expenses only). | `components/restaurant/money.jsx`, `actions/money.js` |
| 7 Cash to Boss | Only department heads hand cash over (reference, proof); the Boss requests the cash of a day or period (heads notified, amount due shown live), then confirms or disputes; voiding the handover reopens the request; the drawer counts physical cash only. | `actions/handovers.js`, `actions/cash-requests.js`, `lib/finance/cash-requests.js`, `components/restaurant/cash.jsx`, `components/boss/cash-requests.jsx`; `tests/integration/cash-requests.test.js`, E2E test 5 |
| 8 Shell & routing | Fixed dark sidebar, department switcher (multi-department, mixed types), notifications, phone drawer, `/d/[deptId]/…` URLs, old links redirect. | `components/shell/*`, `proxy.js`, `next.config.mjs`; `e2e/navigation.spec.mjs` |
| 9 Today's report | Live report (money, sales by dish, stock, debts, cash drawer, handovers, every record); count the cash; send to the Boss; returned → version 2; print layout (A4). | `lib/reports/daily-report.js`, `components/reports/daily-report-document.jsx`, `actions/daily-report.js`; E2E test 6 |
| 10 Boss | Overview (today, month, alerts, 7-day report calendar, 30-day trend), Daily reports (filter by date and department, review, approve / return), Cash received, Departments, People, Settings. | `lib/boss/overview.js`, `app/(main)/boss/*`, `components/boss/*` |
| 11 Statements | Income, cash, stock and debts for any period and any departments, previous-period comparison, "Final / Provisional" coverage, print, CSV, on-demand AI insights. | `lib/finance/statements.js`, `components/reports/statements.jsx`, `components/reports/ai-insights.jsx`; E2E test 7, `tests/integration/insights.test.js` |
| 12 History | Every record with reference, author, time, detail and void (with reason). | `lib/history.js`, `components/restaurant/history.jsx` |
| 13 Drop legacy model | **Postponed** by design: `DepartmentStockItem`, `RecipeIngredient`, `DailyStockRecord` stay in the schema (no code uses them) until v2 has run ≥ 2 weeks in production. | `prisma/schema.prisma` |
| 14 Hardening | Idempotency keys, audit events, access checks per department and role, cross-organization isolation, accessibility checks (axe) on every page, no horizontal scroll on phones. | `tests/integration/operations.test.js`, `e2e/all-pages.spec.mjs` |

## The reference day (§10.4)

Every figure of the hand-computed day is asserted through the real server actions
(`tests/integration/reference-day.test.js`) and again through the browser (`e2e/restaurant-day.spec.mjs`):
money in 77 000, money out 19 000, result 58 000, cash variance −500, stock value 27 000, debts 11 000 FCFA.

## Test totals (27 Sep 2026)

| Suite | Result |
|---|---|
| Unit (`tests/unit`) | 23 passed |
| Integration (`tests/integration`, 8 files) | 64 passed: department head, reference day, operations, cash requests, insights, and platform (sign-in, passwords, people, settings, accounting periods, attachments, notifications, record details, scheduled jobs) |
| End-to-end (`e2e`, desktop + phone) | 20 passed: restaurant day, every page for the Boss, a head of one department and a head of two departments (with accessibility checks), navigation, the Boss manages heads and departments, homepage |
| Real data | The production copy (all migrations applied) opened by each real account: 108 page visits, no error |
| `npm run lint`, `npm run build` | clean |

## Boss and department heads (27 Sep 2026)

- The Boss oversees and manages; he records nothing. Permissions: read departments and reports, review reports, statements, confirm cash, manage the organization (departments, people, settings). Department pages are read-only for him (a "view only" strip links to Team, Reports, Cash); Sell is not in his menu.
- His sidebar starts with the business (Overview, Departments, People, Daily reports, Cash received, Statements, Settings), then "Look into a department".
- Departments, the overview and the department home show each department's head and team, and warn when a department has no head. People can be filtered by department and role.
- Heads correct (void) records on any day that is not locked; a sent report is corrected after the Boss returns it.
- The public homepage presents a business-management platform (department types, roles, how it works); restaurant is the first type available.

## Two roles: the Boss and department heads (27 Sep 2026)

- `UserRole` is `ADMIN` (the Boss who created the business) or `HEAD` (everyone he adds); migration `20261005090000_two_roles` converts every other account to `HEAD`, keeps the old role as the person's **title** (`users.title`: Manager, Accountant, Cashier) and removes per-department role overrides and the short-lived `departments.headUserId`.
- A person heads every department they are assigned to (one or several); the Boss adds or removes heads from the department cards, in People (tick the departments, star the one that opens first) and during setup. A head keeps at least one department.
- Heads hold every operating permission (sales, stock, money, debts, voids, cash to the Boss, daily report); the Boss oversees and manages. Titles never change permissions.
- Screens: the "Department head" tag and the title everywhere (People, department cards, the department home, the sidebar, the profile); "My departments" shows a head's departments with today's money in, result, report status and the Boss's cash requests. Tests: `tests/integration/department-head.test.js`, e2e "A head of two departments".

## Differences from the plan

- **PDF (D10):** printing uses the browser's print / "Save as PDF" with a dedicated A4 print layout, not a server-side PDF engine.
- **Cash drawer:** counts physical cash only; Mobile Money and bank are shown separately in the report.
- **Statements** always use the live records; each statement shows whether every daily report of the period is approved ("Final") or not yet ("Provisional").
- **Property-based tests (§10.3)** are not added; the maths is covered by example-based unit tests and the reference day.

## Production (27 Sep 2026)

- The live Supabase database was backed up to JSON (`_db-backup-2026-09-27/` in the owner's folder, 65 rows in 22 tables)
  and the migration was rehearsed on a restored copy: no schema drift, all rows kept, every page loads for the
  existing Boss accounts.
- Then applied to production: old `20251115144259_craete_models` history row removed, `0_baseline` marked applied,
  the four migrations deployed. Only the retired personal-finance `budgets` table (3 rows) was dropped; it is in the backup.
- The app runs locally against production with `npm run dev`.
