/**
 * Descriptive categories of money records. The accounting meaning of a record is its TYPE
 * (SALE, RENT_INCOME, OTHER_INCOME, DISCOUNT, PURCHASE, EXPENSE, OTHER_EXPENSE); the category only
 * says what it was for. A category with `domains` belongs to those department types only (e.g.
 * cooking gas for restaurants, decoration for event venues); one without is shared by all.
 * No beverage categories: drinks belong to the future Bar department type.
 */
const R = ["RESTAURANT"];
const V = ["EVENT_VENUE"];
const S = ["ROOM_RENTAL"];

export const MONEY_CATEGORIES = {
  RENT_INCOME: [
    { id: "rent-space", domains: R, label: "Space / stall rent", operationCategory: "RENT_INCOME" },
    { id: "rent-room", domains: R, label: "Room / hall rent", operationCategory: "RENT_INCOME" },
    { id: "rent-equipment", domains: R, label: "Equipment rent", operationCategory: "RENT_INCOME" },
  ],
  OTHER_INCOME: [
    { id: "income-event-fee", label: "Event / service fee", domains: R, operationCategory: "OTHER_INCOME" },
    { id: "venue-extra-services", label: "Extra services (catering, decoration …)", domains: V, operationCategory: "OTHER_INCOME" },
    { id: "venue-other-rental", label: "Equipment or space rented out", domains: V, operationCategory: "OTHER_INCOME" },
    { id: "income-catering", domains: R, label: "Catering order", operationCategory: "OTHER_INCOME" },
    { id: "income-refund", domains: R, label: "Supplier refund", operationCategory: "OTHER_INCOME" },
    { id: "stay-extra-services", label: "Extra services (laundry, transport, meals …)", domains: S, operationCategory: "OTHER_INCOME" },
    { id: "income-other", label: "Other income", operationCategory: "OTHER_INCOME" },
  ],
  DISCOUNT: [
    { id: "discount-customer", label: "Customer goodwill / refund", operationCategory: "DISCOUNT_CUSTOMER" },
    { id: "discount-promo", label: "Promotion", operationCategory: "DISCOUNT_PROMO" },
    { id: "discount-staff", label: "Staff meal / staff discount", operationCategory: "DISCOUNT_STAFF" },
  ],
  PURCHASE: [
    { id: "purchase-food", label: "Food ingredients", operationCategory: "PURCHASE_FOOD" },
    { id: "purchase-ready", label: "Ready-made dishes", operationCategory: "PURCHASE_STOCK" },
    { id: "purchase-supplies", label: "Kitchen supplies", operationCategory: "PURCHASE_SUPPLIES" },
  ],
  EXPENSE: [
    { id: "venue-decoration", label: "Decoration", domains: V, operationCategory: "OPEX_OTHER" },
    { id: "venue-cleaning", label: "Cleaning after events", domains: V, operationCategory: "OPEX_MAINTENANCE" },
    { id: "venue-security", label: "Security", domains: V, operationCategory: "OPEX_OTHER" },
    { id: "venue-event-staff", label: "Event staff & waiters", domains: V, operationCategory: "OPEX_SALARIES" },
    { id: "venue-sound-light", label: "Sound / lighting rental", domains: V, operationCategory: "OPEX_OTHER" },
    { id: "venue-generator", label: "Generator fuel", domains: V, operationCategory: "OPEX_UTILITIES" },
    { id: "venue-asset-replacement", label: "Replacing damaged or missing assets", domains: V, operationCategory: "OPEX_MAINTENANCE" },
    { id: "stay-cleaning", label: "Cleaning & laundry", domains: S, operationCategory: "OPEX_MAINTENANCE" },
    { id: "stay-supplies", label: "Guest supplies (toiletries, linen, kitchen)", domains: S, operationCategory: "OPEX_OTHER" },
    { id: "stay-internet-tv", label: "Internet & TV", domains: S, operationCategory: "OPEX_UTILITIES" },
    { id: "stay-security", label: "Security & caretaker", domains: S, operationCategory: "OPEX_SALARIES" },
    { id: "stay-repairs", label: "Repairs (from Maintenance)", domains: S, operationCategory: "OPEX_MAINTENANCE", internal: true },
    { id: "stay-asset-purchase", label: "Furniture & equipment bought (investment)", domains: S, operationCategory: "OPEX_MAINTENANCE", capital: true, internal: true },
    { id: "opex-gas", domains: R, label: "Cooking gas / charcoal", operationCategory: "OPEX_UTILITIES" },
    { id: "opex-electricity", label: "Electricity", operationCategory: "OPEX_UTILITIES" },
    { id: "opex-water", label: "Water", operationCategory: "OPEX_UTILITIES" },
    { id: "opex-transport", label: "Transport & delivery", operationCategory: "OPEX_TRANSPORT" },
    { id: "opex-wages", label: "Daily wages & salaries", operationCategory: "OPEX_SALARIES" },
    { id: "opex-cleaning", label: "Cleaning & hygiene", operationCategory: "OPEX_MAINTENANCE" },
    { id: "opex-repairs", label: "Repairs & maintenance", operationCategory: "OPEX_MAINTENANCE" },
    { id: "opex-packaging", domains: R, label: "Packaging & takeaway", operationCategory: "OPEX_OTHER" },
    { id: "opex-other", label: "Other operating expense", operationCategory: "OPEX_OTHER" },
  ],
  OTHER_EXPENSE: [
    { id: "other-expense-taxes", label: "Taxes, licences & council fees", operationCategory: "OTHER_EXPENSE" },
    { id: "other-expense-bank-fees", label: "Bank / MoMo charges", operationCategory: "OTHER_EXPENSE" },
    { id: "other-expense-donations", label: "Donations & gifts", operationCategory: "OTHER_EXPENSE" },
    { id: "other-expense-fines", label: "Fines & penalties", operationCategory: "OTHER_EXPENSE" },
    { id: "other-expense-misc", label: "Miscellaneous", operationCategory: "OTHER_EXPENSE" },
  ],
};

const ALL = Object.values(MONEY_CATEGORIES).flat();

/** The categories of `type` a department type offers (shared ones and its own). */
export function categoriesFor(type, domain) {
  return (MONEY_CATEGORIES[type] || []).filter((c) => !c.domains || !domain || c.domains.includes(domain));
}

/** Categories recorded from another page (repairs, assets bought), not chosen on Money in / out. */
export function isInternalCategory(id) {
  return Boolean(ALL.find((c) => c.id === id)?.internal);
}

/** Money spent on assets (an investment: it leaves the cash, not the profit). */
export const CAPITAL_CATEGORIES = new Set(ALL.filter((c) => c.capital).map((c) => c.id));

/** A category of `type` (for `domain` when given), or null. */
export function findCategory(type, id, domain = null) {
  return categoriesFor(type, domain).find((c) => c.id === id) || null;
}

export function categoryLabel(id) {
  if (!id) return "";
  const found = ALL.find((c) => c.id === id);
  if (found) return found.label;
  if (id === "sale-food") return "Menu sale";
  if (id === "venue-booking") return "Booking payment";
  if (id === "venue-refund") return "Booking refund";
  if (id === "stay-payment") return "Stay payment";
  if (id === "stay-refund") return "Stay refund";
  return id.replace(/^[a-z]+-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
