/**
 * Descriptive categories for the restaurant's money records. The accounting meaning of a
 * record is its TYPE (SALE, RENT_INCOME, OTHER_INCOME, DISCOUNT, PURCHASE, EXPENSE,
 * OTHER_EXPENSE); the category only says what it was for. No beverage categories: drinks
 * belong to the future Bar department type.
 */

export const MONEY_CATEGORIES = {
  RENT_INCOME: [
    { id: "rent-space", label: "Space / stall rent", operationCategory: "RENT_INCOME" },
    { id: "rent-room", label: "Room / hall rent", operationCategory: "RENT_INCOME" },
    { id: "rent-equipment", label: "Equipment rent", operationCategory: "RENT_INCOME" },
  ],
  OTHER_INCOME: [
    { id: "income-event-fee", label: "Event / service fee", operationCategory: "OTHER_INCOME" },
    { id: "income-catering", label: "Catering order", operationCategory: "OTHER_INCOME" },
    { id: "income-refund", label: "Supplier refund", operationCategory: "OTHER_INCOME" },
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
    { id: "opex-gas", label: "Cooking gas / charcoal", operationCategory: "OPEX_UTILITIES" },
    { id: "opex-electricity", label: "Electricity", operationCategory: "OPEX_UTILITIES" },
    { id: "opex-water", label: "Water", operationCategory: "OPEX_UTILITIES" },
    { id: "opex-transport", label: "Transport & delivery", operationCategory: "OPEX_TRANSPORT" },
    { id: "opex-wages", label: "Daily wages & salaries", operationCategory: "OPEX_SALARIES" },
    { id: "opex-cleaning", label: "Cleaning & hygiene", operationCategory: "OPEX_MAINTENANCE" },
    { id: "opex-repairs", label: "Repairs & maintenance", operationCategory: "OPEX_MAINTENANCE" },
    { id: "opex-packaging", label: "Packaging & takeaway", operationCategory: "OPEX_OTHER" },
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

export function findCategory(type, id) {
  return (MONEY_CATEGORIES[type] || []).find((c) => c.id === id) || null;
}

export function categoryLabel(id) {
  if (!id) return "";
  const found = ALL.find((c) => c.id === id);
  if (found) return found.label;
  if (id === "sale-food") return "Menu sale";
  return id.replace(/^[a-z]+-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
