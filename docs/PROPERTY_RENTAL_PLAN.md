# Office & property rental (Place Étoilée & Main Building): plan

A new department type, **PROPERTY_RENTAL** ("Office & property rental"): offices in several buildings rented to
tenants on contracts, with rent, utilities and other charges billed monthly, payments allocated to exactly what
they pay, deposits kept apart from income, maintenance, inspections, move-out, reports and reminders. One flow:

**Office → Tenant → Contract → Rent → Utilities → Payments → Debt → Expenses → Maintenance → Reports**

Built on the platform (operations run once per key and work offline, drawer and cash to the Boss, money records
with proofs and voids, audit trail, statements and Boss overview through the accrual registry, Inngest jobs) and on
the kit made for the event venue, Executive Stay and the event rental (customers, business documents, month grid,
filter bar, export, attention list, cash verification, periodic reports, expense approval, per-person rights).

## Owner's decisions (6 Oct 2026)

1. **Rent is due on the contract's due day** (default the 5th). A tenant moving in mid-month pays the days left of
   that month (prorated by days), then the full rent every month. A contract may bill several months at once
   (every 1, 3, 6 or 12 months): the months of a block are all due on the block's first due day.
2. **Payments go to the oldest debts first, editable.** Recording a payment proposes its split over the tenant's
   unpaid months and charges, oldest first (rent before utilities of the same month); the person recording can
   change the split. Money beyond the debts is an **advance** that pays the next months automatically. The
   receipt lists every month and charge it covered, the previous balance and what remains.
3. **Reminders: e-mail + WhatsApp link.** Management gets the alerts (app + e-mail); tenants with an e-mail get
   their reminder by e-mail; for the others a "Send by WhatsApp" button opens WhatsApp with the message written.
4. **The accountant is a head titled "Accountant"** (two roles stay). The Boss tunes each person with the
   per-person rights (approve, void, prices, export, archive).

Platform rules kept: **revenue is the rent of the month it covers** and a utility charge on its bill date (accrual;
what is not paid is owed by the tenant); cash shows money the day it moves. **A deposit is never income**: it is
money held for the tenant (a liability) until it is refunded, or applied to rent or damages — only then does the
applied part pay those debts.

## Model

| Table | What |
|---|---|
| `property_buildings` | Main Building, Place Étoilée … (name, address, notes) |
| `property_units` | office: building, name/number, floor, category, size m², list rent, deposit required, condition, manual state (available, maintenance, unavailable, awaiting handover), photos, notes |
| `property_unit_charges` | per office: each utility or charge (electricity, water, internet, cleaning, security, waste, maintenance, other) and how it is billed: **meter** (rate per unit), **fixed** amount per month, **share** of a building bill, or **included** in rent |
| `property_leases` | contract: office, tenant (shared customers table), status (reserved, active, ended, cancelled), start, end, move-in, move-out, due day, months per bill, deposit required, notice days, utility responsibilities, conditions, documents |
| `property_rates` | price history: list rent of an office and rent of a contract from an effective month (old prices stay) |
| `property_charges` | every amount billed other than rent: utility (with meter readings: previous, current, units, rate), cleaning, damage, late fee …; month, due date; voided with a reason, never deleted |
| `property_allocations` | which month's rent or which charge each payment, deposit use or credit paid |
| `property_deposits` | deposit ledger per contract: received, refunded, applied to rent, applied to damages |
| `property_maintenance` | request: office, tenant, problem, reported, assigned, appointment, cost, technician, status (reported → approved → in progress → completed, or cancelled), completion, receipt, photos |
| `property_inspections` | move-in, move-out, damage, maintenance or routine; rows (area, condition, note), photos, damage cost |

Money records (`transactions`) gain `leaseId`, `unitId`, `buildingId`: payments and deposits are booking payments
(categories `lease-payment`, `lease-deposit`), refunds booking refunds (`lease-refund`, `lease-deposit-refund`);
expenses carry building and office. Tenants are the department's customers (`venue_clients`, + identification).

**Rent is never stored as a bill row**: the schedule of a contract (months, prorated first month, rates by effective
date, months per bill, end of contract) is a pure function, so it is always right without a monthly job and changes
of price apply from their month. What was paid is the sum of the allocations to each month.

## Office status (computed)

🟢 Available · 🔴 Occupied (an active contract) · 🟡 Reserved (a contract signed, not yet moved in) · 🔵 Under
maintenance · ⚫ Unavailable · ⏳ Awaiting handover (tenant left, office not yet confirmed ready). A contract can never
overlap another on the same office (lock per office, checked in the database too).

## Pages

