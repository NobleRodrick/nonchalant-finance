# Full accounting (SYSCOHADA): plan

Owner's decisions (6 Oct 2026):

- **Boss → companies → departments.** Taxes, VAT and statements belong to a registered company (NIU). A Boss can own
  several companies; every department belongs to one. One company is created by default (named after the business),
  so a small owner never sees the layer.
- **Accounting level per company:** **Simple** (default, the app as it is: money in / out, cash, debts, profit, no
  accountant needed) or **Full accounting (SYSCOHADA)**. Upgrade any time from a date; downgrade hides, never deletes.
- First release includes everything: ledger, statements and closing (income statement, balance sheet, cash-flow
  statement), accountant workspace, VAT, suppliers and payables, receivables, bank / MoMo reconciliation.

OHADA names the same split: *Système normal* (full) and *Système minimal de trésorerie* (simple).

## Principles

1. **Heads' screens never change.** They sell, collect and record as today. Accounting is a separate section for the
   Boss and the accountant.
2. **The ledger is generated, never typed twice.** Every money record and every revenue recognition produces its
   journal entry through *posting rules* (`lib/accounting/rules/*`). Manual entries exist only for what the app does
   not know (bank loans, capital, salaries paid outside, adjustments).
3. **Immutable.** Entries are never edited or deleted. A changed or voided source record is corrected by a reversal
   entry and a new entry. A closed period is frozen: a late change is posted in the first open day, marked "late".
4. **One set of figures.** For whole months, the ledger's income statement equals the department and company
   statements to the franc (tested). Differences only come from what Simple ignores on purpose (write-offs are now
   counted in both).
5. **Built when needed.** A company's ledger is built from its whole history when it switches to Full, then kept up to
   date: after each record (background), before any accounting page is read, and every night (dated recognitions such
   as monthly rent or nights).

## Model

- `Company` (organization, name, legal name, NIU, RCCM, address, `accountingLevel` SIMPLE | FULL, `fullSince`,
  fiscal year start month, `features` {vat, payables, reconciliation}, VAT settings, account map overrides).
  `Department.companyId`; `AccountingPeriod.companyId`.
- `LedgerAccount` (company, number, name (French, official), label (English), class 1–9, kind, `isActive`,
  `reconcilable`). Seeded from the SYSCOHADA revised chart; sub-accounts can be added.
- `Journal` (company, code, name, kind): VE sales, AC purchases, CA cash, BQ bank, MM mobile money, OD general,
  AN opening (à-nouveaux).
- `JournalEntry` (company, journal, number per journal and year, date, label, `sourceKey`, `fingerprint`, status
  POSTED | REVERSED | DRAFT | PENDING_APPROVAL, `reversalOfId`, `late`, created by / approved by).
- `JournalLine` (entry, account, debit, credit, label, department, `partnerKey` + partner name (customer, tenant,
  supplier), VAT code, reconciliation id). A database check keeps every posted entry balanced.

## Posting rules (defaults; the accountant can change the account of any category)

| Source | Debit | Credit |
|---|---|---|
| Sale paid (cash / MoMo / bank) | 5711 Cash, 552 MoMo, 5211 Bank | 702 Sales (meals) — discount on the sale: Dr 7019 |
| Sale on credit / old debt added | 411 Customers (debt) | 702 / 121 opening |
| Debt repaid | Treasury | 411 |
| Debt written off | 651 Bad debts | 411 |
| Rent / other income | Treasury | 7064, 7073, 758 … (by category) |
| Expense / purchase | 60x–66x by category | Treasury (or 401 Suppliers on credit) |
| Asset bought (capital categories) | 24x Equipment | Treasury |
| Booking / stay / order / tenant payment | Treasury | 411 (that booking, stay, order or contract) |
| Refund to a client | 411 | Treasury |
| Event held (venue, event rental) | 411 | 7061 / 7063 |
| Nights of a stay (per month) | 411 | 7062 |
| Office rent of a month, tenant charges | 411 (contract) | 7064 / 7065 |
| Debt forgiven (tenant) | 7019 | 411 |
| Kept on cancellation | 411 | 758 |
| Deposit received / refunded / applied | Treasury / 165 / 165 | 165 / Treasury / 411 |
| Cash handed to the Boss | 5712 Boss's cash | 5711 department cash |
| Depreciation (event rental assets) | 681 | 284 |
| Asset lost | 658 | 24x |
| VAT (when on) | — | 4431 / 4432 VAT collected; Dr 4452 / 4454 deductible |

