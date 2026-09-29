# Speed and offline work

How the app stays fast, and how a department head keeps working without internet
(one computer per department; several devices per department is the next step, see the end).

---

## 1. Speed

| What was slow | Change | Where |
|---|---|---|
| The server (Vercel, Washington) and the database (Supabase, Stockholm) were on two continents: every query crossed the Atlantic, one after the other | Functions run in **Stockholm (`arn1`)**, next to the database | `vercel.json` |
| After a click nothing moved until the whole page was ready | A **loading screen shaped like the page** appears at once (dish tiles, tables, report), and a thin **progress bar** runs at the top from the click to the new page | `app/**/loading.jsx`, `components/kit/skeletons.jsx`, `components/shell/navigation-progress.jsx` |
| The signed-in user, the department and the department list were read several times per page | Read **once per request** (React `cache`) | `lib/auth.js` (`getCurrentUser`), `lib/access.js` (`accessibleDepartments`, `findOrgDepartment`) |
| Queries that waited for each other | Run **together**: Menu & Stock (dishes + movements), the Boss overview (one ledger read instead of four; stock, calendar and the rest in parallel), statements | `lib/restaurant/stock-service.js`, `lib/boss/overview.js`, `lib/finance/statements.js` |
| Missing indexes for the debts page, the daily report and the Boss's counters | 4 indexes | migration `20261006090000_performance_and_sync` |
| Pages reloaded themselves every 20–30 s | Every 60–120 s, only while visible **and connected** (the head's own records refresh the page when they reach the server) | `components/kit/client.js` (`useLiveRefresh`) |
| No measurements | **Slow queries** (≥ 500 ms, `SLOW_QUERY_MS`) are logged as one JSON line (`"event":"slow_query"`, Vercel logs); **Speed Insights** (real page timings from users' browsers) loads when enabled in the Vercel dashboard | `lib/prisma.js`, `app/layout.js` |

A refused page (a department you do not head, Sell for the Boss) is refused **before** the loading screen is sent,
so it keeps a real 404 / redirect status: the proxy passes the path to the app layout, which checks access
(`proxy.js`, `app/(main)/layout.js`, `lib/page-guards.js` → `guardPath`). The pages check again.

---

## 2. Offline: what the head can do

Everything of the day, with or without a connection:

- **Sell** (cash, Mobile Money, bank, on credit, discounts), print a (provisional) receipt, **undo a sale**;
- **Menu & Stock**: add a dish, add stock (bought or not), correct a count, spoiled plates, opening stock, edit /
  remove / restore a dish, void a stock record;
- **Money in / out**: rent, other income, expenses, other expenses, discounts paid out, purchases (with plates),
  voids; proof photos are kept and uploaded later;
- **Debts**: record a debt, an old debt, a repayment, cancel an old debt;
- **Cash to Boss**: hand cash over (also against a request of the Boss), void a handover;
- **Today's report**: count the cash, save, **send** it (it reaches the Boss when the connection is back; the day is
  locked on the computer at once).

The **Boss** can read every page he opened, and approve / return reports, confirm / dispute handovers, request or
cancel cash requests offline (sent when the connection is back). Managing people, departments and settings needs
the internet.

Every page of the head's departments is saved on the computer in the background after sign-in (the sync panel shows
"Pages ready without internet"), so they all open offline even if never visited. Needs the internet: signing in,
pages outside the head's departments or with filters (another day, a History search: a page explains it), a record's
detail in History and a dish's history, statements' AI insights.

---

## 3. How it works

```
 form ──► outbox (IndexedDB, on this computer) ──► sync engine ──► POST /api/sync ──► operations (same rules as online)
   ▲                                                                                        │
   └──── the page = server figures + this computer's records not in them yet ◄──────────────┘
```

### Every write is an operation — `lib/operations/`

