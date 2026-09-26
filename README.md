# Springer Finance: Multi-Tenant Commercial Operations & Financial Platform

**Primary Domain:** RESTAURANT  
**Currency:** Central African CFA Franc (FCFA)  
**Architecture:** Next.js 16 (App Router), React 19, Prisma ORM 6 with PostgreSQL, Server Actions, Tailwind CSS v4.

---

## 1. Executive Summary

Springer Finance is a domain-aware commercial operations and financial management platform designed for organizations with multiple operational business units (departments). Each department operates with its own staff, inventory ledger, catalog, daily cash drawer, and workflow rules.

The first production-ready domain is **RESTAURANT**, supporting:
- Food menu dishes with direct plate stock and ingredient recipe deduction.
- Real-time stock availability preventing overselling.
- Multi-line itemized sales, customer debt/receivables tracking, and partial debt collections.
- Inward purchases with supplier details, line items, and weighted-average valuation.
- Cash handovers to the CEO with drawer balance validation.
- Daily financial closings, immutable report snapshots, and Boss Review Inbox with approve/return workflow.
- Multi-department staff memberships and real-time active department switching.

Future domain support includes Bar & Lounge, Pressing & Dry Cleaning, Car Wash, Room Rental, and Retail Shop.

---

## 2. Core Concepts & Calculation Contracts

- **Sales:** Gross Sales - Discounts = Net Sales. Discounts adjust revenue and are not recorded as operating expenses.
- **Credit Sales & Debts:** Credit sales generate outstanding debts; cash enters drawer balances only when debt payments are received.
- **Purchases & Valuation:** Purchases increase physical stock and recalculate weighted-average cost:
  `New Unit Cost = (Current Qty × Current Cost + Purchased Qty × Purchase Cost) / (Current Qty + Purchased Qty)`
- **Stock Closing:** `Closing Qty = Opening Qty + Purchased Qty - Sold/Used Qty - Damaged Qty`.
- **Expected Cash:** `Cash Sales + Rent Income + Other Income + Debt Payments Received - Cash Purchases - Cash Opex`.
- **Cash Remaining:** `Expected Cash - CEO Cash Handovers`.

---

## 3. Getting Started

### Prerequisites
- Node.js 18+ (Node 20+ recommended)
- PostgreSQL database (Supabase pooler configured in `.env`)

### Installation & Setup

```bash
# Install dependencies
npm install

# Verify database connection and schema
npx prisma validate
npm run verify

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 4. Verification & Testing

```bash
# Run multi-tenant platform and authentication verification
npm run verify

# Run restaurant domain integration tests
node scripts/verify-restaurant.mjs

# Run production build verification
npm run build
```

---

## 5. Security & Multi-Tenancy

- **Authentication:** JWT access tokens and long-lived refresh tokens stored securely in HTTP-only cookies.
- **Authorization:** `ADMIN` (Boss/Owner), `MANAGER` (Department/Operations Manager), `ACCOUNTANT` (Finance Officer), `STAFF` (Cashier/Shift Operator).
- **Isolation:** Every transaction, stock item, menu dish, sale line, purchase line, and debt is organization- and department-scoped.
