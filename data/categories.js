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
const M = ["MATERIAL_RENTAL"];
const PR = ["PROPERTY_RENTAL"];
const SH = ["SHOP"];
const BA = ["BAR"];
const PS = ["PRESSING"];
const CW = ["CAR_WASH"];
const PD = ["PRODUCTION"];
const FM = ["FARM"];
const SL = ["SALON"];
const TR = ["SHOP", "BAR", "OTHER", "PRODUCTION", "FARM"];
const SV = ["PRESSING", "CAR_WASH", "OTHER", "SALON"];

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
    { id: "rental-walk-in", label: "Small rental without a booking", domains: M, operationCategory: "OTHER_INCOME" },
    { id: "rental-item-sold", label: "Old items sold", domains: M, operationCategory: "OTHER_INCOME" },
    { id: "property-parking", label: "Parking & signage", domains: PR, operationCategory: "OTHER_INCOME" },
    { id: "property-short-use", label: "Hall or space used by the day", domains: PR, operationCategory: "OTHER_INCOME" },
    { id: "property-penalties", label: "Penalties received (late payment, breach)", domains: PR, operationCategory: "OTHER_INCOME" },
    { id: "shop-services", label: "Services (delivery, phone credit commission, printing …)", domains: SH, operationCategory: "OTHER_INCOME" },
    { id: "bar-hall-hire", label: "Space or terrace hired for an event", domains: BA, operationCategory: "OTHER_INCOME" },
    { id: "bar-entry-fees", label: "Entry fees (concert, match screening)", domains: BA, operationCategory: "OTHER_INCOME" },
    { id: "pressing-alterations", label: "Alterations and repairs of garments", domains: PS, operationCategory: "OTHER_INCOME" },
    { id: "carwash-products", label: "Car products sold (air fresheners, wipers …)", domains: CW, operationCategory: "OTHER_INCOME" },
    { id: "production-custom-orders", label: "Custom orders and services (catering, tailoring work)", domains: PD, operationCategory: "OTHER_INCOME" },
    { id: "farm-manure", label: "Manure, by-products and services (ploughing, transport)", domains: FM, operationCategory: "OTHER_INCOME" },
    { id: "farm-subsidy", label: "Subsidies and grants", domains: FM, operationCategory: "OTHER_INCOME" },
    { id: "salon-products", label: "Beauty / sport products sold", domains: SL, operationCategory: "OTHER_INCOME" },
    { id: "salon-day-pass", label: "Day pass / drop-in session (without membership)", domains: SL, operationCategory: "OTHER_INCOME" },
    { id: "income-other", label: "Other income", operationCategory: "OTHER_INCOME" },
  ],
  DISCOUNT: [
    { id: "discount-customer", label: "Customer goodwill / refund", operationCategory: "DISCOUNT_CUSTOMER" },
    { id: "discount-promo", label: "Promotion", operationCategory: "DISCOUNT_PROMO" },
    { id: "discount-staff", label: "Staff meal / staff discount", operationCategory: "DISCOUNT_STAFF" },
  ],
  PURCHASE: [
    { id: "purchase-goods", label: "Goods for resale (from Purchases)", domains: TR, operationCategory: "PURCHASE_STOCK", internal: true },
    { id: "purchase-drinks", label: "Drinks for resale (from Purchases)", domains: BA, operationCategory: "PURCHASE_DRINK", internal: true },
    { id: "purchase-raw", label: "Raw materials (from Purchases)", domains: PD, operationCategory: "PURCHASE_STOCK", internal: true },
    { id: "purchase-farm-inputs", label: "Farm inputs (from Purchases)", domains: FM, operationCategory: "PURCHASE_STOCK", internal: true },
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
    { id: "rental-fuel", label: "Fuel", domains: M, operationCategory: "OPEX_TRANSPORT" },
    { id: "rental-decoration-materials", label: "Decoration materials (flowers, ribbons, balloons …)", domains: M, operationCategory: "OPEX_OTHER" },
    { id: "rental-storage", label: "Storage", domains: M, operationCategory: "OPEX_OTHER" },
    { id: "rental-packaging", label: "Packaging", domains: M, operationCategory: "OPEX_OTHER" },
    { id: "rental-communication", label: "Communication (phone, internet)", domains: M, operationCategory: "OPEX_UTILITIES" },
    { id: "rental-marketing", label: "Marketing & advertising", domains: M, operationCategory: "OPEX_OTHER" },
    { id: "rental-repairs", label: "Repairs of damaged items (from Stock)", domains: M, operationCategory: "OPEX_MAINTENANCE", internal: true },
    // Items added to the rental stock or the asset register: an investment, not an expense (recorded from Purchases).
    { id: "rental-stock", label: "Rental items & equipment bought (investment)", domains: M, operationCategory: "PURCHASE_STOCK", capital: true, internal: true },
    { id: "trade-shop-rent", label: "Rent of the shop / premises", domains: [...TR, ...SV], operationCategory: "OPEX_OTHER" },
    { id: "trade-council-tax", label: "Council taxes & licences (impôt libératoire, patente)", domains: [...TR, ...SV], operationCategory: "OTHER_EXPENSE" },
    { id: "bar-ice", label: "Ice and cooling", domains: BA, operationCategory: "OPEX_OTHER" },
    { id: "bar-music", label: "Music, DJ, TV subscription", domains: BA, operationCategory: "OPEX_OTHER" },
    { id: "bar-grill", label: "Grill supplies (charcoal, spices, fish, meat)", domains: BA, operationCategory: "PURCHASE_FOOD" },
    { id: "bar-security", label: "Security & waiters", domains: BA, operationCategory: "OPEX_SALARIES" },
    { id: "pressing-detergent", label: "Detergents, solvents & chemicals", domains: PS, operationCategory: "PURCHASE_SUPPLIES" },
    { id: "pressing-packaging", label: "Hangers, bags & tags", domains: PS, operationCategory: "OPEX_OTHER" },
    { id: "pressing-machines", label: "Machine repairs (washers, irons, dryers)", domains: PS, operationCategory: "OPEX_MAINTENANCE" },
    { id: "pressing-compensation", label: "Compensation for a damaged or lost garment", domains: PS, operationCategory: "OPEX_OTHER", internal: true },
    { id: "carwash-products-used", label: "Soap, wax & cleaning products", domains: CW, operationCategory: "PURCHASE_SUPPLIES" },
    { id: "carwash-equipment", label: "Pressure washer & vacuum repairs", domains: CW, operationCategory: "OPEX_MAINTENANCE" },
    { id: "carwash-commission", label: "Washers' commissions (from Washers)", domains: CW, operationCategory: "OPEX_SALARIES", internal: true },
    { id: "trade-shrinkage", label: "Goods given away or used by the business", domains: TR, operationCategory: "OPEX_OTHER" },
    { id: "production-energy", label: "Oven / machine energy (firewood, gas, fuel)", domains: PD, operationCategory: "OPEX_UTILITIES" },
    { id: "production-packaging", label: "Packaging (bags, bottles, labels)", domains: PD, operationCategory: "PURCHASE_SUPPLIES" },
    { id: "production-machines", label: "Machine and tool repairs", domains: PD, operationCategory: "OPEX_MAINTENANCE" },
    { id: "production-labour", label: "Production workers (daily pay)", domains: PD, operationCategory: "OPEX_SALARIES" },
    { id: "farm-young-animals", label: "Chicks, piglets, fingerlings, young animals", domains: FM, operationCategory: "PURCHASE_STOCK" },
    { id: "farm-feed", label: "Feed bought and used at once", domains: FM, operationCategory: "PURCHASE_FOOD" },
    { id: "farm-vet", label: "Vet visits, vaccines and medicine bought for use", domains: FM, operationCategory: "PURCHASE_SUPPLIES" },
    { id: "farm-seeds", label: "Seeds, fertiliser and pesticide bought for use", domains: FM, operationCategory: "PURCHASE_SUPPLIES" },
    { id: "farm-labour", label: "Farm workers (daily pay)", domains: FM, operationCategory: "OPEX_SALARIES" },
    { id: "farm-energy", label: "Fuel, generator, water pumping", domains: FM, operationCategory: "OPEX_UTILITIES" },
    { id: "farm-equipment", label: "Equipment, cages, nets and repairs", domains: FM, operationCategory: "OPEX_MAINTENANCE" },
    { id: "salon-supplies", label: "Hair, beauty and cleaning products used", domains: SL, operationCategory: "PURCHASE_SUPPLIES" },
    { id: "salon-equipment", label: "Equipment repairs (dryers, machines, gym equipment)", domains: SL, operationCategory: "OPEX_MAINTENANCE" },
    { id: "salon-staff", label: "Staff pay and commissions", domains: SL, operationCategory: "OPEX_SALARIES" },
    { id: "opex-gas", domains: R, label: "Cooking gas / charcoal", operationCategory: "OPEX_UTILITIES" },
    { id: "opex-electricity", label: "Electricity", operationCategory: "OPEX_UTILITIES" },
    { id: "opex-water", label: "Water", operationCategory: "OPEX_UTILITIES" },
    { id: "opex-transport", label: "Transport & delivery", operationCategory: "OPEX_TRANSPORT" },
    { id: "opex-wages", label: "Daily wages & salaries", operationCategory: "OPEX_SALARIES" },
    { id: "opex-cleaning", label: "Cleaning & hygiene", operationCategory: "OPEX_MAINTENANCE" },
    { id: "opex-repairs", label: "Repairs & maintenance", operationCategory: "OPEX_MAINTENANCE" },
    { id: "opex-packaging", domains: R, label: "Packaging & takeaway", operationCategory: "OPEX_OTHER" },
    { id: "property-plumbing", label: "Plumbing", domains: PR, operationCategory: "OPEX_MAINTENANCE" },
    { id: "property-security", label: "Security & guards", domains: PR, operationCategory: "OPEX_SALARIES" },
    { id: "property-painting", label: "Painting", domains: PR, operationCategory: "OPEX_MAINTENANCE" },
    { id: "property-construction", label: "Construction & renovation", domains: PR, operationCategory: "OPEX_MAINTENANCE" },
    { id: "property-waste", label: "Waste collection", domains: PR, operationCategory: "OPEX_OTHER" },
    { id: "property-admin", label: "Administrative expenses", domains: PR, operationCategory: "OPEX_OTHER" },
    { id: "property-utilities-paid", label: "Utility bills paid by the company (ENEO, CAMWATER …)", domains: PR, operationCategory: "OPEX_UTILITIES" },
    { id: "property-maintenance", label: "Maintenance (from Maintenance)", domains: PR, operationCategory: "OPEX_MAINTENANCE", internal: true },
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
  if (id === "rental-payment") return "Booking payment";
  if (id === "rental-refund") return "Booking refund";
  if (id === "lease-payment") return "Tenant payment";
  if (id === "lease-refund") return "Refund to tenant";
  if (id === "lease-deposit") return "Deposit received";
  if (id === "lease-deposit-refund") return "Deposit refunded";
  if (id === "supplier-payment") return "Supplier bill paid";
  if (id === "sale-goods") return "Sale";
  if (id === "sale-drinks") return "Sale (drinks)";
  if (id === "sale-other") return "Sale";
  if (id === "sale-production") return "Sale";
  if (id === "sale-farm") return "Sale (farm)";
  if (id === "membership-sale") return "Membership sold";
  if (id === "ticket-payment") return "Ticket payment";
  if (id === "ticket-refund") return "Ticket refund";
  if (id === "packaging-deposit") return "Deposit on bottles / crates received";
  if (id === "packaging-deposit-refund") return "Deposit on bottles / crates refunded";
  if (id === "packaging-deposit-paid") return "Deposit on crates paid to the supplier";
  if (id === "packaging-deposit-back") return "Deposit on crates refunded by the supplier";
  return id.replace(/^[a-z]+-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
