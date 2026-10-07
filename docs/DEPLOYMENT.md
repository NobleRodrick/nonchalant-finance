# Deploying this release to the existing Supabase database

Back up, compare, baseline, rehearse on a copy, then migrate (plan §12).
Nothing in this release was applied to the live database; these steps are yours to run.

## 0. Environment variables

| Variable | Action |
|---|---|
| `JWT_SECRET` | **New and required.** ≥ 32 random characters, same value locally and on the host. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Changing it signs everyone out (old tokens were signed with a public default). |
| `NODE_ENV` | Remove it from `.env`. Next.js sets it itself. |
| `ALLOW_DEMO_SEED` | No longer used (the demo seed was removed); delete it. |
| Clerk keys | No longer used; can be deleted. |
| `ARCJET_KEY` | Production abuse protection (see the Vercel section). |
| Duplicate `INNGEST_*` lines | Keep one pair (the production keys). |
| `NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`, `GEMINI_MODEL` | Optional (see `.env.example`). |

If `.env` has ever been shared or committed, rotate the database password, Resend, Gemini and Inngest keys.

## 1. Back up

```bash
pg_dump "$DIRECT_URL" --format=custom --no-owner --file=springer-backup-$(date +%F).dump
```
(or create a backup from the Supabase dashboard).

## 2. Check the live schema matches the baseline

`prisma/migrations/0_baseline` is the schema the live database was built with (`db push`). Confirm it:

```bash
npx prisma migrate diff \
  --from-url "$DIRECT_URL" \
  --to-schema-datamodel docs/migration/baseline-schema.prisma \
  --script
```

Expected output: an empty migration (`-- This is an empty migration.`). If it prints SQL, the live database has
drifted — stop and review those differences before continuing.

## 3. Mark the baseline as already applied (once)

```bash
npx prisma migrate resolve --applied 0_baseline
npx prisma migrate status
```

If status mentions the old `20251115144259_craete_models` migration (it was removed from the folder because it
never matched the live schema), you can delete that row:
`DELETE FROM "_prisma_migrations" WHERE migration_name = '20251115144259_craete_models';`

## 4. Rehearse on a copy

```bash
createdb springer_rehearsal
pg_restore --no-owner -d springer_rehearsal springer-backup-*.dump
DATABASE_URL=postgresql://.../springer_rehearsal DIRECT_URL=postgresql://.../springer_rehearsal npx prisma migrate deploy
DATABASE_URL=postgresql://.../springer_rehearsal JWT_SECRET=... npm run build && npm start
```
Log in as the Boss and open the overview, a department's Menu & Stock, Today's report and Statements for existing data.

## 5. Migrate production

```bash
npx prisma migrate deploy
```

Eight migrations run, in order:

1. `20260926090000_restaurant_foundation`: new enum values, columns and tables (accounting periods,
   attachments, void/idempotency fields, handover status, organization time zone …). Additive only.
2. `20260926090100_backfill_restaurant_ledger`: idempotent data backfill (department memberships, legacy
   `INCOME`/`EXPENSE` rows re-typed, legacy credit sales get a Debt record, sale line net amounts).
3. `20261001090000_restaurant_v2`: the v2 schema: reference numbers (`referenceNo`, `DocumentSequence`),
   debtors, notifications, department code / opening cash float / cashier discount limit, dish section,
   low-stock level and sort order, signed stock movement types. Removes the personal-finance `Budget` table
   and the recurring-transaction columns.
4. `20261001090100_restaurant_v2_backfill`: idempotent: recipe dishes become plate dishes, department codes,
   debtors created from existing debts, old debts without a sale marked "opening balance", reference numbers
   assigned to every existing record and counters initialised.
5. `20261003090000_cash_requests`: additive: the Boss's cash requests (`cash_requests`) and the link from a handover
   to the request it answers.
6. `20261004090000_department_head`: additive: the head of each department (`departments.headUserId`), backfilled
   from the first active manager of each department.
7. `20261005090000_two_roles`: two roles only. Every account except the Boss becomes a department head (`HEAD`) of
   the departments it is assigned to; its old role becomes its title (Manager, Accountant, Cashier), which the Boss
   can edit in People. Removes per-department role overrides and the column added by migration 6.
8. `20261006090000_performance_and_sync`: additive: four indexes (debts, repayments, handovers, reports) and the
   `sync_operations` table (one row per record sent by a device: its key and result, so nothing is recorded twice).

Then deploy the application code.

## 6. After deploying

- Everyone signs in again (new `JWT_SECRET`).
- **Departments** (*Boss → Departments*): check each department's type (existing ones default to Restaurant),
  its opening cash float and the cashier discount limit.
- **People** (*Boss → People*): check each person's departments and role.
- **Opening stock:** dishes that used recipes are now counted in plates. On the first day, each head opens
  *Menu & Stock* and uses **Edit opening stock** to enter the plates really available.
- **Debts:** review the debtors list and the debts marked "opening balance".
- Stop using `prisma db push`. Schema changes are `npx prisma migrate dev --name <change>` locally, then
  `npx prisma migrate deploy` in production.

## Sign-in security release (`20261020090000_auth_hardening`)

1. `npx prisma migrate deploy` (additive columns on `users`; it empties `refresh_tokens`, so **everyone signs in once
   more**: tokens are now stored as SHA-256 hashes).
2. Push. Heads whose password was given by the Boss keep signing in with it; only heads created or reset **after** the
   release are asked to choose their own at the first sign-in.
