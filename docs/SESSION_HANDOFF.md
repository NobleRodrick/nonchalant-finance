# Session handoff (6 Oct 2026)

Where the Springer Finance work stands, so the next session can continue directly.

## The product (owner's rules)

- A platform where the **Boss registers a business**, creates **departments** (type chosen at creation: restaurant, bar,
  pressing, car wash, room rental, material rental, office & property rental, shop, other) and adds **department heads**. Built: **RESTAURANT**,
  **EVENT_VENUE** (Salle Majestueuse: calendar, bookings, prices, packages, payments & receipts, assets, leads, cash
  count, dashboard, reports — `docs/VENUE_RENTAL_PLAN.md`) and **ROOM_RENTAL** (Executive Stay, 5 apartments:
  apartment profiles and states, bookings with flexible prices, check-in/out, payments and receipts, expenses by
  apartment with validation, assets per apartment, maintenance, P&L / cash flow / balance sheet and every report,
  automatic daily and weekly reports — `docs/EXECUTIVE_STAY_PLAN.md`). The other types show "coming soon".
- **Sidebar**: a Business section, then a Departments tree; each department expands into its own pages (from its
  type's `navigation` in `lib/domains/<type>.js`), for the Boss and for heads of several departments.
- **Roles:** `ADMIN` = the Boss who created the business (oversees; records nothing). `HEAD` = everyone he adds;
  they head every department they are assigned to (one or several; a department may have several heads).
  `ACCOUNTANT` = keeps the books of the companies the Boss gives him (Accounting only). Job **titles**
  (Accountant, Manager …) are free text set and edited by the Boss; every head carries the "Department head" tag.
- **Boss:** Overview, Departments (add/remove heads on each card), People, Daily reports (approve / return), Cash received
  (request cash for a day or period, confirm or dispute handovers), Statements (+ AI insights), Settings. Department pages
  are read-only for him ("view only" strip).
- **Heads:** Menu & Stock (dishes = stock lines; Closing = Opening + Added − Sold), Sell (never oversell), Money in/out,
  Debts, Cash to Boss (only heads hand over; they answer the Boss's cash requests), Today's report (count cash, send),
  History. Heads of several departments get "All my departments" (/my-departments).
- **Works offline** (one computer per department): heads record everything offline (sell, undo, stock, money, debts,
  cash to Boss, report); records are saved on the computer, shown at once in every figure and sent in order, exactly
  once, when the connection is back. The Boss can approve / return reports, confirm cash and request cash offline.
  Top bar: *All saved* / *Offline · n waiting* / *n need attention* (refused records, with the reason, Try again /
  Discard). Architecture and rules: `docs/OFFLINE_AND_PERFORMANCE.md`.
- **Undo a sale** (heads only): from the receipt, the day's sales ("Undo and fix" refills the basket) or History; reason
  required; the sale stays in History as Void; plates back, money out of totals, debt cancelled. A sent day is locked until
  the Boss returns the report.

## Code and environments

- Cloud working copy: `/home/claude/sf` (git; latest commit "Offline: every page opens without internet, automatic
  sync and refresh on reconnect" — fixes found on the live site: pages now saved in advance with all their code,
  offline links load saved pages, 5 s reconnect checks with automatic send + refresh). The owner's folder `C:\Users\alloh\Downloads\modifying work\nonchalant-finance` is in sync (all 102
  changed files md5-verified; files Windows would not overwrite were deleted and re-created with permission); GitHub
  `NobleRodrick/nonchalant-finance`, branch `main`, deploys to Vercel (`springer-finance.vercel.app`).
- Stack: Next.js 16, React 19, Prisma 6.19 + Supabase Postgres, Tailwind 4, jose JWT, Inngest, Resend, Gemini, Arcjet.
- Migrations applied to Supabase: baseline → restaurant_foundation → backfill → restaurant_v2 → v2 backfill →
  cash_requests → department_head → two_roles. **New, not applied yet:** `20261006090000_performance_and_sync`
  (additive: 4 indexes + `sync_operations`). Vercel never migrates: run `npx prisma migrate deploy` from the owner's PC
  before pushing code that needs a new migration.
- Speed: functions in Stockholm (`vercel.json` → `arn1`, next to Supabase eu-north-1), loading screens + progress bar,
  per-request memoized lookups, parallel queries, slow-query logs, Speed Insights (enable in Vercel).
- Writes: every department write is a named operation in `lib/operations/registry.js`, run once per key by
  `lib/operations/execute.js` (server actions and `POST /api/sync` share it). Client: `lib/offline/*` (outbox,
  sync engine, overlays), `public/sw.js` (service worker, production builds only; `NEXT_PUBLIC_ENABLE_SW=1` in dev).
- Owner's PC quirks: Linux sandbox cannot reach Supabase (only Windows can); Windows programs cannot overwrite files the
  sandbox wrote → use `npm install --package-lock=false`; port 6543 may be blocked on his network (5432 works).
- Test harness (cloud): Postgres 16 on :5433 (`pg_ctl -D /tmp/pgdata`), env in `/tmp/e2eenv.sh` + `/home/claude/tools/*`,
  Prisma client regenerated with `/home/claude/tools/regen.sh`. Status: 91 unit/integration tests, 24 e2e (+2 skipped by
  design), lint and build clean. `sf_rehearsal` DB = copy of production data (JSON backup `_db-backup-2026-09-27`).
  Now: 116 unit/integration tests, 28 e2e (+2 skipped), 3 offline e2e (`npm run test:offline`: production build,
  server stopped for real).

## Shop, bar, pressing, car wash, other — to deploy

- Every department type is now built. Two engines: **sales & stock** (shop, bar, other: till with search, USB
  scanner and camera, credit, bar tabs, crates and deposits, purchases paid or on credit, average cost, counts and
  losses) and **job tickets** (pressing, car wash, other's jobs: price list by garment / vehicle type, express,
  tags, advances, collection, washers' commissions, loyalty, unclaimed items, WhatsApp "ready" message).
  Informal businesses use it as is; a company in Full accounting / VAT gets invoices with NIU, RCCM and VAT, supplier
  bills and the stock in its books (311 / 6031, deposits 4094 / 4194). As built: `docs/TRADE_AND_SERVICES_PLAN.md`.
- **New migration (additive):** `20261120090000_trade_and_services` — `npx prisma migrate deploy`, push, resync
  Inngest (four `trade-*` functions).
- Full test run (7 Oct 2026, production build): lint and schema check clean; 375 unit/integration; every e2e spec
  (each on a fresh server: the registration limit is 5 per hour per server) — accounting 3, all-pages 4,
  boss-manages 6, boss-runs 2, event rental 6, executive stay 6, navigation 6 (+2 skipped by design), property 5,
  restaurant day 8, **trade-and-services 7** (shop, bar, pressing, car wash through the screens, and every page of
  the four types for the manager and the Boss with accessibility checks), undo-sale 4, venue 9; offline 4/4; load
  test 360 people in 120 businesses (incl. 40 with a shop, bar, pressing, car wash and salon) on two servers:
  3 397 requests, 0 errors; `npm run test:load:verify`: the books of 40 companies in Full accounting (20 of them
  trading) equal their statements (160 department-months).
- e2e specs that read whole pages were scoped to `main` (restaurant day), and the homepage now says every type is
  available.

## Full accounting release (SYSCOHADA) — to deploy

- **Boss → companies → departments.** Every business gets one default company (Simple accounting, as today).
  The Boss can add companies, move departments, and switch a company to **Full accounting (SYSCOHADA)**: books
  written automatically from every record (journals, general ledger, trial balance, income statement, balance
  sheet, cash-flow statement), manual entries with approval, closing month by month, opening balances,
  allocation of the result, **accountants** (a third person type: Accounting only), **VAT** (return per month),
  **supplier bills** paid later, customer and supplier **ageing**, bank / MoMo **reconciliation**.
  As built: `docs/ACCOUNTING_PLAN.md` (last section).
- **New migration (additive):** `20261110090000_accounting` — `npx prisma migrate deploy` from the owner's PC
  (it also applies the property and event rental migrations if not applied), then push.
- Inngest: resync (new functions `ledger-nightly-sync`, `ledger-department-sync`). Without `INNGEST_EVENT_KEY`
  the books still update before any accounting page is read.
- Full test run (7 Oct 2026, production build): lint and schema check clean; 354 unit/integration; every
  e2e spec — navigation 6 (+2 skipped by design), undo-sale 4, boss-runs 2, all-pages 4, restaurant day 8,
  boss-manages 6, venue 9, executive stay 6, event rental 6, property 5, accounting 3; offline 4/4
  (`npm run test:offline`; its spec was updated for the stronger passwords and the first-sign-in password
  change); load test 420 people in 140 businesses on two servers (venue, restaurant, guest house, event
  rental, office rental, and the Boss reading the books of 40 companies in Full accounting): 3 827 requests
  in 4 min, 0 errors; then `npm run test:load:verify`: the books of the 40 companies still equal their
  statements for every month (1 087 entries).

## Property rental release (Place Étoilée & Main Building) — to deploy

- New department type **PROPERTY_RENTAL** ("Office & property rental"): offices in two buildings (board + combined
  view), tenants, contracts with due day and proration, rent computed (never stored), utilities by meter and monthly
  bills, payments allocated oldest first (editable, advances), deposits kept apart, arrears with WhatsApp / e-mail
  reminders, tenant statements, move-out with deposit settlement, maintenance and inspections, expenses by building
  and office, reports by building / office / tenant / month, calendar, search ("owing more than 100000"), dashboard
  alerts, Boss card, PDF / Excel / CSV export. As built: `docs/PROPERTY_RENTAL_PLAN.md` (last section).
- **New migration (additive):** `20261101090000_property_rental` — `npx prisma migrate deploy` from the owner's PC
  (also applies the event rental and auth migrations if not applied), then push.
- Inngest: resync (new functions `property-morning-alerts`, `property-daily-reports`, `property-weekly-reports`,
  `property-monthly-reports`).
- Tests: 319 unit/integration; e2e property 5/5, event rental 6/6, boss-manages 6/6 (production build).
- The "duplicate element" seen against production builds is React's hidden copy of a streamed section
  (`<div hidden id="S:…">` outside `<main>`): invisible to users. Specs now look inside `<main>` for test ids and
  labels; older specs not yet updated may still trip on it.

## Event rental release (Deco Diva) — to deploy

- New department type **MATERIAL_RENTAL** ("Event & decoration rental"): stock with a movement ledger, bookings with
  automatic totals and double-booking control (items held from dispatch to return), calendar, dispatch and returns
  with differences, damages (charge / loss / repair / found), payments (cash, MoMo, bank, other) and refunds,
  documents (quotation, confirmation, invoice, contract, receipt), expenses with approval, purchases into stock,
  asset register with straight-line or declining depreciation, profit per event, reports and statements, analysis,
  Excel/CSV/PDF export, search, dashboard with warnings, morning alerts and daily/weekly/monthly reports, Boss card.
  As built: `docs/EVENT_RENTAL_PLAN.md` (last section).
- Per-person rights (all on by default; the Boss switches them off per person and department): approve expenses,
  void records, change prices, export, archive. Nothing financial is deleted.
- **New migration (additive):** `20261025090000_event_rental` — run `npx prisma migrate deploy` from the owner's PC
  (it also applies `20261020090000_auth_hardening` if not applied yet), then push.
- Inngest: resync (new functions `rental-morning-alerts`, `rental-daily-reports`, `rental-weekly-reports`,
  `rental-monthly-reports`). Guest-house reports now go through the shared `lib/reports/periodic.js` (same behavior).
- Delivered to the owner's folder 6 Oct 2026 (144 files, md5-verified; `lib/rooms/expense-validation.js` moved to
  `lib/departments/`). Tests: 283 unit/integration, event-rental e2e 6/6, venue 10/10, load test 270 people 0 errors.
- The register limit (5/hour per address) stops a full e2e run on one long-lived server — run spec groups on fresh
  servers.

## Executive Stay release (2 Oct 2026) — to deploy with the venue release

- Commits: stages 1–8 of `docs/EXECUTIVE_STAY_PLAN.md`.
- **New migration (additive):** `20261015090000_executive_stay` — run `npx prisma migrate deploy` (it applies every
  migration not applied yet, in order), then push.
- Inngest: resync (new functions `stay-daily-reports`, `stay-weekly-reports`). E-mails need `RESEND_API_KEY`
  (without it the reports still arrive in the app).
- Owner's decisions: revenue per night stayed; expenses count at once and are validated by the Boss or another head;
  assets at purchase value (no depreciation); daily and weekly reports by e-mail and in the app.

Open points discussed (3 Oct 2026):
- E-mails: `RESEND_API_KEY` is in the owner's `.env` (same as the 26 Sep backup); check it is also on Vercel. No
  `EMAIL_FROM` is set, so mail goes from `onboarding@resend.dev` (Resend then only delivers to the account owner):
  verify a domain in Resend and set `EMAIL_FROM` on Vercel.
- Proposed next: show unsent Executive Stay records in its figures while offline (overlays, as restaurant/venue);
  browser tests for refunds, early check-out, changing a booking, moving/replacing assets, calendar, apartment page.
- Owner to decide: a head can record a stay whose arrival is in the past (walk-in yesterday); keep, forbid, or Boss only.

## Venue release (2 Oct 2026) — to deploy

- Commits: stages 1–7 of `docs/VENUE_RENTAL_PLAN.md` plus stage 8 (load test, performance fix, docs).
- **New migrations (additive):** `20261010090000_event_venue` and `20261011090000_rooms`. Run
  `npx prisma migrate deploy` from the owner's PC (it also applies `20261006090000_performance_and_sync` if that was
  not applied yet), then push. Vercel never migrates.