Revenue in a credit balance of 411 (money received before the event or month) is shown on the balance sheet as
*Clients, avances reçues* (4191).

## Statements

- Trial balance, general ledger (with drill-down to the source record), journals, partner balances and ageing.
- **Income statement (compte de résultat)** in the SYSCOHADA order: margins, value added, EBE, operating result,
  financial result, HAO, net result — with the previous year.
- **Balance sheet (bilan)**: fixed assets net of depreciation, receivables, advances, treasury; equity, the year's
  result, financial debts (deposits held), suppliers, tax, customer advances.
- **Cash-flow statement (TFT)**: opening net treasury, operating / investing / financing flows (classified by the
  counterpart of each treasury line), closing treasury — checked against the balance sheet.
- The year's result is computed (no closing entries needed); the accountant records its allocation with a template.

## Closing

Month and year closing per company (locks every department of the company), checks before closing (unbalanced
suspense, unapproved daily reports, unreconciled bank lines, unapproved manual entries), opening balances wizard
(cash, bank, MoMo, customers, suppliers, assets, capital as the balancing figure).

## Accountant

A third person type, **Accountant**, added by the Boss to one or more companies: reads every department, works in
Accounting (manual entries, closing, reconciliation, VAT, statements), records no sales. Manual entries above a
threshold or by a head go through approval.

## VAT

Off unless the company is VAT-registered. Start date, prices include VAT (default) or not, rates (standard 19.25 %
as commonly published for Cameroon — confirm with the accountant), exempt categories. VAT collected on revenue
recognitions and income, deductible VAT typed on expenses and supplier bills. Monthly VAT report (collected −
deductible = to pay / credit carried forward) and its settlement entry.

## Suppliers, receivables, reconciliation

Supplier bills (lines by category, VAT, due date) paid later or in parts; aged payables and receivables;
bank / MoMo statement import (CSV), automatic matching by amount, date and reference, and entries created from
unmatched lines (fees, interest).

## Stages

1. Companies, accounting level, chart of accounts, journals, ledger tables.
2. Posting engine and sync, backfill, matching tests.
3. Statements and closing.
4. Accountant workspace.
5. VAT.
6. Suppliers, receivables, reconciliation.
7. Tests (unit, integration, e2e), docs, delivery.

## As built (6 Oct 2026)

- **Code:** `lib/accounting/` — `chart.js` (SYSCOHADA revised, ~140 accounts, bilingual), `account-map.js`
  (default account of every category and role, per-company overrides), `rules.js` (pure posting rules,
  VAT split), `recognitions.js` + each domain's `*Recognitions` (same sources as its statements), `ledger.js`
  (post, reverse, numbering `VE-2026-000042`, ledger lock), `sync.js` (desired-state sync), `balances.js`,
  `statement-math.js` (compte de résultat XA…XI, bilan AD…DZ, TFT ZA…ZH), `reports.js`, `manual-entries.js`,
  `closing.js`, `vat.js`, `bills.js`, `reconciliation.js`, `partners.js`, `books-math.js` (pure), `access.js`.
  Actions: `actions/accounting.js`. Pages: `/accounting` and `/accounting/[companyId]/…` (overview, entries,
  general ledger, trial balance, statements, customers & suppliers, VAT, supplier bills, reconciliation,
  closing, settings).
- **Database:** migration `20261110090000_accounting` (additive): companies (one default per business, set by a
  trigger for every new department), company members (accountants), chart, journals, entries and lines,
  suppliers, supplier bills, bank statements; `transactions.tax_amount / supplier_id / supplier_bill_id`;
  `TransactionType SUPPLIER_PAYMENT`; `UserRole ACCOUNTANT`. The database refuses an unbalanced posted entry
  (deferred constraint trigger) and any change or deletion of a posted entry or line (triggers).
