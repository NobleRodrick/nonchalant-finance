# Operational Restaurant & Department Financial Management System

Transform the platform from a generic personal-finance tracker into a **Commercial Departmental Management System** tailored for hospitality (restaurants, bars, lounges) and retail businesses, addressing all 8 pain points raised in the user review.

## User Review Required

> [!IMPORTANT]
> **Database Schema Changes**: We will add `SALE` and `PURCHASE` transaction types (along with `INCOME` and `EXPENSE`), additional fields for sales accounting (`grossAmount`, `discountAmount`, `netAmount`, `paymentMethod`, `customerName`, `isDebtPaid`, `operationCategory`), and a new `DailyStockRecord` model. All existing records will remain intact with default values.

> [!NOTE]
> Central African CFA Franc (`FCFA`) remains the primary currency, with automatic cash reconciliation formulas ensuring the cashier's daily cash handover matches the cash sales minus cash expenses.

---

## Architecture & Requirements Matrix

| Business Review Requirement | Technical Implementation |
| :--- | :--- |
| **1. Record Sales (Cash vs Credit)** | Dedicated **Record Daily Sales** modal/page with fields for Gross Sales, Cash Sales, Credit/Debt Sales, Other Income, Date & Time, Customer Name. |
| **2. Separate Discounts** | Explicit discount tracking: `Gross Sales - Discounts = Net Sales`. Discounts tracked as negative revenue adjustment, not hidden in expenses. |
| **3. Separate Purchases vs. Expenses** | Strict categorization: **Purchases / COGS** (rice, meat, vegetables, drinks) vs. **Operating Expenses** (electricity, transport, repairs) vs. **Discounts**. |
| **4. Food Stock Management** | New `DailyStockRecord` model & **Stock Control** module tracking: `Opening Stock + Purchases Received - Stock Used - Damaged/Wasted = Closing Stock`. |
| **5. Daily, Weekly & Monthly Reports** | Revamped `/reports` engine generating top-level **Daily Shift Reports**, **Weekly Summaries**, and **Monthly P&L Statements** with clean printable/downloadable PDF export. |
| **6. Month-by-Month Accounting Periods** | Accounting Period Switcher (`September 2026`, `October 2026`, etc.) with clean segregation and previous month history comparison. |
| **7. Complete Daily Department Overview** | Shift closing dashboard displaying the department's daily financial position, cash collection, and true profit. |
| **8. Industry-Specific Dashboard Strip** | Live KPI strip: Total Sales, Purchases, Expenses, Discounts, Stock Used, Net Sales, Estimated Profit, Cash to Hand Over, Outstanding Debts, Closing Stock. |

---

## Proposed Changes

### Database Layer (`prisma/schema.prisma`)

#### [MODIFY] [`prisma/schema.prisma`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/prisma/schema.prisma)
- Update `TransactionType` to include `SALE` and `PURCHASE`.
- Add `PaymentMethod` enum: `CASH`, `CREDIT`, `MOMO`, `BANK_TRANSFER`.
- Add `OperationCategory` enum: `PURCHASE_FOOD`, `PURCHASE_DRINK`, `PURCHASE_SUPPLIES`, `OPEX_UTILITIES`, `OPEX_TRANSPORT`, `OPEX_MAINTENANCE`, `OPEX_SALARIES`, `OPEX_OTHER`, `SALE_FOOD`, `SALE_DRINK`, `SALE_SERVICES`, `DISCOUNT_PROMO`, `DISCOUNT_STAFF`, `DISCOUNT_CUSTOMER`.
- Add fields to `Transaction`:
  - `grossAmount Decimal?`
  - `discountAmount Decimal?`
  - `netAmount Decimal?`
  - `paymentMethod PaymentMethod @default(CASH)`
  - `customerName String?`
  - `isDebtPaid Boolean @default(false)`
- Add `DailyStockRecord` model:
  - `id`, `date`, `organizationId`, `departmentId`, `userId`
  - `openingStock Decimal @default(0)`
  - `newPurchases Decimal @default(0)`
  - `stockUsed Decimal @default(0)`
  - `damagedStock Decimal @default(0)`
  - `closingStock Decimal @default(0)`
  - `notes String?`
  - `createdAt`, `updatedAt`

---

### Backend Logic & Server Actions

#### [MODIFY] [`actions/transaction.js`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/actions/transaction.js)
- Update `createTransaction` and `updateTransaction` to handle sales breakdowns (`grossAmount`, `discountAmount`, `netAmount`), payment methods (`CASH` vs `CREDIT`), and purchases vs operating expenses.
- Add `createSaleTransaction(data)` specialized server action for daily sales recording.
- Add `markDebtPaid(transactionId)` for tracking customer debt repayments.

