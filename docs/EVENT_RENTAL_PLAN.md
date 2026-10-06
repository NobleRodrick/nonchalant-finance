# Event & decoration rental (Deco Diva): plan

The "Material rental" department type, completed as **Event & decoration rental** for Deco Diva: decoration services
and items rented out for weddings, birthdays, church services, conferences, funerals and other events. One flow,
everything connected:

**Customers → Bookings → Stock → Dispatch → Event → Returns → Payments → Expenses → Assets → Profit → Reports**

Built on what the platform already has (operations run once per key and work offline, cash drawer and cash to the
Boss, money records with proofs, audit trail, statements, Boss overview, per-department reports, Inngest jobs) and on
parts generalized from the event venue and Executive Stay so the three types share them instead of copying them.

## Owner's decisions (5 Oct 2026)

1. **Items are reserved from dispatch to return.** Each booking has a dispatch date and a return date (by default the
   day before and the day after the event). Its items are unavailable to other bookings for that whole range.
2. **Prices are per event** (500 FCFA a chair for the event, whatever the days); the price of a line stays editable
   per booking (with a reason when it differs from the list price). Extra days, transport, labour, decoration work
   are added as charges or service lines.
3. **Damaged or missing items: decided each time.** A return that does not match what was issued is flagged; the
   manager charges the customer (at the item's replacement value, editable), records a loss for Deco Diva, or sends
   the items to repair.
4. **Per-person rights.** Heads do the daily work by default; the Boss switches, per person and per department,
   the rights to approve expenses, void/archive financial records, change prices and discounts, and export reports.
   Nothing financial is ever deleted: it is voided or archived with a reason and stays in the history.

Also settled by the platform's rules (as the venue): a booking's price is **revenue of the event date** (money
received before is the customer's advance); a cancelled booking is never revenue (money kept is income of the
cancellation date); assets bought from the drawer are an investment, not an expense — **depreciation** spreads their
cost over their useful life (requirement §12).

## Stock: one line per item, quantities from a ledger

An item (Chairs, Gold charger plates, Rose arch …) has: code (auto `CHR-001`, editable), name, category (list +
custom), description, photo, rental price, purchase price (last unit cost), replacement value (charged for losses;
defaults to purchase price), date purchased, supplier, condition, storage location, low-stock level, active/archived.

Quantities are **never typed**: every change is a movement (opening, purchase, issued, returned, damaged, sent to
repair, repaired, missing, found, written off, adjustment with reason, location transfer), and the item keeps running
counters updated in the same transaction:

    owned       = opening + purchased + found − written off ± adjustments
    in stock    = owned − out (issued, not back) − damaged − under repair − missing
    available on a date range = in stock (good) − reserved by bookings overlapping the range

A test checks that the counters always equal the sum of the movements.

## Bookings (events)

Customer, event type, event date and location, dispatch and return dates, lines (item × quantity × price, or a
service line: decoration work, transport, labour), discount, total computed, deposit and payment deadline, created by,
responsible person, staff assigned, special instructions, notes, proofs and documents.

**Status** (stored): Inquiry → Quotation sent → Confirmed → Preparation → Dispatched → Returned → Closed, or Cancelled.
Shown with the payment state (unpaid, deposit paid, fully paid) and "event completed" once its date passed — the ten
stages of the requirements without storing what can be computed.

**Double-booking control:** confirming a booking (and any later change of its lines or dates) takes a lock per item,
then checks every item's availability over the booking's range: *"Insufficient chairs available for 20 Nov 2026.
Only 100 chairs are available."* Inquiries and quotations show availability but do not hold stock. A refused attempt
is logged (it appears in the dashboard warnings and the alerts).

**Calendar:** month view coloured by status, with dispatch, event, return and payment-deadline markers; a click on a
day lists everything that day (customer, event, place, items, quantities, amount, payment status, responsible). An
availability view shows, per item and date, reserved vs available.

## Dispatch and return

- **Dispatch:** the issued quantities are pre-filled from the booking; the manager confirms (may issue less, never
  more than available); stock goes out.
- **Return** (one or several, partial returns allowed): per line, returned good, damaged, broken, missing, needing
  repair. Any difference with what was issued is flagged at once ("5 chairs short") and becomes an **incident** to
  settle: charge the customer, record a loss, or repair (repair cost, who repairs, done date). Missing items found
  later come back into stock.
- Items not back by the return date are flagged as overdue.

## Money

- **Payments** (cash, Mobile Money, bank transfer, other): booking, amount, date, method, receiver, external reference,
  proof; never more than the balance; refunds never more than paid; receipts numbered. Balance = total due − paid;
  overdue = balance left after the payment deadline (or after the event).
- **Documents** (printable, downloadable as PDF): quotation, invoice, receipt, booking confirmation, rental agreement
  (with Deco Diva's terms, set once). Each carries the business details (name, address, phone, e-mail, logo), the
  customer, the event, the items, quantities, prices, total, paid, balance, payment method, date and the authorized
  person.
- **Expenses**: date, amount, category (transport, repairs, cleaning, labour, electricity, fuel, maintenance,
  decoration materials, storage, packaging, communication, marketing, other), description, who spent, who approved,
  method, payee, proof, related event, notes. They count at once and are approved afterwards (as Executive Stay).
- **Purchases**: items with quantity, unit cost, total, supplier, date, method, receipt, responsible, condition; stock
  increases automatically; the item's purchase price updates. A purchase can also register the units as an **asset**.
- **Cash to the Boss, cash count** as every department.

## Assets and depreciation

An asset register (generic, reusable by any department): name, code, category, linked stock item (e.g. *Chairs ×
500*), quantity, purchase date, cost, supplier, useful life, salvage value, method (**straight-line** or **declining
balance**), condition, location, person responsible, disposal. Computed (never typed): depreciation per month,
accumulated depreciation, book value, remaining life. Monthly depreciation is an expense of the income statement
(not cash).

## Profit, reports, analysis

- **Per event:** revenue (lines + charges − discount) − event expenses (transport, labour …) − damage/repair/loss
  costs = event profit and margin.
- **Reports for any period** (today, week, month, custom), daily and weekly and monthly sent automatically (e-mail +
  in-app, as Executive Stay): bookings, items rented and returned, revenue, payments, outstanding and overdue balances,
  expenses, purchases, damaged and missing items, net cash, profit; monthly adds depreciation, customers, most rented
  items, most profitable events, inventory and asset value, net income.
- **Statements:** income statement, cash flow, balance sheet (cash, money owed by customers, inventory at cost,
  assets at book value − customer advances); the company statements and the Boss overview count the department like
  the others (accrual registry).
- **Analysis:** most and least rented items, most profitable items and event types, utilization (days rented ÷ days
  owned), monthly revenue and expense trends, damaged/lost value, customer spending, debts, margins.
- **Export:** CSV and Excel for every table, PDF through the printable page.
- **Search** across customers, bookings, items, payments, expenses, purchases, documents; filters by date, customer,
  event type, item, person, payment status.

## Dashboard and alerts

Dashboard: today's bookings, revenue, payments, expenses; items out, available, damaged; upcoming events; month
revenue, expenses, profit. Warnings: low stock, upcoming bookings with unpaid balances, refused double bookings,
items not returned / missing, damaged items waiting, overdue payments, events needing preparation, expenses waiting for
approval. The same list drives the daily alerts (notification + e-mail): upcoming events, unpaid balances and payment
deadlines, items due back, missing and damaged items, low stock, repairs pending, monthly depreciation, approvals.

## Reuse (what becomes shared)

| Shared part | From | Used by |
|---|---|---|
| Booking money (total, paid, balance, status) | `lib/finance/booking-money.js` | venue, stays, rental |
| Customers (department-scoped clients) | venue clients | venue, rental |
| Expense approval | Executive Stay | stays, rental (and per-person right) |
| Per-person rights | new, `lib/permissions.js` | every department |
| Month calendar | venue | venue, rental |
| Business documents (quotation → contract) | venue receipt | rental (venue later) |
| Depreciation (pure) and asset register | new | rental (any department later) |
| Periodic reports (daily / weekly / monthly) | Executive Stay | stays, rental |
| Table export (CSV / Excel) | statements CSV | every report table |

## Delivery

1. Type, migration (additive), per-person rights, business profile; stock sheet with the movement ledger.
2. Customers and bookings: lines and services, totals, statuses, availability and double-booking control, calendar.
3. Dispatch and returns, incidents (charge, loss, repair), overdue returns.
4. Payments, refunds, documents (quotation, invoice, receipt, confirmation, contract), overdue balances.
5. Expenses with approval, purchases into stock, asset register and depreciation.
6. Event profit, reports and statements, analysis, export, search.
7. Dashboard and warnings, automatic alerts and periodic reports, Boss overview.
8. Tests (unit, integration, end-to-end), load test, docs, copy to the owner's folder.

## As built (stages 1–8)

| Area | Where |
|---|---|
| Type and navigation | `lib/domains/rental.js` (Dashboard, Calendar, Bookings, Customers, Stock, Damages & repairs, Purchases, Money in / out, Reports, Search, Assets, Cash to Boss, Business details) |
| Schema | `prisma/migrations/20261025090000_event_rental` (additive): rental items, movements, orders and lines, checks, incidents, charges, fixed assets; `Department.profile`, `UserDepartment.grants`, `PaymentMethod.OTHER` |
| Operations | `lib/operations/rental.js` (stock, customers, bookings, dispatch/return, damages, charges, payments, refunds, purchases, assets, cash count, business details) + common `expense.validate` |
| Stock ledger | `lib/rental/stock-math.js` (pure), `item-service.js`, `item-queries.js` |
| Bookings and availability | `lib/rental/booking-math.js` (pure: totals, holds, availability, shortages), `order-service.js` (advisory locks per item), `order-queries.js` |
| Dispatch, return, damages | `lib/rental/check-service.js`, `incident-service.js` |
| Money and documents | `lib/rental/order-money.js`, `documents.js`, `components/documents/business-document.jsx` |
| Purchases and assets | `lib/rental/purchase-service.js`, `lib/assets/*` (depreciation is pure and shared) |
| Reports | `lib/rental/report-math.js` (pure), `reports.js` (`rentalReport`, `rentalTrends`, `rentalSummary`, statement figures); page `components/rental/reports/*` with Excel/CSV/PDF export |
| Search | `lib/rental/search.js`, page `/d/[id]/search` |
| Dashboard and alerts | `lib/rental/alert-math.js` (pure warnings), `dashboard.js`, `components/rental/rental-home.jsx`, `components/kit/attention-list.jsx` |
| Periodic reports | `lib/reports/periodic.js` (shared with guest houses), `lib/rental/periodic-reports.js`; Inngest: morning alerts 07:00, daily 07:25, weekly Monday 07:30, monthly 1st 07:35 |
| Boss overview | `lib/boss/overview.js` (rental card figures, urgent warnings as alerts), `components/boss/card-figures.jsx` |
| Shared kit made for this type | export menu and xlsx/csv writer, filter bar, month grid, attention list, cash verification section, business documents, customers service, expense approval |

Tests: unit (`rental-stock-math`, `rental-booking-math`, `rental-alert-math`, `depreciation`), integration
(`rental-stock`, `rental-bookings`, `rental-returns`, `rental-money`, `rental-purchases`, `rental-reports`,
`rental-alerts`), end-to-end `e2e/event-rental.spec.mjs` (setup → stock → booking → refused double booking →
dispatch/return/charge/payment/documents → reports, search, dashboard).
