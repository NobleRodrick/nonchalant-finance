# Session handoff (27 Sep 2026)

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
- **Undo a sale** (heads only): from the receipt, the day's sales ("Undo and fix" refills the basket) or History; reason
  required; the sale stays in History as Void; plates back, money out of totals, debt cancelled. A sent day is locked until
  the Boss returns the report.

## Code and environments

- Cloud working copy: `/home/claude/sf` (git; latest commit "Undo a sale …"). The owner's folder
  `C:\Users\alloh\Downloads\modifying work\nonchalant-finance` is in sync (files copied and md5-verified); GitHub
  `NobleRodrick/nonchalant-finance`, branch `main`, deploys to Vercel (`springer-finance.vercel.app`).
- Stack: Next.js 16, React 19, Prisma 6.19 + Supabase Postgres, Tailwind 4, jose JWT, Inngest, Resend, Gemini, Arcjet.
- Migrations (all applied to Supabase): baseline → restaurant_foundation → backfill → restaurant_v2 → v2 backfill →
  cash_requests → department_head → **two_roles** (latest). Vercel never migrates: run `npx prisma migrate deploy` from the
  owner's PC before pushing code that needs a new migration.
- Owner's PC quirks: Linux sandbox cannot reach Supabase (only Windows can); Windows programs cannot overwrite files the
  sandbox wrote → use `npm install --package-lock=false`; port 6543 may be blocked on his network (5432 works).
- Test harness (cloud): Postgres 16 on :5433 (`pg_ctl -D /tmp/pgdata`), env in `/tmp/e2eenv.sh` + `/home/claude/tools/*`,
  Prisma client regenerated with `/home/claude/tools/regen.sh`. Status: 91 unit/integration tests, 24 e2e (+2 skipped by
  design), lint and build clean. `sf_rehearsal` DB = copy of production data (JSON backup `_db-backup-2026-09-27`).

## Open items for the owner (last checked)

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

- **Bar department type**: write a Bar plan first (drinks by bottle/can/glass, crates and empties/deposits, purchases by
  crate, happy-hour prices, tabs), with a short question list for the owner, then build it on the existing domain registry.
- Optional: a friendly "cannot reach the database" page instead of the Prisma error screen.
