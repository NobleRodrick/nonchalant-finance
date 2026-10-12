/**
 * Finance Copilot: the tools the agent may call. This list IS the agent's permission boundary:
 * anything not here (voiding, deleting, settings, people, approving reports or handovers…) the
 * agent cannot do at all.
 *
 * Tiers:
 *  - READ: runs at once, read-only, limited to the departments the person may read (the same
 *    rule as the Statements page).
 *  - PROPOSE: writes NOTHING. It checks the request and stores a proposal (copilot_actions) that
 *    the person approves or rejects in the app. Only an approval runs it, through
 *    executeOperation as that person (same rights, validations, idempotency and audit as a form).
 */
import { db } from "@/lib/prisma";
import { effectiveRole, readableDepartmentIds } from "@/lib/access";
import { PERMISSIONS, roleHasPermission } from "@/lib/permissions";
import { buildStatements } from "@/lib/finance/statements";
import { drawerNow } from "@/lib/finance/posting-service";
import { summarizeMoney } from "@/lib/finance/money-math";
import { categoriesFor } from "@/data/categories";
import { getDomain } from "@/lib/domains/registry";
import { addDaysToKey, isDateKey, startOfDateKey, toDateKey } from "@/lib/timezone";
import { PURPOSES, ageReceivables, daysBetween, forecastCashFlow, matchFinancing } from "@/lib/copilot/math";

/** Largest amount the agent may propose in one change (FCFA); bigger ones are done by hand. */
export const MAX_PROPOSAL_AMOUNT = 5_000_000;
/** A proposal not decided within this time expires (the figures may have changed). */
export const PROPOSAL_TTL_MS = 30 * 60 * 1000;

export class ToolRefusal extends Error {}
const refuse = (message) => {
  throw new ToolRefusal(message);
};

const S = (description, extra = {}) => ({ type: "STRING", description, ...extra });
const N = (description) => ({ type: "NUMBER", description });
const I = (description) => ({ type: "INTEGER", description });
const A = (items, description) => ({ type: "ARRAY", items, description });

/** Departments the person may read, with the role there and whether statements are allowed. */
export async function copilotScope(user) {
  const ids = await readableDepartmentIds(user);
  const departments = await db.department.findMany({ where: { id: { in: ids }, organizationId: user.organizationId }, orderBy: { createdAt: "asc" } });
  return departments.map((d) => {
    const role = effectiveRole(user, d.id);
    return { ...d, role, canStatements: user.role === "ADMIN" || roleHasPermission(role, PERMISSIONS.STATEMENTS_READ) };
  });
}

/** The departments asked for (all readable ones when none), refusing any outside the scope. */
function pick(ctx, ids, { statements = false } = {}) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  const allowed = ctx.departments.filter((d) => !statements || d.canStatements);
  if (!list.length) {
    if (!allowed.length) refuse("You have no department whose figures you may read.");
    return allowed;
  }
  const chosen = allowed.filter((d) => list.includes(d.id));
  if (chosen.length !== list.length) refuse("One of these departments is not one whose figures you may read. Call list_departments to see yours.");
  return chosen;
}

function period(ctx, fromKey, toKey) {
  const to = isDateKey(toKey) ? toKey : ctx.todayKey;
  const from = isDateKey(fromKey) ? fromKey : `${to.slice(0, 7)}-01`;
  if (from > to) refuse("The start of the period is after its end.");
  if (to > ctx.todayKey) refuse("The period cannot end in the future.");
  if (daysBetween(from, to) > 366) refuse("Choose a period of at most one year.");
  return { fromKey: from, toKey: to };
}