- After deploying: Inngest dashboard → resync (new function `venue-morning-reminders`).
- Tests: 176 unit/integration, the e2e suites (venue: 9 serial tests), load test 540 people (0 errors;
  `docs/OFFLINE_AND_PERFORMANCE.md` §7).

## Open items for the owner (last checked)

0. **This release:** `npx prisma migrate deploy` (applies `20261006090000_performance_and_sync`), then push. No new
   packages. After deploying: check a deployment log shows region `arn1`; optionally *Speed Insights → Enable*.
   Heads should stay signed in on their computer and open their pages once with internet (they are then saved
   for offline use automatically).
1. Vercel env: `JWT_SECRET` (a new 64-char value was proposed; must be ≥ 32 chars), `DATABASE_URL` (6543,
   `?pgbouncer=true&connection_limit=1`), `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`, Gemini/Resend/Inngest keys,
   **`ARCJET_KEY`** (old key in `.env.backup-2026-09-26`; optional `ARCJET_MODE=DRY_RUN` at first). Redeploy after changes.
2. Push the latest code (Arcjet + undo sale); locally run `npm install --package-lock=false` (new `@arcjet/next`).
3. Inngest dashboard: resync the app; archive the old `nonchalant-finance-check-budget-alerts` function (it 500s).
4. Login on Vercel failed with an INTERNAL error (`err_mujrpilt_grsi2a`) — most likely missing `JWT_SECRET` or no redeploy;
   confirm from the Vercel log message. 6 old Clerk-era accounts have no password and no business (cannot sign in).