Dashboard · Offices (by building + combined, status colours, office page with full history) · Tenants (profile,
statement, documents) · Contracts (new, renew, rent change, move-out with final inspection and deposit settlement)
· Arrears (rent arrears dashboard: tenant, office, due, paid, balance, months owed, days overdue; filters by
building, office, amount, months, days) · Billing (monthly bills, meter readings for the month in one sheet) ·
Money in / out · Maintenance · Inspections · Calendar (rent due, contract expiry, move-in/out, maintenance,
inspections, payment deadlines) · Reports · Search · Cash to Boss · Business details.

Documents (printable, PDF): receipt, monthly bill, tenant statement (opening balance + rent + utilities + other −
payments = closing), rental agreement, move-out settlement.

## Reports and dashboard

Income statement by building / office / tenant / month (rent, utilities, other income; expenses; net operating
income); cash flow and cash verification; deposits held; arrears and aged debts; occupancy (offices, occupied,
vacant, rate; rent expected vs collected vs outstanding); daily, weekly, monthly reports (automatic, e-mail + app);
export Excel/CSV/PDF. Dashboard: offices, money, tenants, alerts (overdue rent, expiring contracts, vacant offices,
unpaid utilities, maintenance, deposits requiring action, inspections due, move-outs).

## Delivery

1. Type, migration (additive), buildings, offices with charges and price history, tenants (shared customers).
2. Contracts: reserve, start (move-in inspection), no double allocation, rent schedule (pure), office status.
3. Charges and billing: utilities with meter readings, monthly bills; payments with oldest-first allocation,
   advances, receipts; deposits (received, refund, applied).
4. Arrears dashboard, tenant statement, move-out (final inspection, balances, deposit settlement, handover).
5. Maintenance, inspections, expenses by building and office (approval).
6. Reports and statements (by building / office / tenant / month), calendar, search, export.
7. Dashboard and alerts, reminders (management + tenants by e-mail / WhatsApp), periodic reports, Boss overview.
8. Tests (unit, integration, e2e), load test, docs, delivery to the owner's folder.

## As built (6 Oct 2026)

- **Type** `PROPERTY_RENTAL` ("Office & property rental", `lib/domains/property.js`). Creating the department adds
  the two buildings (Main Building, Place Étoilée); more can be added in Settings. Pages: Dashboard, Offices
  (board by building + combined view), Tenants, Contracts, Arrears, Billing (meter readings and the month's bills),
  Money, Maintenance, Inspections, Calendar, Reports, Search, Cash (heads), Settings.
- **Rent is never stored**: `lib/property/rent-schedule.js` (pure) derives every rent item from the contract (due day,
  first month prorated by days, billed every 1/3/6/12 months, rent changes by month, move-out cut).
  `lib/property/account.js` adds the stored charges and the stored allocations of each payment to give each item's
  paid / balance / overdue, the advance (credit) and the account status.
- **Payments** (`property.payment.record`): proposed split oldest first, rent before the same month's utilities,
  editable in the dialog; the rest becomes an advance, applied automatically to the next items. Receipt RC-…, refund
  RF-… (advance only), forgiven debts recorded with a reason.
- **Deposits** are a separate ledger (`property_deposits`: received, refunded, applied to rent / charges / damage);
  they are never income and never reduce rent owed until applied.
- **Charges**: electricity and water by meter (previous reading carried over, consumption × rate), fixed or shared
  charges per office, one-off charges (damage, maintenance, late fee). "Bill the month" is idempotent; bills UB-….
- **Move-out** (`property.lease.end`): final inspection, deposit applied to what is owed, refund of the rest,
  settlement document, office → awaiting handover.
- **Maintenance**: Reported → Approved → In progress → Completed / Cancelled; completion can pay (expense of the
  office) and/or charge the tenant. **Inspections** with findings per area and photos.
- **Money in the accounts**: rent counts day by day in its month, charges on their bill date, waivers reduce income,
  deposits never count; the department appears in Statements (row "Office rent and tenant charges") and on the Boss's
  overview card (occupied, owed, deposits held, alerts).
- **Alerts and reports**: morning alerts 06:50 (overdue rent, unpaid utilities, rent due, expiring contracts, vacant
  offices, deposits to settle, urgent maintenance, inspections, approvals) + e-mail reminders to tenants with an
  address (once a day) and a WhatsApp link on every arrears row; daily 07:10, weekly Monday 07:40, monthly 1st 07:45.
- **Rights**: heads have `property.manage` (offices, buildings) and `property.lease` (contracts, move-out); the Boss
  can switch off per person: prices, void, approve, export, archive. Job titles (Accountant, Manager) are free text.
- **Shared components reused / generalized**: `MoneyBoard` (components/departments/money-board.jsx, now used by event
  rental too), `PaymentFields` (components/kit/payment-fields.jsx), `FilterBar` (month and number filters),
  `BusinessDocument`, profile form, search page, maintenance / calendar / reports / money dispatchers.
- **Migration** `20261101090000_property_rental` (additive). **Tests**: 21 unit, 15 integration, e2e
  `e2e/property-rental.spec.mjs` 5/5 against a production build.

