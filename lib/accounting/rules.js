/**
 * Posting rules (pure): what each money record and each revenue recognition writes in the ledger.
 * An entry spec is { sourceKey, journal, dateKey, label, reference, departmentId, lines }, each line
 * { account, debit, credit, label?, partnerKey?, partnerName?, vatBase? } with whole FCFA amounts.
 * docs/ACCOUNTING_PLAN.md lists the rules; accounts come from the company's resolver
 * (lib/accounting/account-map.js), VAT from its settings.
 */
import { classify } from "@/lib/finance/money-math";
import { CAPITAL_CATEGORIES } from "@/data/categories";

const int = (v) => Math.round(Number(v || 0));

const JOURNAL_OF_METHOD = { CASH: "CA", MOMO: "MM", BANK_TRANSFER: "BQ", OTHER: "CA" };

/** VAT included in `amount` at `rateBp` (basis points): the part that is VAT. */
export function vatIncluded(amount, rateBp) {
  const a = int(amount);
  if (!a || !rateBp) return 0;
  return a - Math.round((a * 10000) / (10000 + rateBp));
}

/**
 * VAT settings of a company for a date: { rateBp, exempt:Set } or null when VAT is off on that day.
 * `company`: { vatEnabled, vatSince (Date or key), vatRateBp, vatExempt }.
 */
export function vatOn(company, dateKey) {
  if (!company?.vatEnabled) return null;
  const since = company.vatSince ? (typeof company.vatSince === "string" ? company.vatSince : company.vatSince.toISOString()).slice(0, 10) : null;
  if (since && dateKey < since) return null;
  return { rateBp: int(company.vatRateBp), exempt: new Set(company.vatExempt || []) };
}

function line(account, debit, credit, extra = {}) {
  return { account, debit: int(debit), credit: int(credit), ...extra };
}

/** Revenue credited to `account`, split into revenue and VAT collected when VAT applies. */
function revenueLines(account, amount, { vat, accounts, taxable = true, label }) {
  const a = int(amount);
  if (!a) return [];
  const sign = a > 0;
  const abs = Math.abs(a);
  const tax = vat && taxable ? vatIncluded(abs, vat.rateBp) : 0;
  const vatAccount = /^70[12]/.test(account) ? accounts.role("VAT_COLLECTED_GOODS") : accounts.role("VAT_COLLECTED");
  const out = [sign ? line(account, 0, abs - tax, { label }) : line(account, abs - tax, 0, { label })];
  if (tax) out.push(sign ? line(vatAccount, 0, tax, { vatBase: abs - tax, label: "VAT" }) : line(vatAccount, tax, 0, { vatBase: abs - tax, label: "VAT" }));
  return out;
}

/** Expense debited to `account` with its deductible VAT (typed on the record). */
function expenseLines(account, amount, taxAmount, { accounts, vat, label }) {
  const a = int(amount);
  const tax = vat ? Math.min(Math.max(0, int(taxAmount)), a) : 0;
  const out = [line(account, a - tax, 0, { label })];
  if (tax) {
    const deductible = /^2/.test(account) ? accounts.role("VAT_DEDUCTIBLE_ASSETS") : /^60/.test(account) ? accounts.role("VAT_DEDUCTIBLE_GOODS") : accounts.role("VAT_DEDUCTIBLE");
    out.push(line(deductible, tax, 0, { vatBase: a - tax, label: "VAT" }));
  }
  return out;
}

/** Deposits are neither income nor expense: the account they move, by category (null: the customer's). */
function depositAccount(category, accounts) {
  if (category === "lease-deposit" || category === "lease-deposit-refund") return accounts.role("DEPOSITS_HELD");
  if (category === "packaging-deposit" || category === "packaging-deposit-refund") return accounts.role("PACKAGING_RECEIVED");
  if (category === "packaging-deposit-paid" || category === "packaging-deposit-back") return accounts.role("PACKAGING_PAID");
  return null;
}

function withPartner(l, partner) {
  return partner ? { ...l, partnerKey: partner.key, partnerName: partner.name } : l;
}

/**
 * The entry of a money record, or null when it writes nothing (voided, zero, unknown type).
 * `t`: { id, type, status, amount, grossAmount, discountAmount, paymentMethod, category,
 *        operationCategory, dateKey, referenceNo, description, counterparty, departmentId,
 *        partner: { key, name } | null, taxAmount }.
 */
