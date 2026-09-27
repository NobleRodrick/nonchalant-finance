# Springer Finance

A platform to run a business with several departments (FCFA, Cameroon): the owner registers the business,
creates its departments and assigns their heads and staff.
Each department has a **type** chosen when it is created: restaurant, bar, pressing, car wash,
room rental, material rental, shop or other. **Restaurant is fully built**; the other types can be
created and staffed and show a "coming soon" workspace until their modules are added.

The Boss oversees and manages: business performance, departments, people, daily reports, cash and statements.
He looks into any department read-only. Each department head runs the day with his staff: menu and stock, sales,
money in and out, debts, cash handed to the Boss, and the daily report sent to the Boss.

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · Prisma 6 + PostgreSQL (Supabase) ·
Tailwind CSS 4 · Vitest · Playwright · Inngest · Resend · Gemini (AI insights, optional).

The design and every rule are in [`docs/RESTAURANT_V2_IMPLEMENTATION_PLAN.md`](docs/RESTAURANT_V2_IMPLEMENTATION_PLAN.md);
what is implemented and how it is tested is in [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md).

---

## Two roles

| Role | Who | Can |
|---|---|---|
| **Boss** | The person who created the business | Oversees and manages: Overview, Departments, People, Daily reports (approve / return), Cash received (request cash for a day or a period, confirm or dispute it), Statements, Settings. Looks into every department **read-only**; records nothing himself |
| **Department head** | Everyone the Boss adds | Runs every department the Boss assigned them (one or several): menu & stock, sales and discounts, money in and out, debts, corrections, cash to the Boss, the daily report |

Each department head has a **title** chosen by the Boss (Accountant, Manager, Supervisor …); the Boss can change the
title, the name and the departments at any time, but the role is always *Department head* and every head carries that
tag. A department can have one or several heads. A head of several departments sees them all on *My departments* and
switches with the department card at the top of the sidebar.

## Pages

| Page | Path |
|---|---|
| Department home (today's figures) | `/d/[deptId]` |
| Sell (point of sale) | `/d/[deptId]/sell` |
| Menu & Stock (one page: dishes = stock lines, Opening + Added − Sold = Closing, live value) | `/d/[deptId]/menu-stock` |
| Money in / out (rent, other income, purchases, expenses, other expenses) | `/d/[deptId]/money` |
| Debts (customers, sales on credit, old debts, repayments) | `/d/[deptId]/debts` |
| Cash to Boss (department heads only: open requests from the Boss, hand over cash) | `/d/[deptId]/cash-handover` |
| Today's report (live, printable, count the cash, send to Boss) | `/d/[deptId]/report` |
| History (every record, with its reference number) | `/d/[deptId]/history` |
| Boss overview · Daily reports · Cash received (request cash, confirm handovers) · Departments · People · Settings | `/boss`, `/boss/daily-reports`, `/boss/cash`, `/boss/departments`, `/boss/people`, `/boss/settings` |
| Statements (income, cash, stock, debts; any period; print, CSV, AI insights) | `/statements` |
| Profile · department chooser · setup wizard | `/profile`, `/my-departments`, `/onboarding` |

Links of the previous version (`/dashboard`, `/restaurant`, `/daily-close`, `/reports/inbox` …) redirect
to their new pages (`next.config.mjs`).

## The rules (single source: `lib/finance/money-math.js`, `lib/restaurant/stock-math.js`)

- **Money in** = sales (gross) + rent + other income. **Money out** = discounts + purchases + expenses + other expenses.
  **Result** = money in − money out.
- **Stock (plates):** Closing = Opening + Added − Sold (± spoiled / corrections, shown when used).
  Value = closing plates × unit price. The head may edit a day's opening; a sale can never sell more plates than exist.
- **Cash drawer:** counts physical **cash** only: opening cash + cash received − cash paid out − cash handed to the Boss.
  Variance = counted − should remain. Mobile Money and bank are listed separately.
  A handover is a transfer to the Boss, not money out; a debt repayment is not income.
- **Cash to the Boss:** only a department head hands cash over. The Boss requests the cash of a period (today by default);
  due = cash taken in − cash paid out in the period − cash already handed over for it (the opening float stays in the drawer).
- **Debts:** owed at the end = owed at the start + new credit sales + old debts entered − repayments.
- **Traceability:** every record has a reference per department (`S-0001` sale, `P-` purchase, `E-` expense, `H-` handover …),
  an author and an audit event; corrections are **voids** with a reason, never silent edits.
- The **business day** follows the organization's time zone (default `Africa/Douala`).
- Sent / approved days are locked; the Boss can return a report, which then gets a new version.

---

## Getting started

```bash
npm install                     # also runs `prisma generate`
cp .env.example .env            # DATABASE_URL, DIRECT_URL, JWT_SECRET (+ optional Resend, Inngest, Gemini)
npm run dev
```

For the existing Supabase database, apply the migrations as described in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
(back up first). A new, empty database only needs `npx prisma migrate deploy`.

## Tests

| Command | What it runs |
|---|---|
| `npm run test:unit` | Money, stock and format maths, time zones, permissions (no database). |
| `npm run test:integration` | Server actions on a disposable database: the full reference day of the plan (§10.4), menu & stock, concurrency (no overselling), idempotency, money, debts, voids, discount limit, report return/approve, multi-department people, department types, access and cross-organization isolation, AI insights. |
| `npm run test:e2e` | Playwright in a real browser: the restaurant day from registration to the Boss approving the report, every page for every role (with accessibility checks), redirects, fixed sidebar and phone drawer. |
| `npm run lint` / `npm run build` | ESLint and the production build. |

Integration and E2E tests need `TEST_DATABASE_URL` pointing at a **throw-away** database; it is wiped and rebuilt from
`prisma/migrations` before each run (Supabase/pooler URLs are refused).

```bash
docker run -d --name sf-test -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres
npm test
npx playwright install chromium && npm run test:e2e
```

## Scheduled jobs (Inngest)

- `missing-report-reminder`: 08:00, tells the Boss which departments did not send yesterday's report.
- `monthly-statement-email`: 07:00 on the 1st, last month's statement with AI insights.
- `stock-consistency-check`: 02:00, checks every dish's plates against its stock records.

## Project layout

```
app/(auth)          login, register
app/(setup)         onboarding wizard (company → departments with type → people)
app/(main)          the app: d/[deptId]/* (department pages), boss/*, statements, profile, home, go, my-departments
actions/            server actions: menu-stock, sales, money, debts, handovers, daily-report, history,
                    organization, auth, periods, attachments, notifications, insights
lib/restaurant/     plate stock maths and stock service (dishes, movements, opening, corrections)
lib/finance/        money maths, posting service (sales, money, purchases, debts, handovers, voids), statements
lib/reports/        the daily report model          lib/boss/      Boss overview and report calendar
lib/domains/        department types and their navigation
lib/documents/      reference numbers                lib/ai/        Gemini insights
lib/                access, permissions, auth, audit, idempotency, time zone, format, notifications …
components/kit      shared UI (money, tables, headers, dialogs helpers)     components/shell  sidebar & layout
components/         restaurant, reports, boss, charts, domains, ui (shadcn)
prisma/             schema.prisma and migrations
tests/, e2e/        Vitest (unit + integration) and Playwright suites
docs/               plan, implementation status, deployment guide
```