/** Money received and paid per day (every payment method, handovers excluded: internal moves). */
async function dailyFlows(ctx, departments, lookbackDays) {
  const fromKey = addDaysToKey(ctx.todayKey, -lookbackDays);
  const rows = await db.transaction.findMany({
    where: { organizationId: ctx.user.organizationId, departmentId: { in: departments.map((d) => d.id) }, date: { gte: startOfDateKey(fromKey, ctx.timeZone), lt: startOfDateKey(ctx.todayKey, ctx.timeZone) }, type: { not: "CASH_HANDOVER" } },
  });
  const byDay = new Map();
  for (const t of rows) {
    const k = toDateKey(t.date, ctx.timeZone);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(t);
  }
  const firstRecord = rows.reduce((min, t) => (!min || t.date < min ? t.date : min), null);
  const history = [];
  for (let i = lookbackDays; i >= 1; i -= 1) {
    const k = addDaysToKey(ctx.todayKey, -i);
    const m = summarizeMoney(byDay.get(k) || []);
    const sum = (o) => Object.values(o).reduce((s, v) => s + (v || 0), 0);
    history.push({ dateKey: k, cashIn: sum(m.receivedByMethod), cashOut: sum(m.paidByMethod) });
  }
  // Start from the first day with a record (a business opened last week has no 90-day history).
  const firstKey = firstRecord ? toDateKey(firstRecord, ctx.timeZone) : ctx.todayKey;
  return history.filter((h) => h.dateKey >= firstKey);
}

async function cashInDrawers(ctx, departments) {
  const drawers = await Promise.all(departments.map((d) => drawerNow(db, { organizationId: ctx.user.organizationId, departmentId: d.id, timeZone: ctx.timeZone })));
  return departments.map((d, i) => ({ departmentId: d.id, department: d.name, cashInDrawer: drawers[i].shouldRemain, cashInToday: drawers[i].cashIn, cashOutToday: drawers[i].cashOut, handedOverToday: drawers[i].handedOver, handoverWaitingConfirmation: drawers[i].handoverPending }));
}

async function openDebts(ctx, departments) {
  const debts = await db.debt.findMany({
    where: { organizationId: ctx.user.organizationId, departmentId: { in: departments.map((d) => d.id) }, voidedAt: null, status: { not: "PAID" } },
    select: { debtorName: true, amountOwed: true, amountPaid: true, date: true, dueDate: true, departmentId: true },
  });
  return debts.map((d) => ({
    name: d.debtorName,
    outstanding: Math.round(Number(d.amountOwed) - Number(d.amountPaid)),
    dateKey: toDateKey(d.date, ctx.timeZone),
    dueDateKey: d.dueDate ? toDateKey(d.dueDate, ctx.timeZone) : null,
  }));
}

async function financialSummary(ctx, { departmentIds, fromKey, toKey }) {
  const departments = pick(ctx, departmentIds, { statements: true });
  const range = period(ctx, fromKey, toKey);
  const st = await buildStatements({ organizationId: ctx.user.organizationId, departments, ...range, timeZone: ctx.timeZone });
  const i = st.income;
  return {
    period: range,
    departments: departments.map((d) => d.name),
    moneyIn: i.moneyIn,
    moneyOut: i.moneyOut,
    result: i.result,
    marginPercent: i.margin,
    sales: i.salesGross,
    otherRevenue: { rent: i.rentIncome + (i.rentRevenue || 0), events: i.eventsRevenue, stays: i.staysRevenue, services: i.servicesRevenue, other: i.otherIncome },
    costs: { purchases: i.purchases, expenses: i.expenses, otherExpenses: i.otherExpenses, discounts: i.discounts, stockUsed: i.stockChange, depreciation: i.depreciation },
    topExpenseCategories: i.expensesByCategory.slice(0, 5),
    previousPeriod: st.previous ? { ...st.previous, moneyIn: i.previous.moneyIn, moneyOut: i.previous.moneyOut, result: i.previous.result } : null,
    changePercent: i.change ? { moneyIn: i.change.moneyIn, moneyOut: i.change.moneyOut, result: i.change.result, expenses: i.change.expenses } : null,
    perDepartment: st.perDepartment.map((d) => ({ department: d.name, moneyIn: d.moneyIn, moneyOut: d.moneyOut, result: d.result })),
    cashHandedToBoss: st.cash?.handedOver ?? null,
    customerDebtsAtEnd: st.debts?.closing ?? null,
    ...(st.stock?.totals?.value ? { stockValueAtEnd: st.stock.totals.value } : {}),
    ...(st.coverage?.expected ? { dailyReportsApprovedByBoss: `${st.coverage.approved ?? 0} of ${st.coverage.expected}` } : {}),
  };
}