- `registry.js` names every write (`sale.record`, `record.void`, `money.record`, `purchase.record`, `stock.add`,
  `stock.correct`, `stock.opening`, `stock.void`, `dish.*`, `debt.*`, `debtor.save`, `handover.record`,
  `report.save`, `report.send`, and the Boss's `report.review`, `handover.review`, `cash.request`,
  `cash.request.cancel`). The server actions and the sync endpoint run **the same definitions**, so a sale
  recorded offline follows exactly the rules of a sale recorded online (stock never negative, locked days, discount
  limits, permissions…).
- `execute.js` runs one operation **exactly once**: its key (generated on the device) and its result are written to
  `sync_operations` **in the same database transaction** as the change. Sent again (retry, lost answer, two tabs), it
  returns the first result (`duplicate`). Two copies at the same moment: the unique key lets one win.
- **Dates**: an offline record carries `occurredAt` (device time). A sale made at 14:00 and sent at 18:00 is dated
  14:00 of the right business day. A device clock ahead of the server is clamped to now; records older than 45 days
  must be entered again.
- **References**: a record created offline has no id yet. A later record that uses it (selling a dish created offline,
  repaying a debt made offline, undoing a sale not sent yet) refers to it as `{ $ref: <key>, field }`; the server
  swaps in the real id (only within the same organization).

### The endpoint — `app/api/sync/route.js`

Takes up to 50 operations of the signed-in person, same-origin only, applies them **in order** and answers per
operation: `applied`, `duplicate`, `rejected` (a rule said no: the reason is shown), `error` (unexpected: the device
retries later, the rest of the batch is kept for later so the order is kept), `skipped`.
`GET /api/health` is a tiny connectivity check (no database).

### On the computer — `lib/offline/`

| File | Role |
|---|---|
| `idb.js` | IndexedDB store (`ops`, `blobs` for proof files, `meta`); memory fallback if the browser forbids it |
| `outbox.js` | The operations of the signed-in person, live for the UI; tabs keep each other informed (BroadcastChannel) |
| `sync-engine.js` | Sends the outbox in order (one tab at a time: Web Lock), uploads proof files first, retries with growing pauses (2 s … 60 s), wakes on "online", on tab focus and every 20 s while something waits; holds back records that depend on a refused one; tells the page to refresh when records reach the server |
| `connectivity.js` | Online or not: browser events + real requests + `/api/health` (a Wi-Fi without internet is detected) |
| `record.js`, `react.js` | `useRecorder()`: save → send → wait for the server's answer while connected (real reference number, or the refusal shown on the form); offline it returns at once |
| `specs.js` | How each form describes its record (what is sent, what is shown until then) |
| `overlay.js` | **Pure** functions: the server's figures + the records they do not include yet (sales list, plates left, Menu & Stock, money, debts and customers, cash drawer, cash requests, the whole daily report, day locked) |
| `local-ids.js` | Ids of records created offline (`local:<field>:<key>`) and their `$ref` form |

A record counts on top of the server's figures while it is waiting, or when the server applied it after the page was
rendered (`renderedAt`, server clock, from `departmentPage`). A refused record is never counted: it is listed under
**Needs attention** with the reason (Try again / Discard).

### The service worker — `public/sw.js` (page side: `lib/offline/service-worker.js`)

- **Pages are saved in advance**, not only when opened: as soon as the worker runs after sign-in, whenever some
  are missing, every 10 minutes, 20 s after records were sent and when the connection comes back, the worker
  fetches every page of the person's departments (`warmUrls`, from the app shell) and keeps them.
- **With their code**: each saved page's script and style files, the chunks the router loads later (named in the
  page's data as `static/chunks/…`, including route groups such as `app/(main)/…`) and the fonts of its style sheets.
  Code files are kept under one key however their URL is written (`%5BdeptId%5D` or `[deptId]`).
- Pages: network first (the last copy is kept); a slow network (> 12 s) gets the saved copy. A page never saved shows
  `public/offline.html`, which lists the pages that are.
