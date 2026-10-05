# Executive Stay (guest house / apartments): plan

The "Rooms / guest house" department type, completed for Executive Stay's 5 apartments: each apartment managed and
measured on its own, and the whole house together. Built on what exists (rooms, stays, occupancy, package rooms from
Salle Majestueuse) and on the platform's shared parts (operations run once per key, offline outbox, cash drawer,
cash to Boss, statements, Boss overview). The number of apartments is not fixed in the code: Executive Stay starts
with its 5, more can be added.

## Owner's decisions (2 Oct 2026)

1. **Revenue per night stayed.** Each night of a stay is revenue on its own date (price ÷ nights; the remainder
   on the first nights so the nights add up exactly). A night counts once the guest has checked in. Money received
   before is the guest's advance; cash reports show money the day it is received. A cancelled stay is never
   revenue; money kept from it (received − refunded) is income on the cancellation date.
2. **Expenses: recorded, then validated.** The head records an expense with its apartment, category, description,
   amount, who was paid, proof, and who authorized it; it counts at once. The Boss — or a head other than the one
   who recorded it — validates it. Expenses not validated yet are flagged on the dashboard and in the reports.
3. **Assets keep their purchase value** (no depreciation). An asset missing or written off leaves the register; its
   value is a loss (a cost in the income statement). Assets bought from the cash drawer are an investment, not an
   expense: they leave the cash, enter the balance sheet, and do not lower the profit.
4. **Daily and weekly reports by e-mail and in the app**: every morning for yesterday, every Monday for last week,
   to the Boss and Executive Stay's heads; the notification opens the report.

## Pages (sidebar: Executive Stay expands into them)

| Page | What it does |
|---|---|
| Dashboard | Apartments with their state and guest, occupied vs available, today's arrivals and departures, upcoming bookings, revenue today / this week / this month, expenses, cash received and handed over, balances owed, profit, pending repairs, apartment comparison, expenses waiting for validation |
| Apartments | The apartments; each has a profile: state (available, reserved, occupied, under maintenance, unavailable), current guest, full booking history, revenue, expenses, assets, repairs, profit |
| Calendar | Occupancy: which apartment is taken each night, by whom |
| Bookings | Upcoming, current, completed, cancelled; each booking: guest, dates, booking type, price (editable, with a note), paid, balance, payment status, receipts, check-in / check-out |
| Money in / out | Payments and refunds (from bookings), expenses by apartment (or shared), other income; validation of expenses |
| Assets | Register per apartment; movements: bought, transferred, damaged, missing, repaired, replaced, removed |
| Maintenance | Repairs per apartment: what, reported, priority, status, estimated and actual cost, responsible, date repaired, invoice; pending repairs first |
| Reports | Any period (today, week, month …): income statement, cash flow, balance sheet, revenue, expenses, apartment profitability, cash collection and verification (cash count), balances owed, bookings and occupancy, assets, maintenance; printable |
| Cash to Boss | As every department |

## Rules

- **No double booking:** a lock per apartment, then a check of its nights (as now). An apartment under
  maintenance or unavailable cannot be booked for the days it is out of use.
- **Apartment state:** set by the head (available / under maintenance / unavailable); reserved and occupied come
  from the bookings (occupied = a guest checked in; reserved = a booking starts today or later).
- **Check-in / check-out** record the time. An early check-out shortens the stay; the price can be changed then
  (with a reason).
- **Payments** (receipt RC-…): amount, method, external reference, who received it, remarks, proof; never more
  than the balance; refunds (RF-…) never more than paid. They move the cash drawer, so cash to the Boss and the
  cash count include them.
- **Balance sheet of the department** at the end of the period: cash in the drawer, money owed by guests for nights
  stayed, furniture and equipment (register value) − guests' advances for nights not stayed yet = net position.
- **Apartment profitability** = its nights' revenue − its expenses − its repairs − its asset losses. Shared costs
  (not tied to an apartment) are shown apart and in the total.

## Delivery

1. Data and apartments: migration (additive), apartment profile and state, bookings completed (guest details,
   booking type, editable price, check-in/out times), payments, refunds, receipts with proof.
2. Money: expenses by apartment with all their details and validation, cash count.
3. Assets register and movements.
4. Maintenance and repairs.
5. Reports and statements: per-night revenue, apartment profitability, balance sheet …; the company statements
   and the Boss overview count Executive Stay the same way (a registry per department type).
6. Dashboard and apartment profile page.
7. Daily and weekly reports (Inngest, e-mail + in-app).
8. Tests (unit, integration, end-to-end), load test, docs, copy to the owner's folder.

## As built (2 Oct 2026)

All eight stages are done; every rule above is enforced by the server and covered by tests.

| Area | Code | Tests |
|---|---|---|
| Apartments: profile, rates (night / week / month), state | `lib/rooms/room-service.js` (`saveRoom`, `setRoomState`), `lib/rooms/stay-math.js` (`apartmentState`) | `tests/integration/stay-bookings.test.js` |
| Bookings: no double booking (lock per apartment), editable price with a reason, check-in / check-out times, early check-out | `room-service.js` (`createStay`, `updateStay`, `moveStay`), `stay-math.js` (`suggestedPrice`) | same (6 bookings of the same nights at once: 1 saved) |
| Payments, refunds, receipts with proof | `lib/rooms/stay-money.js`, `room-queries.js` (`stayDetail`, `stayReceiptOf`), `components/rooms/stay-receipt.jsx` | same |
| Expenses by apartment (or shared), vendor, who authorized, proof; validation by the Boss or another head | `lib/operations/common.js` (`money.record`), `lib/rooms/expense-validation.js` | `stay-money.test.js` |
| Assets per apartment and their movements | `lib/rooms/asset-service.js`, `asset-queries.js` | `stay-assets.test.js` |
| Maintenance and repairs | `lib/rooms/repair-service.js`, `repair-queries.js` | `stay-repairs.test.js` |
| Reports: P&L, cash flow, balance sheet, revenue, expenses, apartment profitability, cash collection, balances owed, bookings and occupancy, assets, maintenance | `lib/rooms/report-math.js` (pure), `lib/rooms/reports.js` (`staysReport`) | `stay-reports.test.js` (a reference day: every figure checked) |
| Company statements and the Boss overview | `lib/departments/accrual.js` (one provider per department type) | same |
| Daily and weekly reports (07:15 daily, 07:20 Monday) | `lib/rooms/periodic-reports.js`, `lib/inngest/function.js`, `emails/template.jsx` | `stay-periodic-reports.test.js`, `tests/unit/stay-email.test.js` |
| Screens | `components/rooms/*`, pages under `app/(main)/d/[deptId]/` (rooms, rooms/[roomId], occupancy, stays, stays/[stayId], money, assets, maintenance, reports) | `e2e/executive-stay.spec.mjs` |

Every write is a named operation (`lib/operations/rooms.js`) run once per key, so the forms work
offline like the rest of the app (records wait on the computer and are sent in order).

**Migration:** `20261015090000_executive_stay` (additive: new columns with defaults, new tables).
