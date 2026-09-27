/**
 * Roles and permissions. There are two roles:
 * - ADMIN, the Boss who created the business. He oversees: reads every department, reviews
 *   daily reports, requests and confirms cash, reads statements, and manages departments and
 *   people. He does not record the day's operations.
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
  ORGANIZATION_MANAGE: "organization.manage", // departments, people, drawers, periods, settings
};

const P = PERMISSIONS;

const BOSS = [P.DEPARTMENT_READ, P.REPORTS_READ, P.REPORTS_REVIEW, P.STATEMENTS_READ, P.HANDOVER_CONFIRM, P.ORGANIZATION_MANAGE];

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
];

export const ROLES = ["ADMIN", "HEAD"];

export const ROLE_PERMISSIONS = {
  ADMIN: new Set(BOSS),
  HEAD: new Set(HEAD),
};

export const ROLE_LABELS = {
  ADMIN: "Boss",
  HEAD: "Department head",
};

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
  return user.title ? `${user.title} · ${ROLE_LABELS.HEAD}` : ROLE_LABELS.HEAD;
}

export function roleHasPermission(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role]?.has(permission));
}
