# Codebase review — 12 Oct 2026

Six parallel reviews of commit `78e6f12` / `404f305` (~600 source files, ~55k lines): security, performance &
database, architecture, UX/accessibility/i18n, tests & delivery, business logic & accounting. Every item below
cites code that was read; accounting items marked (verified) were reproduced with a script. Each fix starts
with a failing test.

Overall: the architecture is sound (one write path through `lib/operations` + `executeOperation`, uniform
`ActionError`, strong auth core — HS256-pinned JWT, DB-checked `sessionVersion`, hashed refresh tokens, bcrypt
12, DB lockout; no mass-assignment; uploads type-checked). The gaps are in money-correctness edge cases, scale
with years of history, delivery safety (no CI) and the product's reach (no French, no PWA install, no error
pages).

**Status 12 Oct 2026:** A1–A6 and S1–S5 fixed with tests (see `docs/SESSION_HANDOFF.md`). Open: A7–A14,
S6–S7, everything in P1/P2, and cash expenses larger than the drawer.

## P0 — correctness (money in the books)

| # | Issue | Where | Fix |
|---|---|---|---|
| A1 | A **disputed cash handover stays in the ledger**; the drawer shows the cash again, so it can be handed over twice (books double). DISPUTED→CONFIRMED allowed. | `lib/operations/boss.js:44`, `lib/accounting/rules.js:218`, `lib/finance/posting-service.js:564` | Dispute reverses the money record (or rule skips disputed); guard status transitions. |
| A2 | **Moving a dated item (event, stay…) into the last 3 months posts its revenue twice**; the nightly full sync doesn't repair (map by sourceKey collapses duplicates). | `lib/accounting/sync.js:92-107,135` | Look up existing entries by the rebuilt sourceKeys without date filter; reverse extra active entries per key. |
| A3 | **Stock valued VAT-included** when VAT is typed on purchases → phantom profit, 311 overstated (verified). | `lib/trade/purchase-service.js:41` | Remove each line's VAT share before unit cost. |
| A4 | Voiding a shop sale/purchase moves stock **today** but reverses money on the original date → two months wrong. | `lib/finance/posting-service.js:702-706`, `lib/trade/purchase-service.js:103` | Date the stock movement with the original record's date. |
| A5 | Handover "≤ drawer" check bypassed by back-dating, two devices at once, or voiding a cash sale after handover → negative drawer. | `lib/finance/posting-service.js:563-566,647` | Per-department lock; check current balance too; refuse voids that make the drawer negative. |
| A6 | Average-cost rounding leaves residues (−1, −500, +500 on 1 000 sachets) (verified). | `lib/trade/stock-math.js:164`, `product-service.js:39` | Keep stock value on the product; average = value ÷ qty; last unit takes the remainder. |
| A7 | A recorded VAT return ignores later changes in its month; credit carried by posting date, not month. | `lib/accounting/vat.js:44,62` | Lock or flag returned months; carry credit by return month. |
| A8 | Full sync skips records 00:00–00:59 Douala on its first day (UTC midnight). | `lib/accounting/sync.js:81` | `startOfDateKey(windowKey, timeZone)`. |
| A9–14 | Lower: service discounts hit 4431; sale with discount but no gross skipped; rent/nights ignore VAT exemptions; old-debt cancel checks wrong date; repayment void race; device clock skew back-dates offline sales. | `rules.js:119,177,253`, `posting-service.js:518,672`, `execute.js:92` | See review notes. |

## P0 — security

| # | Issue | Where | Fix |
|---|---|---|---|
| S1 | **Offline page cache serves the last user's pages without a session check** (offline or 12 s slow network) — shared shop PC / cybercafé leak. Cleared only on explicit sign-out. | `public/sw.js:119-141,279-303,352` | Session marker per user in the cache, cleared on 401/redirect-to-login/sign-out-everywhere; never serve on the slow path unless offline; "shared computer" option. |
| S2 | Open redirect after sign-in via tab/newline (`/\t/evil.com`) (verified). | `actions/auth.js:55-60`, `app/(setup)/change-password/page.jsx:10` | Resolve with `new URL`, require same origin; reject control chars. |
| S3 | Lockout counter not atomic (parallel guesses); anyone can lock a known account; message reveals existence. | `actions/auth.js:39-40,78-89` | `increment`; per account+IP throttle; known-device bypass; same message. |
| S4 | Without `ARCJET_KEY`, per-instance memory limiter only (useless on Vercel), silently. | `lib/security/protect.js`, `lib/rate-limit.js` | Fail loudly in production; shared limiter (Postgres/Upstash). |
| S5 | CSV formula injection in exports. | `lib/export/table-export.js:17-23` | Prefix `'` to text cells starting with `= + - @ \t \r`. |
| S6 | No CSP on app pages. | `next.config.mjs` | Nonce CSP via `proxy.js`. |
| S7 | Lower: refresh tokens don't rotate; access token alive 15 min after sign-out; unlimited orphan uploads; proof files cached `max-age=300`; public `/api/health/db` (2 queries); AI insights uncapped; `/api/sync` accepts no-Origin; `__Host-` cookies. | `lib/auth.js`, `app/api/*`, `actions/insights.js` | See review notes. |

## P1 — delivery & operations