- **The ledger is built lazily:** a company's books are written from its whole history the moment it
  switches to Full (not before, so Simple businesses cost nothing), then kept up to date after every record
  (Inngest `ledger-department-sync`, debounced), before any accounting page is read, and every night at 02:30
  (`ledger-nightly-sync`: months of rent, nights, depreciation).
- **Same figures:** for every whole month and every department type, the ledger's result equals the
  statements' (tested on the restaurant, venue, guest house, event rental and property reference data).
  Simple statements now also count debts written off. With VAT on, revenue in the books is net of VAT.
- **Accountants** (role ACCOUNTANT, added by the Boss in Accounting → Settings) see Accounting only; the Boss
  approves their manual entries above the company's threshold, closes and reopens months, records the
  allocation of a year's result.
- **VAT:** collected computed from the amounts recorded (they include VAT); deductible VAT typed by the
  accountant on each expense (VAT page) or on supplier bills — the heads' forms are unchanged; monthly return
  entry (4441 to pay / 4449 credit carried).
- **Supplier bills:** lines are expenses on credit of a department on the bill's date; payments are
  `SUPPLIER_PAYMENT` records (cash, MoMo, bank) — counted once in every report.
- **Reconciliation:** CSV import (French or English headers, amount or debit/credit columns), automatic matching
  (same amount, ±7 days, reference first), manual matching, "record it" for bank charges and interest.
- **Tests:** 16 unit (rules, VAT, statements, ageing, CSV, matching), 13 integration (accounting) + a ledger
  check in 6 domain suites, e2e `e2e/accounting.spec.mjs` 3/3. Whole suite: 354 unit/integration.
- **Not in this release:** payroll, multi-currency, budgets, the official DSF file format (statements export to
  Excel / PDF), VAT on cash receipts for services (the books use invoice basis), stock variation entries at
  year end (purchases stay expenses).


## Department heads keep the books (Dec 2026, migration `20261210090000_head_bookkeepers`)

- **Who**: in Full accounting, the Boss lets a department head keep the books from *Accounting →
  Settings → Department heads who keep the books*: **the books of his departments** or **the books of
  the whole company** (like an accountant). Stored on `company_members` (`scope` COMPANY |
  DEPARTMENTS, `grantedById`); the head is notified; every change is audited
  (`HEAD_BOOKKEEPER_SET`). Back to Simple accounting, or the grant withdrawn: no access.
- **One access check** (`lib/accounting/access.js` `accountingAccess`) returns `departmentIds`
  (null = whole company). Pages and services filter with it: entries (`entryScope`: an entry of one
  of his departments, or a manual entry whose every line is one of them — lines without a department
  are excluded explicitly, SQL `NULL` semantics), entry detail, general ledger, trial balance (with a
  note when entries shared with other departments make his totals differ), income statement,
  customers & suppliers, VAT of his departments (typing the VAT of his expenses), supplier bills.
- **His department only**: manual entries must give every line one of his departments; drafts,
  reversals and deletions are limited to his entries.
- **Segregation of duties**: approving entries above the threshold, closing / reopening months,
  allocating the result and the settings are the Boss's; the VAT return, reconciliation, the chart of
  accounts, the balance sheet and the cash-flow statement are company-wide (the Boss, an accountant or
  a whole-company head).
- **Documents**: every report exports to Excel (.xlsx), CSV and PDF (journal, ledger, trial balance, statements,
  customers and suppliers, VAT), for the head as for the Boss.
- **Statements page and VAT**: when the company keeps Full accounting with VAT, the Boss's (and
  heads') Statements show the VAT inside the money figures — collected (owed to the State),
  deductible (from supplier invoices) — and the **result without VAT**, which is the SYSCOHADA
  result (`lib/accounting/vat-included.js`, read from the books).
- Tests: `tests/integration/head-bookkeeping.test.js` (7), `e2e/accounting.spec.mjs` (5).