export function transactionEntry(t, { accounts, company }) {
  const cls = classify(t);
  const amount = int(t.amount);
  if (!cls || amount <= 0) return null;
  const method = t.paymentMethod || "CASH";
  const onCredit = method === "CREDIT";
  const treasury = onCredit ? null : accounts.treasury(method);
  const vat = vatOn(company, t.dateKey);
  const partner = t.partner || null;
  const base = {
    sourceKey: `tx:${t.id}`,
    dateKey: t.dateKey,
    reference: t.referenceNo || null,
    departmentId: t.departmentId,
    label: t.label || t.description || t.counterparty || t.referenceNo || cls,
  };
  const journal = onCredit ? null : JOURNAL_OF_METHOD[method] || "CA";
  const customer = accounts.role("CUSTOMERS");
  const taxable = (cat) => !vat?.exempt.has(cat);

  switch (cls) {
    case "SALE": {
      const gross = t.grossAmount !== null && t.grossAmount !== undefined ? int(t.grossAmount) : amount;
      const discount = Math.min(int(t.discountAmount), gross);
      const revenue = accounts.category(t.category || "sale-food", "SALE");
      const lines = [
        onCredit ? withPartner(line(customer, amount, 0), partner) : line(treasury, amount, 0),
        ...revenueLines(revenue, gross, { vat, accounts, taxable: taxable(t.category) }),
        ...(discount ? revenueLines(accounts.role("DISCOUNTS"), -discount, { vat, accounts, taxable: taxable(t.category) }) : []),
      ];
      return { ...base, journal: onCredit ? "VE" : journal, lines };
    }
    case "RENT_INCOME":
    case "OTHER_INCOME": {
      const revenue = accounts.category(t.category, cls);
      const taxed = /^7/.test(revenue) && taxable(t.category);
      const lines = [onCredit ? withPartner(line(customer, amount, 0), partner) : withPartner(line(treasury, amount, 0), null), ...revenueLines(revenue, amount, { vat: taxed ? vat : null, accounts })];
      return { ...base, journal: onCredit ? "VE" : journal, lines };
    }
    case "DEBT_PAYMENT":
      if (onCredit) return null;
      return { ...base, journal, lines: [line(treasury, amount, 0), withPartner(line(customer, 0, amount), partner)] };
    case "DISCOUNT":
      if (onCredit) return null;
      return { ...base, journal, lines: [...revenueLines(accounts.role("DISCOUNTS"), -amount, { vat, accounts, taxable: taxable(t.category) }), line(treasury, 0, amount)] };
    case "PURCHASE":
    case "EXPENSE":
    case "OTHER_EXPENSE": {
      const account = accounts.category(t.category, cls);
      const capital = CAPITAL_CATEGORIES.has(t.category);
      const credit = onCredit ? withPartner(line(accounts.role("SUPPLIERS"), 0, amount), partner) : line(treasury, 0, amount);
      return { ...base, journal: onCredit ? "AC" : journal, lines: [...expenseLines(account, amount, t.taxAmount, { accounts, vat, label: capital ? "Asset bought" : undefined }), credit] };
    }
    case "BOOKING_PAYMENT": {
      if (onCredit) return null;
      const target = depositAccount(t.category, accounts) || customer;
      return { ...base, journal, lines: [line(treasury, amount, 0), withPartner(line(target, 0, amount), partner)] };
    }
    case "BOOKING_REFUND": {
      if (onCredit) return null;
      const target = depositAccount(t.category, accounts) || customer;
      return { ...base, journal, lines: [withPartner(line(target, amount, 0), partner), line(treasury, 0, amount)] };
    }
    case "CASH_HANDOVER":
      return { ...base, journal: "CA", lines: [line(accounts.role("BOSS_CASH"), amount, 0), line(accounts.treasury(onCredit ? "CASH" : method), 0, amount)] };
    case "SUPPLIER_PAYMENT":
      if (onCredit) return null;
      return { ...base, journal, lines: [withPartner(line(accounts.role("SUPPLIERS"), amount, 0), partner), line(treasury, 0, amount)] };
    default:
      return null;
  }
}

/** Revenue roles that carry VAT when the company is VAT-registered. */
const TAXABLE_ROLES = new Set(["EVENTS", "NIGHTS", "RENTAL", "OFFICE_RENT", "TENANT_CHARGES", "DAMAGES", "SALES_MEALS", "SERVICES"]);

/**
 * The entry of a revenue recognition or another dated fact the department's records imply:
 * { sourceKey, kind, dateKey, amount, role?, partner?, label, reference, departmentId, ... }.
 *   revenue      Dr customers (partner) / Cr role (event held, nights, month of rent, charge, kept)
 *   forgiven     Dr discounts / Cr customers (a tenant's debt waived)
 *   loss         Dr assets lost / Cr asset account (r.assetRole)
 *   depreciation Dr depreciation / Cr accumulated depreciation
 *   disposal     an asset sold or thrown away: cost, accumulated depreciation, proceeds
 *   deposit-used Dr deposits held / Cr customers (a deposit applied to rent, charges or damage)
 *   opening-debt Dr customers / Cr opening balances (a debt from before the app)
 *   write-off    Dr bad debts / Cr customers
 */
