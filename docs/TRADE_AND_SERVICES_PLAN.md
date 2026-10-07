# Shop, bar, pressing, car wash and other activities: plan

Owner's decisions (7 Oct 2026):

- **Pressing:** priced per item and service (a price list: shirt wash & iron, suit dry-clean, iron only …), express
  surcharge optional; per-kg laundry is one more service line.
- **Car wash:** washers earn a commission per wash (a % or a fixed amount per service); loyalty: every Nth wash
  free (optional).
- **Bar:** drinks by the bottle, crates and empty bottles tracked with deposits (consignes) owed to and by the
  brewery and by customers; open tabs per table; breakages.
- **Shop:** sales by search or barcode (USB scanner, or the phone camera where the browser supports it); products may
  have no barcode.
- Every type works for a **small informal business** (sell, count the cash, hand it to the Boss, see the profit) and
  for a **formal company** (Full accounting: invoices with tax number and VAT, supplier bills, stock valued in the
  books, accountant) — the difference is the company's accounting level, never a different app.

## Two shared engines

1. **Sales & stock** (`lib/trade/`) — SHOP, BAR, OTHER.
   - Products and services: code, barcode, category, unit, sale price, average cost, stock or not, low-stock level,
     returnable crate (bar), units per pack.
   - Stock movements valued at average cost: opening, purchase, sale, return, count, loss.
   - Sales: cart, discount (with the right), cash / MoMo / bank / other / credit (credit → the shared Debts).
   - Bar tabs: drinks served to a table, paid when it closes.
   - Purchases: cash or on credit (credit → a supplier bill of the company's books, paid later).
   - Crates and deposits (bar): full crates in with a purchase, empties back to the brewery, deposits paid and
     refunded, customers taking bottles away, breakage.
2. **Job tickets** (`lib/services/`) — PRESSING, CAR_WASH, OTHER.
   - Price list as a matrix: services × variants (garments, vehicle types).
   - Tickets: received → in progress → ready → collected (or cancelled); express; promised date; tag numbers;
     plate and vehicle type; notes per item (colour, stains).
   - Payments at drop-off or collection (receipts), refunds; revenue counts on collection.
   - Workers and commissions (car wash), earnings and payouts.
   - Loyalty, unclaimed items, "ready" message (WhatsApp link, e-mail).

Each type is a definition in `lib/domains/` with its own words and navigation; pages are shared dispatchers.

## Money and the books

- A sale is a SALE money record (as in the restaurant); its lines and stock moves hang on it.
- A ticket payment is a customer payment (advance until collection); the ticket is revenue on collection.
- Purchases are money out; the **change in stock** (purchases not yet sold, losses) is counted so the profit is
  sales − cost of what was sold. Opening stock is an opening balance, not profit.
- Deposits on crates are never income or expense: 4094 (paid to the brewery) and 4194 (received from customers);
  empties broken cost their deposit.
- The ledger equals the statements for every whole month (tested like the other types).

## As built (7 Oct 2026)

Migration `20261120090000_trade_and_services` (additive: 13 tables, 6 enums, three columns on `transactions`).

**Screens** (`/d/<department>/…`, by type — navigation in `lib/domains/trade.js`):

| Page | Shop | Bar | Pressing | Car wash | Other |
| --- | --- | --- | --- | --- | --- |
| Dashboard: alerts, today, month, stock, credit, 14 days | ✓ | ✓ + tabs, crates | ✓ ready / in progress / late | ✓ queue (waiting, washing, ready) | sales + jobs |
| Sell: search, USB scanner (code + Enter), camera (BarcodeDetector), cart, prices with the right, discount, cash with change, MoMo / bank / other with reference, on credit | ✓ | ✓ + tabs per table | | | ✓ |
| Products / Stock: catalogue, barcode, average cost, margin, low level, counts and losses with a reason, stock card | ✓ | ✓ (+ crate per drink) | | | ✓ |
| Purchases & suppliers: paid or on credit (supplier bill, due date), VAT on the invoice (VAT companies), crates in and empties back, void; bills to pay | ✓ | ✓ | | | ✓ |
| Crates & empties: owed back, here, bottles with customers, deposits, breakage, counts | | ✓ | | | |
| Tickets: views (in the shop, ready, late, unclaimed, collected not paid …), new ticket from the price list (garment / vehicle type), express, tag numbers, ready by, advance; start / ready / collected (balance paid, or owed with the right), payments, refunds, cancel (refund or keep), damage compensation, WhatsApp "ready" message | | | ✓ | ✓ (+ plate, washer) | ✓ jobs |
| Price list: services × variants, commissions, options (variants, express %, loyalty every Nth free, unclaimed days, usual time) | | | ✓ | ✓ | ✓ |
| Washers: earned, paid, owed, payouts | | | | ✓ | |
| Customers: visits, spent, owing, vehicles, next free wash | | | ✓ | ✓ | ✓ |
| Customers on credit (shared debts: old debts, repayments) | ✓ | ✓ | | | ✓ |
| Money in / out, Reports (income statement with the previous period, margins by product / category / cashier, purchases by supplier, losses, by service / variant / washer, turnaround), Search, Cash to Boss, Business details | ✓ | ✓ | ✓ | ✓ | ✓ |

**Documents** (print → PDF): sale receipt (`/money/receipt/<sale>`), drop-off slip / wash ticket, payment receipt and
invoice of a ticket (`/tickets/<ticket>/documents/slip | receipt?t= | invoice`). A **formal** business (its company
in Full accounting or charging VAT) prints the company's legal name, NIU and RCCM and the VAT included; an informal
one prints a plain receipt with its own details.

**Automatic:** morning alerts 06:55 (low / out of stock, tabs open > 12 h, customers' debts past due, supplier bills
due within 5 days, crates owed, tickets late / ready not told / unclaimed / left owing, washers owed), daily report
07:05, weekly Monday 07:45, monthly 1st 07:50 (Africa/Douala) — in the app and by e-mail to the Boss and heads.
The Boss's overview cards show each department's figures.

**Tests:** `tests/integration/trade.test.js` (11: every type end to end, statements, dashboards / reports / search,
automatic reports and alerts, Boss cards, ledger = statements), `tests/unit/trade-math.test.js` (10),
`e2e/trade-and-services.spec.mjs` (6: the four types through the real screens).

## Phase 2 (8 Oct 2026): production, farm, salon / spa / gym

Owner's decisions: production costs by **recipes per batch**; the farm handles **poultry / livestock bands, crops
and fish ponds**; salons and gyms need **appointments** and **memberships & packages**.
Migration `20261201090000_production_farm_salon` (additive: 3 department types, raw materials, two movement kinds,
recipes, production batches, farm batches and events, appointments, membership plans, memberships, check-ins; two
columns on `transactions`).

**Production** (`lib/production/`, type PRODUCTION on the sales & stock engine):

- Products are *products I make or sell* or *raw materials* (bought, used in recipes, never sold at the till).
- A **recipe** says what one round uses and how many units it makes; its cost per unit and margin follow the
  materials' average cost, and the page shows how many rounds the stock allows now.
- A **production batch** (planned quantity → materials from the recipe, or the materials really used typed by
  hand) takes the materials out at their average cost and puts the **good units made** in at exactly the batch's
  cost: waste (planned − made) raises the cost per unit. A batch recorded by mistake is voided (products out,
  materials back).
- Books: raw materials 321 / 6032, finished products 361 / 734 (variation of finished products), sales 702,
  purchases of raw materials 602.

**Farm** (`lib/farm/`, type FARM on the sales & stock engine):

- A **batch** is a band of chickens, pigs, goats …, a field and its season, or a fish pond's cycle.
- Records: deaths, feed and treatments (from the stock of inputs at their average cost — the cost goes to the
  batch — or only noted), weighings, produce (eggs, harvest, fish) into the stock of a product sold at the till,
  animals added, notes; a mistake is voided (the stock comes back).
- **Sell from a batch** (live animals, or a harvest from the field), paid or on credit; expenses and income name
  their batch on Money in / out. The batch shows alive, deaths and mortality %, feed, produce, cost so far, cost a
  head, sales and **profit**; it is closed when sold or harvested.
- Alerts: 2 % or more deaths in a day, batches past their expected end, nothing recorded for 3 days.
- Books: inputs 321 / 6032, produce 361 / 734 (at no cost: what it cost is in the batch), sales 702.

**Salon, spa, gym** (`lib/salon/`, type SALON on the job tickets engine):

- **Appointments** per staff member (a staff member cannot be booked twice at the same time); *Arrived* opens the
  visit (a ticket with the service's price, paid like any visit), *Did not come*, *Cancelled* with a reason.
- **Membership plans**: unlimited for a number of days (monthly gym) or a number of sessions (10-session pack,
  optional validity). A membership sold is a sale (paid or on credit: the member's debt, 706); **check-ins** count
  the sessions; states active / starts later / expired / used up / cancelled; renewal reminders by WhatsApp a week
  before the end or at the last session; *Renew* starts the next one the day after; *Cancel* refunds (the sale is
  voided).
- Staff earn commissions per service like car-wash washers (optional).

Tests: `tests/integration/makers.test.js` (7: the three types end to end, statements, dashboards / reports,
automatic reports, Boss cards, ledger = statements), `tests/unit/makers-math.test.js` (9),
`e2e/makers.spec.mjs` (5: the three types through the screens, every page for the manager and the Boss).
