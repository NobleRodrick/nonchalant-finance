# Venue rental department: plan

A new department type for a luxury event venue / banquet hall (e.g. "Salle Majestueuse"): bookings and calendar,
pricing, packages, clients and leads, payments and receipts, cash verification, assets checked before and after every
event, dashboards and financial reports. Plus a new sidebar that groups every department under its own name.

Status: **approved** (owner's decisions in §10). Being built stage by stage (§9).

---

## 1. Principles

- **One department type = one module folder.** The venue gets `lib/venue/` (rules, pure calculations, queries),
  `components/venue/` (screens) and `app/(main)/d/[deptId]/<module>` routes, like the restaurant. Every future type
  (bar, pressing, Executive Stay…) follows the same layout, so adding one does not touch the others.
- **Every write is a named operation** (`lib/operations/`), so the rules are the same online and offline, each
  record is saved exactly once, and everything is audited. The operations registry is split per department type
  (`lib/operations/restaurant.js`, `lib/operations/venue.js`, shared ones in `common.js`).
- **Money calculations are pure functions** (`lib/venue/math.js`): balance, payment status, discrepancies,
  profitability, conversion rate. Unit tests cover them, and dashboards, receipts and reports use the same functions,
  so their figures always agree.
- **The database enforces the critical rules**, not just the screens. A date cannot be booked twice (a unique index
  on venue + date for active bookings), every query is scoped to the organization and department, and the
  amounts are stored in whole FCFA.
- **Ready for many users at once:** indexes on every list and calendar range, aggregated queries (no query per row),
  paginated lists, short-lived caching for reference data only, and a load test with 500+ simulated users before it
  is called done.

---

## 2. Sidebar: departments that expand

```
┌ Springer Finance ─────────────┐
│ BUSINESS                       │   (Boss only)
│   Overview                     │
│   Daily reports · Cash · People│
│   Statements · Settings        │
│ DEPARTMENTS                    │
│ ▸ Restaurant Le Palais         │   closed: one line per department
│ ▾ Salle Majestueuse  (venue)   │   open: its own sections
│     Dashboard                  │
│     Calendar                   │
│     Bookings                   │
│     Leads                      │
│     Packages & prices          │
│     Assets                     │
│     Money in / out             │
│     Cash to Boss               │
│     Reports                    │
│     History                    │
│ ▸ Executive Stay               │
└────────────────────────────────┘
```

- The Boss sees the **Business** group and then every department. A head sees only the departments they head; with
  one department it is open, with several each one opens and closes on its own.
- The department of the current page opens automatically. Which ones are open is remembered on this computer.
  Keyboard and screen-reader friendly (buttons with `aria-expanded`), and works the same in the mobile drawer.
- Each department's sections come from its type's definition (`lib/domains/`), filtered by role (the Boss does not
  see "Record a payment"), so new department types appear here without touching the sidebar.
- This replaces the current department switcher card. The restaurant keeps all its pages.

---

## 3. Data (one additive migration)

| Table | What it holds |
|---|---|
| `venues` | The hall(s) of a venue department: name, capacity, base price. One hall to start; ready for several. |
| `venue_price_rules` | Prices by weekday, season (date range) and special date, with a priority: special date > season > weekday > base price. |
| `venue_clients` | Client name, phones, e-mail, organization, notes (one client, many bookings). |
| `venue_bookings` | Reference `B-0001`, hall, client, event type, **event date**, booking date, guests, status (Reserved, Confirmed, Completed, Cancelled), suggested price, **agreed price** (with the reason when it differs), package and a copy of what it included, the lead it came from, the person handling it, notes, cancellation reason. |
| `venue_packages`, `venue_package_items` | Packages (name, description, price, active / removed) and what each includes (e.g. "1 Executive Stay room, 1 night", decoration, sound). |
| `venue_booking_rooms` | The specific Executive Stay room allocated for a booking (room, nights), linked to that department's occupancy records (see §10, question 1). |
| `transactions` (existing) | Payments and refunds of a booking (new types `BOOKING_PAYMENT`, `BOOKING_REFUND`), event expenses (`EXPENSE` linked to the booking): amount, method, who received it, external reference, time. Proof files use the existing attachments. |
| `venue_assets` | Hall inventory: name, category (chairs, tables, decoration, sound, lighting, furniture, other), quantity owned, unit value. |
| `event_asset_checks`, `event_asset_check_lines` | One check **before** and one **after** each event: per asset the quantity present, good, damaged, missing, a condition note and photos. Who checked and when. |
| `venue_leads` | Enquiries: client, contact, enquiry date, proposed date, event type, guests, price / package discussed, source, person handling it, follow-up date, status (New, Contacted, Follow-up required, Negotiating, Booked, Lost, Cancelled), linked booking once booked. |

**No double booking.** In the database: a unique index on (hall, event date) for bookings that are Reserved,
Confirmed or Completed. In the application: a clear message ("12 December is already booked: B-0042, Wedding
Ngono"). A cancelled booking frees the date. Two people booking the same date at the same moment: the database lets
only one succeed.

---

## 4. Calendar and bookings

- **Month calendar**: each day shows available, reserved, confirmed, completed or cancelled (colour + label, never
  colour alone), with the client and the event type. Click a free date to book it, a booked date to open the booking.
  A list view and a search by client or reference.
- **New booking**: pick the date (booked dates cannot be picked), client (search or new), event type, guests, package.
  The **suggested price** comes from the price rules; the agreed price can be changed (the reason is kept).
- **Booking page**: everything about the event: client, dates, price, package and room, payments with receipts,
  balance, asset checks, expenses, profitability, history of changes.
- **Status changes**: Reserved → Confirmed → Completed, or Cancelled (with a reason and what happens to the money
  already paid: refunded, kept or moved to another date). A completed event can no longer be changed except by voiding with a
  reason, like the restaurant.

## 5. Payments, receipts and cash

- **Record a payment** on a booking: amount (never more than the balance unless marked as an overpayment), method
  (cash, Mobile Money, bank), who received it (a person of the department), external reference, proof (photo or
  PDF), remarks. Payment status: Unpaid, Deposit paid, Partly paid, Paid in full, Overpaid or Refunded.
- **Receipt** for every payment and a booking statement: the client, hall, event date, total price, this payment,
  everything paid so far, the balance, date and time, who received it, method, reference, package and services,
  remarks, and a receipt number `R-0001`. Printable (A4 and small receipt printer) and shareable as a PDF.
- **Cash verification** (per day, week or month, and per person who received money):

  | Recorded as received | Counted / confirmed | Handed over to the Boss | Still to hand over | Discrepancy |
  |---|---|---|---|---|

  It also shows the clients' outstanding balances. It reuses the existing "Cash to Boss" (handovers, the Boss's cash
  requests, confirmation or dispute) and the daily count of the report.

## 6. Assets before and after every event

- An **inventory** of the hall (chairs, tables, decorations, sound, lighting, furniture…) with quantities and values.
- For each booking, a **checklist before the event** (quantities and condition, photos) and **after the event**.
- The app shows the **differences**: missing, newly damaged, broken, their estimated cost, with the photos of both
  checks. The head records who is responsible (the client, staff, or unknown) and can **charge it to the client**
  (added to the booking's balance with its own receipt) or record it as a loss.
- An asset damaged or missing is shown in the inventory until it is repaired or replaced (repair costs are expenses
  of the hall).

## 7. Leads

- A list and a board by status, with the follow-ups due today and overdue highlighted.
- **Convert to booking** fills the booking from the lead (client, date, event, guests, package, price) and marks
  the lead Booked.
- **Conversion rate** = leads booked ÷ leads closed (booked + lost + cancelled) for the period, plus the rate per
  source (Facebook, referral, walk-in…) and per person handling the leads.

## 8. Dashboard and reports

- **Department dashboard**: upcoming bookings, available dates in the next 30/90 days, bookings, revenue, received,
  outstanding balances, cash handed over, discrepancies, leads (open, booked, lost, conversion rate), revenue by month
  and by day of the week, the most profitable periods, asset damages and losses, event expenses.
- **Daily, weekly and monthly reports** built automatically (on screen, printable, and a monthly summary to the Boss
  by e-mail through the existing scheduled jobs).
- **Financial reports** for the venue head and the Boss: income statement, cash flow, revenue, expenses,
  payments / collections, outstanding balances, profitability per event, asset costs and losses. They plug into the
  existing statements, so the Boss's company statements include the venue automatically.
- **Boss dashboard**: one card per department of any type. Each type provides its figures (`venueSummary` in
  `lib/venue/reports.js`, `roomsSummary` in `lib/rooms/room-queries.js`) and its card body
  (`components/boss/card-figures.jsx`, keyed by type), so a new type adds two small pieces and nothing else changes.

**As built (stage 7).** One function, `venueReport` (`lib/venue/reports.js`), computes every venue figure for any
period; the definitions are pure and unit-tested in `lib/venue/report-math.js`. The dashboard (this month), the
Reports page (`/d/<id>/reports`, periods Today / Yesterday / This week / This month / Last month / This year /
Custom, printable), the Boss overview and the company statements all read it, so they always agree.

- Revenue = agreed price + charges of **completed** events, on the event date; money kept from a cancelled booking
  (received − refunded) is income of the cancellation day; asset losses are a cost when settled.
- Cash flow = money the day it moves (client payments and refunds move the drawer, they are not income).
- Cash verification: received per person and method, the daily **cash count** (counted vs what the drawer should
  hold; a difference needs an explanation and notifies the Boss), handed over, remaining, disputed handovers.
- Every morning at 07:30 (Inngest `venue-morning-reminders`) the heads and the Boss are told of reservations whose
  hold is over (they keep their date until someone decides) and of events in the next 3 days with a balance owed.
- The monthly statement e-mail already includes the venue (it reads the company statements).

## 9. Delivery in stages

Each stage is finished, tested and usable before the next one starts.

1. **Foundation**: expanding sidebar, department type definitions split per type, "Event venue" type, migration,
   hall settings and price rules.
2. **Calendar and bookings**: clients, double-booking protection, statuses.
3. **Payments, receipts, proof, cash verification.**
4. **Packages**, and **Executive Stay** (rooms, occupancy calendar, room bookings) with the package rooms.
5. **Assets**: inventory, before/after checks, differences, charges and losses.
6. **Leads** and conversion.
7. **Dashboards and reports**: department, Boss across all departments, daily/weekly/monthly, financial reports.
8. **Hardening**: load test with 500+ simulated users, query timings, offline tests, documentation.

Tests at every stage: unit tests (all calculations), integration tests against a real database (rules, double
booking, permissions, one business never sees another's data), end-to-end tests of the screens, and offline tests.

## 10. Owner's decisions

1. **Executive Stay is built too**, as its own department type (rooms, occupancy calendar, room bookings). A
   package's free room is a real booking of a specific room there, so the room shows as occupied; its full features
   (check-in / check-out, room rates, housekeeping…) will be specified by the owner separately.
2. **One event per date**: once a date is booked, no other booking on it.
3. **Revenue on the event date**: money received before the event is a client advance (a liability) until the event
   takes place; cash reports and the cash flow show money the day it is received.
4. **A reservation holds the date until a deadline** (set per venue, e.g. 7 days) unless a deposit is paid; after the
   deadline the head is alerted and can release the date (it is never released silently).
