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