5. In the app: make sure every department has a head (production data had none; existing accountants/cashiers became heads
   with their old role as title).

## Next steps discussed

- **Several devices per department** (later): receive other devices' records (changes feed), plate reservations or
  clear refusals for the last plates, report sent after every device synced (see `docs/OFFLINE_AND_PERFORMANCE.md` §6).
- **Bar department type**: write a Bar plan first (drinks by bottle/can/glass, crates and empties/deposits, purchases by
  crate, happy-hour prices, tabs), with a short question list for the owner, then build it on the existing domain registry.
- Optional: a friendly "cannot reach the database" page instead of the Prisma error screen.

## Sign-in security and "the Boss runs it" (5 Oct 2026)

Owner's questions: do heads created at setup really sign in? Make sign-in robust; let the Boss manage the business
himself and assign heads later.

- Verified: a head created at setup (or from *People*) signs in with the temporary password and gets the title the Boss
  chose (`tests/integration/auth-security.test.js`, `e2e/boss-manages.spec.mjs`).
- **New migration (additive):** `20261020090000_auth_hardening` (users: `sessionVersion`, `mustChangePassword`,
  `failedLoginCount`, `lockedUntil`, `lastLoginAt`, `passwordChangedAt`; empties `refresh_tokens`, so **everyone signs
  in once more** after the release). Run `npx prisma migrate deploy`, then push.