#### [NEW] [`actions/stock.js`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/actions/stock.js)
- `recordDailyStock(data)`: Upsert daily stock record for a department and calculate `closingStock = openingStock + newPurchases - stockUsed - damagedStock`.
- `getDepartmentStockHistory(departmentId, startDate, endDate)`: Retrieve stock trends.
- `getLatestStockRecord(departmentId)`: Auto-populate today's opening stock from yesterday's closing stock.

#### [MODIFY] [`actions/dashboard.js`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/actions/dashboard.js)
- Update `getDashboardData` and `getExecutiveKpis` to compute the exact industry KPI set:
  - `totalGrossSales`, `totalDiscounts`, `totalNetSales`
  - `totalPurchases` (Food/Drink stock)
  - `totalExpenses` (Operating overheads)
  - `stockUsed`
  - `estimatedProfit` (`totalNetSales - stockUsed - totalExpenses`)
  - `cashToHandOver` (`cashSales - cashPurchases - cashExpenses`)
  - `outstandingDebts` (Sum of unpaid `CREDIT` sales)
  - `closingStock`

---

### Frontend User Interface & Components

#### [NEW] [`app/(main)/transaction/_components/sales-entry-form.jsx`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/app/(main)/transaction/_components/sales-entry-form.jsx)
- Fast daily sales entry interface:
  - Gross sales amount
  - Discounts given (calculates Net sales live)
  - Split between **Cash Sales** and **Credit/Debt Sales**
  - Customer name & contact for credit sales
  - Date & shift time picker

#### [NEW] [`app/(main)/stock/page.jsx`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/app/(main)/stock/page.jsx) and [`app/(main)/stock/_components/daily-stock-form.jsx`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/app/(main)/stock/_components/daily-stock-form.jsx)
- Clean, accessible **Daily Stock Management** page:
  - Form to enter: Opening stock (auto-loaded from previous day), New purchases received, Stock used, Damaged/wasted stock.
  - Automatically calculates Available Stock and Closing Stock.
  - Table of recent stock movements and consumption rate.

#### [MODIFY] [`app/(main)/dashboard/_components/executive-dashboard.jsx`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/app/(main)/dashboard/_components/executive-dashboard.jsx) & [`app/(main)/dashboard/_components/department-dashboard.jsx`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/app/(main)/dashboard/_components/department-dashboard.jsx)
- Add the **Industry KPI Grid**:
  - Top row: Total Sales (Gross & Net), Discounts, Purchases (COGS), Operating Expenses.
  - Operations row: Stock Used, Closing Stock, Cash to Hand Over, Outstanding Debts, True Estimated Profit.
- Add quick action shortcuts: "Log Sales", "Record Purchase", "Record Expense", "Daily Stock Count".
- Add **Accounting Month Selector** (e.g., September 2026, August 2026) to cleanly separate months without mixing data.

#### [MODIFY] [`app/(main)/reports/page.jsx`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/app/(main)/reports/page.jsx)
- Full upgrade to support:
  - **Daily Shift Closing Report** (Cash handover reconciliation, debts, sales, purchases, stock).
  - **Weekly Performance Summary**.
  - **Monthly Financial & Operational P&L Statement**.
  - Dedicated **Download / Print PDF** view with clean document styling (margins, business header, signature blocks for Cashier and Manager).

#### [MODIFY] [`components/header.jsx`](file:///c:/Users/alloh/Downloads/modifying%20work/nonchalant-finance/components/header.jsx)
- Add "Stock Control" link in navigation for both Admin and Department staff.

---

## Verification Plan

### Automated Verification
- Run database migration via `npx prisma db push`.
- Regenerate Prisma client via `npx prisma generate`.
- Update and run `node scripts/verify-platform.mjs` with new test cases:
  - Test recording sales with cash vs. credit split and discount calculations.
  - Test separating purchases from operating expenses.
  - Test `DailyStockRecord` creation and closing stock formula.
  - Test cash reconciliation calculation.
- Run Next.js build validation: `npm run build` or `npx next build --no-lint`.

### Manual End-to-End User Verification
- Log in as Boss / Admin:
  - View new Industry KPI strip on Executive Dashboard.
  - Test month switching (e.g. September 2026 vs previous months).
  - Check stock records across departments.
- Log in as Department Staff:
  - Record daily sales with a 10,000 FCFA discount and 50,000 FCFA credit sale.
  - Check that Cash to Hand Over displays correctly.
  - Record daily food stock movement (Opening 300k, Purchases 100k, Used 150k -> Closing 250k).
  - Open `/reports` and generate a printable/downloadable Daily Shift Closing Report.
