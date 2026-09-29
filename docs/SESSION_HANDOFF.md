# Session handoff (29 Sep 2026)

Where the Springer Finance work stands, so the next session can continue directly.

## The product (owner's rules)

- A platform where the **Boss registers a business**, creates **departments** (type chosen at creation: restaurant, bar,
  pressing, car wash, room rental, material rental, shop, other) and adds **department heads**. Only **RESTAURANT** is built;
  the other types show "coming soon".
- **Two roles only.** `ADMIN` = the Boss who created the business (oversees; records nothing). `HEAD` = everyone he adds;
  they head every department they are assigned to (one or several; a department may have several heads). Job **titles**
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

- Cloud working copy: `/home/claude/sf` (git; latest commits "Speed and offline work …", "Ignore one-off update
  folders"). The owner's folder `C:\Users\alloh\Downloads\modifying work\nonchalant-finance` has 92 of the 101 changed
  files in place (md5-verified); Windows refused overwriting 9 (README, package.json, next.config.mjs, .gitignore,
  app/layout.js, app/(main)/layout.js, app/globals.css, lib/auth.js, lib/prisma.js, actions/daily-report.js): they
  are in `_update-2026-09-29/` for the owner to copy over the project; GitHub
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