export function recognitionEntry(r, { accounts, company }) {
  const amount = int(r.amount);
  const base = { sourceKey: r.sourceKey, dateKey: r.dateKey, label: r.label, reference: r.reference || null, departmentId: r.departmentId };
  const partner = r.partner || null;
  const customer = accounts.role("CUSTOMERS");
  const vat = vatOn(company, r.dateKey);
  switch (r.kind) {
    case "revenue": {
      if (!amount) return null;
      const account = accounts.role(r.role);
      const taxed = TAXABLE_ROLES.has(r.role) ? vat : null;
      const debit = amount > 0 ? withPartner(line(customer, amount, 0), partner) : withPartner(line(customer, 0, -amount), partner);
      return { ...base, journal: "VE", lines: [debit, ...revenueLines(account, amount, { vat: taxed, accounts })] };
    }
    case "forgiven":
      if (amount <= 0) return null;
      return { ...base, journal: "VE", lines: [...revenueLines(accounts.role("DISCOUNTS"), -amount, { vat: TAXABLE_ROLES.has(r.role || "OFFICE_RENT") ? vat : null, accounts }), withPartner(line(customer, 0, amount), partner)] };
    case "loss":
      if (amount <= 0) return null;
      return { ...base, journal: "OD", lines: [line(accounts.role("ASSET_LOSS"), amount, 0), line(accounts.role(r.assetRole || "FURNITURE"), 0, amount)] };
    case "depreciation":
      if (amount <= 0) return null;
      return { ...base, journal: "OD", lines: [line(accounts.role("DEPRECIATION"), amount, 0), line(accounts.role("ACC_DEPRECIATION"), 0, amount)] };
    case "disposal": {
      const cost = int(r.cost);
      const accumulated = Math.min(int(r.accumulated), cost);
      const proceeds = int(r.proceeds);
      const book = cost - accumulated;
      const lines = [];
      if (accumulated) lines.push(line(accounts.role("ACC_DEPRECIATION"), accumulated, 0));
      if (book) lines.push(line(accounts.role("ASSET_SOLD_BOOK"), book, 0));
      if (cost) lines.push(line(accounts.role(r.assetRole || "RENTAL_EQUIPMENT"), 0, cost));
      if (proceeds) lines.push(line(accounts.role("ASSET_SALE_RECEIVABLE"), proceeds, 0), line(accounts.role("ASSET_SOLD_PROCEEDS"), 0, proceeds));
      return lines.length >= 2 ? { ...base, journal: "OD", lines } : null;
    }
    case "deposit-used":
      if (amount <= 0) return null;
      return { ...base, journal: "OD", lines: [withPartner(line(accounts.role("DEPOSITS_HELD"), amount, 0), partner), withPartner(line(customer, 0, amount), partner)] };
    case "opening-debt":
      if (amount <= 0) return null;
      return { ...base, journal: "AN", lines: [withPartner(line(customer, amount, 0), partner), line(accounts.role("OPENING_EQUITY"), 0, amount)] };
    case "stock-change": {
      // Stock grew (goods bought, not yet sold): an asset, less cost; stock went down: a cost.
      if (!amount) return null;
      // Goods for resale 311 / 6031; raw materials and farm inputs 321 / 6032; finished products 361 / 734.
      const stock = accounts.role(r.stockRole || "GOODS_STOCK");
      const change = accounts.role(r.changeRole || "STOCK_CHANGE");
      return { ...base, journal: "OD", lines: amount > 0 ? [line(stock, amount, 0), line(change, 0, amount)] : [line(change, -amount, 0), line(stock, 0, -amount)] };
    }
    case "opening-stock":
      if (amount <= 0) return null;
      return { ...base, journal: "AN", lines: [line(accounts.role(r.stockRole || "GOODS_STOCK"), amount, 0), line(accounts.role("OPENING_EQUITY"), 0, amount)] };
    case "write-off":
      if (amount <= 0) return null;
      return { ...base, journal: "OD", lines: [line(accounts.role("BAD_DEBTS"), amount, 0), withPartner(line(customer, 0, amount), partner)] };
    default:
      return null;
  }
}

/** Debits and credits of a spec are equal and every line has one positive side. */
export function balanced(spec) {
  if (!spec?.lines?.length || spec.lines.length < 2) return false;
  let d = 0;
  let c = 0;
  for (const l of spec.lines) {
    if (l.debit < 0 || l.credit < 0 || (l.debit > 0) === (l.credit > 0)) return false;
    d += l.debit;
    c += l.credit;
  }
  return d === c && d > 0;
}

/** A stable fingerprint of what an entry says (date, journal, lines): a change means repost. */
export function fingerprint(spec) {
  const body = JSON.stringify([spec.dateKey, spec.journal, spec.lines.map((l) => [l.account, l.debit, l.credit, l.partnerKey || "", l.departmentId || spec.departmentId || ""])]);
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (Math.imul(h2, 31) + c) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}${body.length.toString(16)}`;
}