async function cashForecast(ctx, { departmentIds, days = 30, otherCash = 0 }) {
  const departments = pick(ctx, departmentIds, { statements: true });
  const [history, drawers] = await Promise.all([dailyFlows(ctx, departments, 84), cashInDrawers(ctx, departments)]);
  const inDrawers = drawers.reduce((s, d) => s + d.cashInDrawer, 0);
  const extra = Math.max(0, Math.round(Number(otherCash) || 0));
  const f = forecastCashFlow({ history, startingCash: inDrawers + extra, days, todayKey: ctx.todayKey });
  return { departments: departments.map((d) => d.name), startingCashBreakdown: { inDepartmentDrawers: inDrawers, otherCashGiven: extra }, ...f, method: "Average money in and out of each day of the week over the last 12 weeks (all payment methods; handovers to the Boss excluded); cautious = 15 % less in, 10 % more out." };
}

/** Every tool: name, tier, description and parameters for the model, and run(ctx, args). */
export const TOOLS = [
  {
    name: "list_departments",
    tier: "READ",
    description: "Lists the departments (business units) this person may read, with their type and the person's role there. Call first when a department id is needed.",
    parameters: { type: "OBJECT", properties: {} },
    run: async (ctx) => ({
      today: ctx.todayKey,
      timeZone: ctx.timeZone,
      currency: "FCFA (XAF)",
      departments: ctx.departments.map((d) => ({ id: d.id, name: d.name, type: getDomain(d.domain)?.label || d.domain, yourRole: d.role, canReadFigures: d.canStatements })),
    }),
  },
  {
    name: "get_financial_summary",
    tier: "READ",
    description: "Income statement for a period: money in, money out, result, margin, costs by kind, top expense categories, comparison with the previous period, per department. Defaults to the current month to date and every readable department.",
    parameters: {
      type: "OBJECT",
      properties: {
        departmentIds: A(S("department id"), "Departments to include; empty for all."),
        fromKey: S("First day, YYYY-MM-DD."),
        toKey: S("Last day, YYYY-MM-DD (not after today)."),
      },
    },
    run: financialSummary,
  },
  {
    name: "get_cash_position",
    tier: "READ",
    description: "Cash that should be in each department's drawer now, today's cash in and out, cash handed to the Boss today and handovers still waiting for his confirmation.",
    parameters: { type: "OBJECT", properties: { departmentIds: A(S("department id"), "Departments; empty for all.") } },
    run: async (ctx, { departmentIds }) => {
      const departments = pick(ctx, departmentIds);
      const drawers = await cashInDrawers(ctx, departments);
      return { asOf: ctx.todayKey, drawers, totalInDrawers: drawers.reduce((s, d) => s + d.cashInDrawer, 0) };
    },
  },
  {
    name: "get_receivables",
    tier: "READ",
    description: "Money customers still owe: total, by age (0-30, 31-60, 61-90, 90+ days) and the largest debtors.",
    parameters: { type: "OBJECT", properties: { departmentIds: A(S("department id"), "Departments; empty for all.") } },
    run: async (ctx, { departmentIds }) => {
      const departments = pick(ctx, departmentIds);
      return { asOf: ctx.todayKey, ...ageReceivables(await openDebts(ctx, departments), ctx.todayKey) };
    },
  },
  {
    name: "forecast_cash_flow",
    tier: "READ",
    description: "Projects the cash of the business day by day for the next 7-90 days from its own last 12 weeks, with an expected and a cautious scenario, the lowest point and the first day cash would run out. otherCash: money held outside the drawers (bank, mobile money, with the Boss) if the person gave it.",
    parameters: { type: "OBJECT", properties: { departmentIds: A(S("department id"), "Departments; empty for all."), days: I("Days ahead (7-90), default 30."), otherCash: N("Cash held outside the drawers, FCFA, if known.") } },
    run: cashForecast,
  },
  {
    name: "get_alerts",
    tier: "READ",
    description: "Checks the business for warning signs: cash running out within 30 days, old customer debts, handovers waiting for confirmation, costs rising faster than income, a loss this month.",
    parameters: { type: "OBJECT", properties: {} },
    run: async (ctx) => {
      const departments = pick(ctx, [], { statements: true });
      const [forecast, debts, summary, waiting] = await Promise.all([
        cashForecast(ctx, { days: 30 }),
        openDebts(ctx, departments).then((d) => ageReceivables(d, ctx.todayKey)),
        financialSummary(ctx, {}),
        db.cashHandover.findMany({ where: { organizationId: ctx.user.organizationId, departmentId: { in: departments.map((d) => d.id) }, status: "RECORDED" }, select: { amount: true, date: true } }),
      ]);
      const alerts = [];
      if (forecast.alert) alerts.push({ level: forecast.expected.firstNegative ? "high" : "medium", code: forecast.alert, detail: `Expected lowest cash ${forecast.expected.lowest.balance} FCFA on ${forecast.expected.lowest.dateKey}; cautious lowest ${forecast.cautious.lowest.balance} FCFA.` });
      if (debts.overdueOver30 > 0) alerts.push({ level: debts.buckets["90+"] > 0 ? "high" : "medium", code: "OLD_CUSTOMER_DEBTS", detail: `${debts.overdueOver30} FCFA owed for more than 30 days (${debts.buckets["90+"]} FCFA over 90 days).` });
      const oldWaiting = waiting.filter((h) => daysBetween(toDateKey(h.date, ctx.timeZone), ctx.todayKey) >= 2);
      if (oldWaiting.length) alerts.push({ level: "medium", code: "HANDOVERS_NOT_CONFIRMED", detail: `${oldWaiting.length} handover(s) of ${oldWaiting.reduce((s, h) => s + Number(h.amount), 0)} FCFA waiting 2+ days for the Boss's confirmation.` });
      if (summary.changePercent && summary.changePercent.moneyOut !== null && summary.changePercent.moneyIn !== null && summary.changePercent.moneyOut - summary.changePercent.moneyIn > 20) {
        alerts.push({ level: "medium", code: "COSTS_RISING", detail: `Money out ${summary.changePercent.moneyOut} % vs money in ${summary.changePercent.moneyIn} % compared with the previous period.` });
      }
      if (summary.result < 0) alerts.push({ level: "high", code: "LOSS_THIS_PERIOD", detail: `Result ${summary.result} FCFA from ${summary.period.fromKey} to ${summary.period.toKey}.` });
      return { asOf: ctx.todayKey, alerts, checked: ["cash forecast 30 days", "customer debts", "handovers", "costs vs income", "result this month"] };
    },
  },
  {
    name: "match_financing_options",
    tier: "READ",
    description: "Ranks kinds of financing for a need (amount, months, purpose) using the business's own cash flow, debts and history; checks affordability (instalment within 40 % of average monthly net cash). Indicative, never an offer or advice.",
    parameters: {
      type: "OBJECT",
      properties: {
        amount: N("Amount needed, FCFA."),
        months: I("Repayment period wanted, months (1-60)."),
        purpose: S("What the money is for.", { enum: PURPOSES }),
        otherCash: N("Cash held outside the drawers, FCFA, if known."),
      },
      required: ["amount", "purpose"],
    },
    run: async (ctx, { amount, months = 12, purpose, otherCash = 0 }) => {
      const need = Math.round(Number(amount));
      if (!(need >= 10_000 && need <= 500_000_000)) refuse("Give an amount between 10 000 and 500 000 000 FCFA.");
      if (!PURPOSES.includes(purpose)) refuse(`Purpose must be one of: ${PURPOSES.join(", ")}.`);
      const departments = pick(ctx, [], { statements: true });
      const [history, debts, drawers, first] = await Promise.all([
        dailyFlows(ctx, departments, 84),
        openDebts(ctx, departments),
        cashInDrawers(ctx, departments),
        db.transaction.findFirst({ where: { organizationId: ctx.user.organizationId, departmentId: { in: departments.map((d) => d.id) } }, orderBy: { date: "asc" }, select: { date: true } }),
      ]);
      const days = history.length || 1;
      const monthlyIn = (history.reduce((s, h) => s + h.cashIn, 0) / days) * 30;
      const monthlyOut = (history.reduce((s, h) => s + h.cashOut, 0) / days) * 30;
      const profile = {
        avgMonthlyCashIn: Math.round(monthlyIn),
        avgMonthlyCashOut: Math.round(monthlyOut),
        avgMonthlyNet: Math.round(monthlyIn - monthlyOut),
        receivablesOpen: debts.reduce((s, d) => s + Math.max(0, d.outstanding), 0),
        cashOnHand: drawers.reduce((s, d) => s + d.cashInDrawer, 0) + Math.max(0, Math.round(Number(otherCash) || 0)),
        monthsOfHistory: first ? Math.floor(daysBetween(toDateKey(first.date, ctx.timeZone), ctx.todayKey) / 30) : 0,
      };
      return { profile, ...matchFinancing({ amount: need, months, purpose, profile }) };
    },
  },
  {
    name: "propose_expense",
    tier: "PROPOSE",
    description: "PROPOSES recording an expense (money paid out) in a department the person runs. Nothing is recorded until the person approves it in the app. Use the category ids from the result of a refusal or from list_expense_categories.",
    parameters: {
      type: "OBJECT",
      properties: {
        departmentId: S("Department id."),
        amount: N("Amount paid, FCFA."),
        categoryId: S("Expense category id."),
        description: S("What was paid for."),
        paidTo: S("Person or supplier paid."),
        paymentMethod: S("How it was paid.", { enum: ["CASH", "MOMO", "BANK_TRANSFER", "OTHER"] }),
      },
      required: ["departmentId", "amount", "categoryId", "description"],
    },
    run: async (ctx, a) => {
      const d = pick(ctx, [a.departmentId])[0];
      if (!["HEAD", "OWNER"].includes(d.role)) refuse(`Only the person who runs ${d.name} records its expenses (the Boss oversees and records nothing in departments that have a head).`);
      const amount = Math.round(Number(a.amount));
      if (!(amount > 0)) refuse("The amount must be more than zero.");
      if (amount > MAX_PROPOSAL_AMOUNT) refuse(`The copilot proposes at most ${MAX_PROPOSAL_AMOUNT} FCFA at a time; record larger amounts yourself on the Money page.`);
      const cats = [...categoriesFor("EXPENSE", d.domain), ...categoriesFor("OTHER_EXPENSE", d.domain)].filter((c) => !c.internal);
      const cat = cats.find((c) => c.id === a.categoryId);
      if (!cat) refuse(`Unknown category. Categories of ${d.name}: ${cats.map((c) => `${c.id} (${c.label})`).join(", ")}.`);
      const type = categoriesFor("EXPENSE", d.domain).some((c) => c.id === cat.id) ? "EXPENSE" : "OTHER_EXPENSE";
      const description = String(a.description || "").trim().slice(0, 200);
      if (!description) refuse("Say what the expense was for.");
      const input = { departmentId: d.id, type, amount, category: cat.id, description, counterparty: String(a.paidTo || "").trim().slice(0, 120) || undefined, paymentMethod: a.paymentMethod || "CASH" };
      return { kind: "money.record", input, amount, summary: `Record an expense of ${amount} FCFA in ${d.name}: ${cat.label} — ${description}${input.counterparty ? ` (paid to ${input.counterparty})` : ""}, ${input.paymentMethod}.` };
    },
  },
  {
    name: "propose_cash_handover",
    tier: "PROPOSE",
    description: "PROPOSES handing cash from a department's drawer over to the Boss (the head's action). Nothing happens until the person approves it; the Boss then confirms receipt as usual.",
    parameters: { type: "OBJECT", properties: { departmentId: S("Department id."), amount: N("Amount, FCFA."), note: S("Optional note.") }, required: ["departmentId", "amount"] },
    run: async (ctx, a) => {
      const d = pick(ctx, [a.departmentId])[0];
      if (d.role !== "HEAD") refuse("Only a department head hands cash over to the Boss.");
      const amount = Math.round(Number(a.amount));
      if (!(amount > 0) || amount > MAX_PROPOSAL_AMOUNT) refuse(`Give an amount between 1 and ${MAX_PROPOSAL_AMOUNT} FCFA.`);
      const drawer = (await cashInDrawers(ctx, [d]))[0];
      if (amount > drawer.cashInDrawer) refuse(`The drawer of ${d.name} should hold ${drawer.cashInDrawer} FCFA: you cannot hand over more.`);
      return { kind: "handover.record", input: { departmentId: d.id, amount, note: String(a.note || "").slice(0, 200) || undefined }, amount, summary: `Hand ${amount} FCFA of ${d.name}'s cash over to the Boss (the drawer should hold ${drawer.cashInDrawer} FCFA).` };
    },
  },
  {
    name: "propose_cash_request",
    tier: "PROPOSE",
    description: "PROPOSES (Boss only) asking the heads of RESTAURANT departments to bring the cash of a day or period (other department types hand cash over themselves). Nothing is sent until the Boss approves it.",
    parameters: { type: "OBJECT", properties: { departmentIds: A(S("department id"), "Departments asked."), fromKey: S("First day, YYYY-MM-DD."), toKey: S("Last day, YYYY-MM-DD."), note: S("Optional note to the heads.") }, required: ["departmentIds"] },
    run: async (ctx, a) => {
      if (ctx.user.role !== "ADMIN") refuse("Only the Boss requests cash from departments.");
      // Same rule as the Boss's Cash page: cash requests exist for restaurant departments; the
      // other departments hand their cash over from their own "Cash to Boss" page.
      const asked = Array.isArray(a.departmentIds) && a.departmentIds.some(Boolean);
      const departments = pick(ctx, a.departmentIds);
      const other = asked ? departments.find((d) => d.domain !== "RESTAURANT") : null;
      if (other) refuse(`Cash requests are for restaurant departments; ${other.name} is not one. Its head hands the cash over from the department's "Cash to Boss" page.`);
      const requestable = departments.filter((d) => d.domain === "RESTAURANT");
      if (!requestable.length) refuse("Cash requests are for restaurant departments, and none of these is one. Their heads hand the cash over from each department's \"Cash to Boss\" page.");
      const range = period(ctx, a.fromKey || ctx.todayKey, a.toKey || a.fromKey || ctx.todayKey);
      return { kind: "cash.request", input: { departmentIds: requestable.map((d) => d.id), ...range, note: String(a.note || "").slice(0, 200) || undefined }, amount: null, summary: `Ask ${requestable.map((d) => d.name).join(", ")} to bring the cash of ${range.fromKey === range.toKey ? range.fromKey : `${range.fromKey} to ${range.toKey}`}.` };
    },
  },
  {
    name: "list_expense_categories",
    tier: "READ",
    description: "Expense categories (id and label) of a department, for propose_expense.",
    parameters: { type: "OBJECT", properties: { departmentId: S("Department id.") }, required: ["departmentId"] },
    run: async (ctx, { departmentId }) => {
      const d = pick(ctx, [departmentId])[0];
      return { department: d.name, categories: [...categoriesFor("EXPENSE", d.domain), ...categoriesFor("OTHER_EXPENSE", d.domain)].filter((c) => !c.internal).map((c) => ({ id: c.id, label: c.label })) };
    },
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** The function declarations sent to the model. */
export function toolDeclarations() {
  return TOOLS.map((t) => ({ name: t.name, description: `[${t.tier}] ${t.description}`, parameters: t.parameters }));
}