- App code (`/_next/static`): cache first (file names change with every deployment). Router data requests: network
  only. Writes never go through the worker.
- `VERSION` in `sw.js`: a new version starts with empty caches, so the pages and their code are saved again.
- The saved pages are the signed-in person's data: deleted at sign-out and when another person signs in on the
  computer. Records not sent yet stay (sent at their author's next sign-in); signing out with records waiting asks first.
- Registered in production builds only (`NEXT_PUBLIC_ENABLE_SW=1` in development). To try offline mode on your own
  computer: `npm run preview` (builds and starts the real app), then turn the Wi-Fi off.

### Moving between pages offline — `components/offline/offline-navigation.jsx`

While offline, a click on any link of the app loads that page normally instead of asking the server through the app
router: the worker answers at once with the saved copy. Programmatic moves use `navigateTo(router, href)`
(`lib/navigation.js`), which does the same.

### When the connection comes back — `lib/offline/connectivity.js`, `components/offline/offline-provider.jsx`

- While offline, the server is asked every 5 s whether it is reachable again (a tiny request, none at all while the
  browser itself says it has no network); after the browser's "online" signal it checks at once, then after 1.5 s and 4 s
  (the network often needs a moment).
- As soon as it answers: the waiting records are sent immediately (the growing pauses are forgotten), the page
  refreshes its figures from the server by itself, the pages are saved again, and a message says
  "Back online: 4 record(s) sent" (or which ones need attention).

### What the screen shows

- Top bar: **All saved** / **Offline · 3 waiting** / **Sending 2…** / **1 needs attention** / **Sign in to send 4**.
  Clicking it shows **Pages ready without internet: 9 of 9** (with *Save them now* when some are missing) and lists the
  records on this computer: waiting, needing attention (reason, Try again, Discard), sent recently (with their
  reference numbers).
- An amber strip while offline. Records not sent yet say **Not sent yet** in every list; a sale made offline gets
  a provisional receipt (`#3F9A`) and its S-number once sent.

---

## 4. Rules when records meet the server

| Situation | Outcome |
|---|---|
| Same record sent twice (lost answer, retry, two tabs) | Recorded once (`duplicate` returns the first result) |
| Selling more plates than the server has | Refused, needs attention (with one computer per department this does not happen: the plates shown include every waiting record) |
| Record on a day whose report was sent / an accounting period closed | Refused, needs attention (the Boss returns the report, then Try again) |
| A record that depends on a refused one (undo of a refused sale, repayment of a refused debt) | Held back with it |
| Session expired while offline | Records wait; "Sign in to send"; nothing is lost |
| Unexpected server error | Retried automatically, in order |

---

## 5. Tests

- `tests/unit/offline-overlay.test.js`: local ids and every overlay (sales, plates, stock, money, debts, drawer,
  requests, day lock, the daily report).
- `tests/integration/offline-sync.test.js`: a whole offline session in one batch (new dish, sales of it, credit sale,
  repayment, undo), replay (nothing twice), two copies at once, dating by `occurredAt`, refusals and dependents,
  locked day, permissions, another organization's references, no session / another site, server actions and sync
  sharing keys, dates too old.
- `e2e-offline/offline.spec.mjs` (`npm run test:offline`, production build): the pages are saved without being opened;
  then the Wi-Fi is "turned off" (browser offline and server stopped for real); the head opens every page from the menu,
  sells, undoes, records an expense with a receipt photo, reloads; the connection comes back and, without any reload,
  everything is sent once, the page refreshes itself and says so; plus a refused record and the Boss confirming cash offline.

---

## 6. Next step: several devices per department

The design is ready for it: operations are keyed and ordered per device and the server decides. What remains:
a device should also *receive* what others recorded while it was offline (a changes feed from `sync_operations` /
`updatedAt`), plates reserved per device or refused sales shown clearly (two devices selling the last plates), and
the day's report sent only when every device of the department has sent its records.