- Hardening: forced change of temporary passwords (`/change-password`), password policy (common passwords, name, e-mail,
  72-byte bcrypt limit), bcrypt 12 with upgrade on sign-in, constant-time answer for unknown e-mails, database lockout
  (10 wrong → 15 min), refresh tokens stored as SHA-256, typed tokens (access ≠ refresh), session version (password
  change / reset / deactivation / *Sign out everywhere else* end other sessions at once), HSTS + Permissions-Policy,
  audit of sign-in events. Setup no longer drops a half-filled person silently.
- **The Boss runs departments that have no active head** (effective role `OWNER` = head + Boss permissions,
  `lib/access.js` `effectiveRole`, `lib/auth.js` `selfRunDepartmentIds`). His handovers are confirmed at once, his
  expenses validated, his daily report approved at once (he can return it). Assigning a head hands the department over.
  Tests: `tests/integration/boss-runs.test.js`, `e2e/boss-runs.spec.mjs`.
- Test passwords changed (`Kola-24680`, `Mango-97531`, `Baobab-2468` …): the old ones (*Temp12345*, *Secret123*) are now
  refused as too common. Shared fixtures mark their heads as having chosen a password (`headsChoseTheirPasswords`);
  e2e sign-ins go through `e2e/support/login.mjs`, which does the forced change once.

