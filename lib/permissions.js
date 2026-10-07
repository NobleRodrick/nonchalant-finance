/**
 * Roles and permissions. There are two roles:
 * - ADMIN, the Boss who created the business. He oversees: reads every department, reviews
 *   daily reports, requests and confirms cash, reads statements, and manages departments and
 *   people. He does not record the day's operations.
 *   While a department has no department head, the Boss runs it himself (effective role OWNER:
 *   everything a head does, plus his own oversight) until he assigns a head.
 * - HEAD, a department head: every person the Boss adds. They head every department the Boss
 *   assigns them to (one or several) and run its day. Their job title (Accountant, Manager …)
 *   is free text chosen by the Boss and does not change what they can do.
 */
export const PERMISSIONS = {
  DEPARTMENT_READ: "department.read",
  INVENTORY_MANAGE: "inventory.manage", // dishes, prices, add stock, corrections, opening stock
  SALES_CREATE: "sales.create",
  SALES_DISCOUNT: "sales.discount", // any discount on a sale (with reason)
  SALES_DISCOUNT_LIMITED: "sales.discount.limited", // up to the department's cashier limit
  MONEY_IN_CREATE: "money.in.create", // rent income, other income
  PURCHASES_CREATE: "purchases.create",
  EXPENSES_CREATE: "expenses.create", // expenses and other expenses
  DISCOUNTS_CREATE: "discounts.create", // standalone discount paid out of the drawer
  DEBTS_MANAGE: "debts.manage", // record a debt, old debts, void a manual debt
  DEBTS_REPAY: "debts.repay", // record a repayment
  HANDOVER_CREATE: "handover.create",
  HANDOVER_CONFIRM: "handover.confirm",
  RECORDS_VOID: "records.void",
  REPORTS_READ: "reports.read",
  REPORTS_SUBMIT: "reports.submit",
  REPORTS_REVIEW: "reports.review",
  STATEMENTS_READ: "statements.read",
  VENUE_MANAGE: "venue.manage", // event venue: hall, prices, packages, asset inventory
  VENUE_BOOK: "venue.book", // event venue: clients, bookings, payments, asset checks, leads
  ROOMS_MANAGE: "rooms.manage", // rooms department: the rooms and their rates
  ROOMS_BOOK: "rooms.book", // rooms department: stays, check-in, check-out
  RENTAL_MANAGE: "rental.manage", // event rental: stock lines, purchases, assets, business details
  RENTAL_BOOK: "rental.book", // event rental: customers, bookings, dispatch and returns, payments
  PROPERTY_MANAGE: "property.manage", // property rental: buildings, offices, their charges and prices
  PROPERTY_LEASE: "property.lease", // property rental: tenants, contracts, bills, payments, deposits, maintenance
  SERVICES_TICKET: "services.ticket", // pressing, car wash, jobs: tickets, payments, collection
  SERVICES_MANAGE: "services.manage", // pressing, car wash, jobs: price list, workers
  EXPENSES_APPROVE: "expenses.approve", // check expenses recorded by someone else
  PRICES_CHANGE: "prices.change", // a price other than the list price, discounts
  REPORTS_EXPORT: "reports.export", // download reports (CSV, Excel)
  ITEMS_ARCHIVE: "items.archive", // archive stock lines, customers, assets (never deleted)
  ORGANIZATION_MANAGE: "organization.manage", // departments, people, drawers, periods, settings
};

const P = PERMISSIONS;

const BOSS = [P.DEPARTMENT_READ, P.REPORTS_READ, P.REPORTS_REVIEW, P.STATEMENTS_READ, P.HANDOVER_CONFIRM, P.ORGANIZATION_MANAGE, P.EXPENSES_APPROVE, P.REPORTS_EXPORT];

/** A department head runs the department's day. */
const HEAD = [
  P.DEPARTMENT_READ,
  P.INVENTORY_MANAGE,
  P.SALES_CREATE,
  P.SALES_DISCOUNT,
  P.SALES_DISCOUNT_LIMITED,
  P.MONEY_IN_CREATE,
  P.PURCHASES_CREATE,
  P.EXPENSES_CREATE,
  P.DISCOUNTS_CREATE,
  P.DEBTS_MANAGE,
  P.DEBTS_REPAY,
  P.HANDOVER_CREATE,
  P.RECORDS_VOID,
  P.REPORTS_READ,
  P.REPORTS_SUBMIT,
  P.STATEMENTS_READ,
  P.VENUE_MANAGE,
  P.VENUE_BOOK,
  P.ROOMS_MANAGE,
  P.ROOMS_BOOK,
  P.RENTAL_MANAGE,
  P.RENTAL_BOOK,
  P.PROPERTY_MANAGE,
  P.PROPERTY_LEASE,
  P.SERVICES_TICKET,
  P.SERVICES_MANAGE,
  P.EXPENSES_APPROVE,
  P.PRICES_CHANGE,
  P.REPORTS_EXPORT,
  P.ITEMS_ARCHIVE,
];