3. Keep `ARCJET_KEY` on Vercel (shared per-address limits). The account lock (10 wrong passwords → 15 minutes) works
   without it. A locked person waits, or the Boss resets the password (which also unlocks).
4. `JWT_SECRET` must stay at least 32 random characters (the app refuses to start in production otherwise).

## Event rental release (`20261025090000_event_rental`)

1. `npx prisma migrate deploy` (additive: new rental tables, `departments.profile`, `user_departments.grants`,
   `transactions.rental_order_id`, `PaymentMethod` value `OTHER`). Existing data is untouched.
2. Push, then resync Inngest (four new rental functions: alerts 07:00, daily 07:25, weekly Monday 07:30, monthly
   1st 07:35, Africa/Douala).

## Property rental release (`20261101090000_property_rental`)

1. `npx prisma migrate deploy` (additive: property tables, `venue_clients.identification`, `transactions.lease_id /
   property_unit_id / building_id`, enum value `PROPERTY_RENTAL`). Existing data is untouched.
2. Push, then resync Inngest (four new property functions: alerts 06:50, daily 07:10, weekly Monday 07:40, monthly
   1st 07:45, Africa/Douala). Tenant reminders by e-mail need `RESEND_API_KEY` and `EMAIL_FROM`.

## Full accounting release (`20261110090000_accounting`)

1. `npx prisma migrate deploy` (additive: companies — one default company per business is created and every
   department joined to it —, chart of accounts, journals, ledger, suppliers, bills, bank statements, three
   columns on `transactions`, enum values `SUPPLIER_PAYMENT` and `ACCOUNTANT`, database triggers keeping the
   ledger balanced and immutable). Every business stays in Simple accounting until the Boss switches.
2. Push, then resync Inngest (`ledger-nightly-sync` 02:30, `ledger-department-sync` on records).

## Shop, bar, pressing, car wash, other (`20261120090000_trade_and_services`)

1. `npx prisma migrate deploy` (additive: products, stock movements, sale lines, tabs, purchases, crates and their
   movements, price lists, washers, tickets; three columns on `transactions`). Existing data is untouched.
2. Push, then resync Inngest (four new functions: `trade-morning-alerts` 06:55, `trade-daily-reports` 07:05,
   `trade-weekly-reports` Monday 07:45, `trade-monthly-reports` 1st 07:50, Africa/Douala).
3. The camera barcode reader needs HTTPS (production is) and the header `Permissions-Policy: camera=(self)`
   (set in `next.config.mjs`). USB scanners need nothing.

## Load test

`npm run test:load:seed` (LOAD_ORGS, LOAD_STAY_ORGS, LOAD_RENTAL_ORGS, LOAD_PROPERTY_ORGS businesses on the
disposable database), `npm run test:load` against running servers, then `npm run test:load:verify` (with
LOAD_SEED): the books of the companies in Full accounting must still equal their statements.

## Rollback

Migrations 1 and 3 change the schema (3 drops `Budget` and the recurring columns); 2 and 4 change data. To roll back, restore the
backup from step 1 and redeploy the previous code.

## Vercel

Vercel builds with `npm install` (which runs `prisma generate`) and `npm run build`. It never touches the database:
run `npx prisma migrate deploy` against Supabase **before** pushing code that needs a new migration.

**Region.** `vercel.json` runs the functions in Stockholm (`arn1`), next to the Supabase database (eu-north-1). If your
Supabase project is elsewhere, set the matching region there (and in *Settings → Functions → Function Region*). Check
in a deployment's logs that requests show `arn1`.

**Speed Insights** (optional, free on Hobby within limits): *Project → Speed Insights → Enable*, then redeploy. The app
loads its script on Vercel automatically. Slow database queries (≥ 500 ms) appear in the logs as `"event":"slow_query"`.

**Offline.** Nothing to configure: the service worker (`/sw.js`) is served with `Cache-Control: no-cache` so every
deployment reaches the computers at their next visit.

Environment variables (Project → Settings → Environment Variables, Production and Preview):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** (port 6543) with `?pgbouncer=true&connection_limit=1` (serverless functions) |
| `DIRECT_URL` | Supabase session pooler or direct connection (port 5432); used by migrations |
| `JWT_SECRET` | the same ≥ 32-character secret as in your `.env` (**required**: without it every page fails in production) |
| `NEXT_PUBLIC_APP_URL` | your Vercel address, e.g. `https://your-app.vercel.app` (links in e-mails) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI insights (optional) |
| `RESEND_API_KEY`, `EMAIL_FROM` | e-mails (optional) |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | scheduled jobs |
| `ARCJET_KEY` | abuse protection (Arcjet dashboard → your site → key). Shared rate limits for sign-in (8 per account and address / 15 min), registration (5 per address / hour, bots and disposable e-mails refused) and password changes, plus Arcjet Shield. Without it an in-memory limiter per server instance is used |
| `ARCJET_MODE` | optional: `DRY_RUN` to only log what would be blocked (default `LIVE`) |
| Clerk keys, `NODE_ENV` | remove: no longer used / set by Vercel |

After the first deployment, open the Inngest dashboard → Apps → **Sync** (or re-sync `https://<your-app>/api/inngest`) so
it picks up the three scheduled jobs of this version (missing-report reminder, monthly statement, stock check) and drops
the old ones.

Limits: Vercel refuses request bodies above 4.5 MB, so proof uploads are limited to 4 MB.