1. **No CI** (no `.github/`): lint, unit, integration (Postgres service, fail if DB missing — today `skipIf(!hasDb)` passes green), `prisma migrate diff`, build, e2e shards, isolation probe.
2. **Gate production**: protected `main`, PRs; deploy job runs `prisma migrate deploy` then deploys (no more manual migrations from one PC).
3. **Error tracking** (Sentry with the existing `errorId`) + **uptime** on `/api/health/db` + Inngest heartbeat.
4. **Backups**: nightly encrypted `pg_dump` off-site, monthly restore drill; check Supabase PITR.
5. **Staging DB** for Vercel Preview (check whether Preview points at production).
6. **Env validation** at boot (`lib/env.js` + `instrumentation.js`).
7. Scheduled jobs: emails swallow errors (no retry) and multi-recipient steps resend on retry → one step per recipient, idempotency keys, `onFailure`.
8. **Future-dated migration folder names** (`20261210…` while today is 2026-10-12): the next real migration would sort before applied ones → continue numbering after the last folder; test it.
9. Dependabot, `npm audit`, `.nvmrc`, gitleaks; `eslint-config-next` pinned to 16.0.1.

## P1 — scale with years of history (performance)

1. Ledger sync posts one entry at a time inside a lock, **during page render**; numbering via `LIKE` scan → `JournalSequence` table, batched `createMany`, sync only in background, first full sync per month.
2. Nightly full sync re-reads all history for every company, sequentially → only recent months + dirty departments, one Inngest step per department.
3. Indexes: `Transaction(departmentId, updatedAt)`; `AuditEvent(departmentId, action, createdAt)` and `(entityId)`; covering `journal_lines(companyId, date, accountId) INCLUDE (debit, credit)`.
4. Reports sum the whole ledger every view → balances snapshot per closed month; `posted` flag on lines.
5. Unbounded loads summed in JS (partner ledger, cash flow, Boss overview 30-day trend, statements) → SQL `groupBy` / `date_trunc`.
6. `openingCashBefore` scans all history, called many times per page → daily closing-cash snapshot.
7. Every write updates the department row + awaits `inngest.send` even in Simple accounting → skip unless Full; send in `after()`.
8. `connection_limit=1` serializes `Promise.all`; Boss offline warm-up refetches 40 pages every 10 min.
9. Recharts loaded eagerly on every department home → `next/dynamic`.

## P1 — product reach (UX)

1. **No `error.jsx` / `global-error.jsx`** anywhere → crash screen on a DB timeout.
2. **French** (and EN/FR toggle): ~4 000–5 500 strings, ~330 JSX files; plan: locale cookie, per-area dictionaries, `t()`/`useT()`, error codes from actions, lint rule against literals, e2e in French. ~3–4 weeks.
3. **PWA install**: no manifest/icons/themeColor → no "Add to home screen" (also needed for the Play Store TWA).
4. Dialogs on phones: keyboard hides Save → bottom sheet, sticky footer, `100dvh`.
5. Enter doesn't submit (111 `onClick={save}`) → `FormDialog` as `<form>`, submit button, in-flight ref against double tap.
6. `<MoneyInput>` with grouped digits + FCFA (≈150 raw numeric inputs).
7. Accessibility: `Field` without `aria-invalid/describedby/role=alert`; tap targets < 44 px; mobile drawer without focus trap/Escape; contrast rule disabled in axe (96 × `text-slate-400`).
8. Tables on phones → card rows with column priority; sticky header fix.
9. Small: `<Link><Button>` nesting (9), login `autoComplete`, toast position, offline dot on phones.

## P2 — maintainability

1. One `lib/input.js` (25 `text`, 26 `int` copies; one variant yields NaN).
2. Money storage: legacy `Decimal(65,30)` vs `Int` francs (`Transaction.taxAmount` Int vs `amount` Decimal); 175 raw `Math.round`.
3. Timezone leaks: `toISOString().slice` on timestamps (`lib/rental/purchase-service.js:99`), 16 client dates without `timeZone` → helper + lint rule.
4. Unused **server actions are public endpoints** (`restoreRemovedDish`, `addStockToDish`, `correctDishCount`, `setDayOpeningStock`, `cancelCashRequestAction`, `saveSupplierAction`, `tradeOperation`, `propertyOperation` — test-only) + 39 unused exports.
5. Domain capabilities in the registry instead of 7 hard-coded `PAGES` maps and 64 `domain === "X"` checks.
6. `Transaction` relations `onDelete: Cascade` from user/account → `Restrict`; CHECK at most one source link.
7. Plain `Error` in pure modules → `invalid()`.
8. `// @ts-check` + typedefs on core modules; optional input schema per operation (shared with the offline client).
9. Split `posting-service.js` (736 lines); Prettier (1 953 lines > 200 chars).
10. Docs drift (`IMPLEMENTATION_STATUS.md` 26 Sep, `.env.example` mentions a removed route).

## Suggested order

1. **Sprint 1 (money + security, ~1 week):** A1–A8, S1–S5, index-only migration (P1-perf 3), error pages.
2. **Sprint 2 (delivery, ~1 week):** CI + gated deploy with migrations, Sentry, uptime, backups, env validation, migration numbering, staging DB.
3. **Sprint 3 (scale):** ledger sync rework, snapshots, SQL aggregations, lazy charts.
4. **Sprint 4–6 (reach):** PWA + mobile forms (dialogs, MoneyInput, Enter), accessibility, then French.
5. Ongoing: maintainability items with each touched area.