export const ROLES = ["ADMIN", "HEAD"];

export const ROLE_PERMISSIONS = {
  ADMIN: new Set(BOSS),
  HEAD: new Set(HEAD),
  // The Boss in a department that has no head yet (an effective role, never stored on a user).
  OWNER: new Set([...BOSS, ...HEAD]),
};

export const ROLE_LABELS = {
  ADMIN: "Boss",
  HEAD: "Department head",
  OWNER: "Boss (runs it)",
  ACCOUNTANT: "Accountant (books only)",
};

/** Whether a page or menu entry open to `roles` (ADMIN / HEAD) is open to `role`. */
export function roleAllowed(roles, role) {
  if (role === "OWNER") return roles.includes("HEAD") || roles.includes("ADMIN");
  return roles.includes(role);
}

export const ROLE_DESCRIPTIONS = {
  ADMIN: "Created the business. Oversees every department (results, daily reports, cash, statements) and manages departments and people.",
  HEAD: "Runs the departments the Boss assigned: stock, sales, money in and out, debts, cash to the Boss and the daily report.",
};

/** Suggestions for the job title field; the Boss may type any title. */
export const TITLE_SUGGESTIONS = ["Manager", "Accountant", "Supervisor", "Head chef", "Bar manager", "Cashier"];

/** "Accountant · Department head" (or just the role when there is no title). */
export function personLabel(user) {
  if (!user) return "";
  if (user.role === "ADMIN") return ROLE_LABELS.ADMIN;
  if (user.role === "ACCOUNTANT") return user.title && user.title !== "Accountant" ? `${user.title} · Accountant` : "Accountant";
  return user.title ? `${user.title} · ${ROLE_LABELS.HEAD}` : ROLE_LABELS.HEAD;
}

export function roleHasPermission(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role]?.has(permission));
}

/**
 * Rights the Boss gives each head, per department, beyond the daily work (owner's decision for
 * Deco Diva, applied to every department). New and existing heads have them all; the Boss
 * switches them off per person on People. The Boss himself always has them.
 */
export const GRANTS = {
  APPROVE: { label: "Approve expenses", description: "Check expenses recorded by someone else." },
  VOID: { label: "Void money records", description: "Cancel a sale, payment, expense or charge (it stays in the history with the reason)." },
  PRICES: { label: "Change prices and give discounts", description: "Use a price other than the list price, give discounts." },
  EXPORT: { label: "Export reports", description: "Download reports and lists (CSV, Excel)." },
  ARCHIVE: { label: "Archive records", description: "Archive stock items, customers and assets (never deleted)." },
};
export const ALL_GRANTS = Object.keys(GRANTS);

/** The right a permission needs on top of the role (heads only). */
const PERMISSION_GRANT = {
  [P.RECORDS_VOID]: "VOID",
  [P.EXPENSES_APPROVE]: "APPROVE",
  [P.PRICES_CHANGE]: "PRICES",
  [P.SALES_DISCOUNT]: "PRICES",
  [P.REPORTS_EXPORT]: "EXPORT",
  [P.ITEMS_ARCHIVE]: "ARCHIVE",
};

/** The right a permission needs (or null). */
export const grantFor = (permission) => PERMISSION_GRANT[permission] || null;

/**
 * Whether `role` with the head's `grants` in that department may use `permission`. Only heads
 * (HEAD) are limited by rights; the Boss (ADMIN, or OWNER of a department he runs) is not.
 */
export function permits(role, permission, grants = ALL_GRANTS) {
  if (!roleHasPermission(role, permission)) return false;
  const grant = grantFor(permission);
  return role !== "HEAD" || !grant || (grants || ALL_GRANTS).includes(grant);
}

/** The rights of a list (unknown keys dropped, order kept). */
export function cleanGrants(list) {
  const set = new Set(Array.isArray(list) ? list : []);
  return ALL_GRANTS.filter((g) => set.has(g));
}
