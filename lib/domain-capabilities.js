export const DepartmentDomain = {
  RESTAURANT: "RESTAURANT",
  BAR: "BAR",
  PRESSING: "PRESSING",
  CAR_WASH: "CAR_WASH",
  ROOM_RENTAL: "ROOM_RENTAL",
  MATERIAL_RENTAL: "MATERIAL_RENTAL",
  SHOP: "SHOP",
  OTHER: "OTHER",
};

export const DOMAIN_CONFIGS = {
  RESTAURANT: {
    key: "RESTAURANT",
    label: "Restaurant & Catering",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    description: "Food menu, direct plate stock, recipes, itemized food sales, debts, kitchen closing",
    isActive: true,
    modules: [
      { key: "dashboard", label: "Dashboard", href: "/dashboard" },
      { key: "restaurant", label: "Restaurant Workspace", href: "/restaurant" },
      { key: "menu", label: "Menu & Dishes", href: "/menu" },
      { key: "stock", label: "Stock Control", href: "/stock" },
      { key: "debts", label: "Debts & Receivables", href: "/debts" },
      { key: "cash-handover", label: "Cash Handover", href: "/cash-handover" },
      { key: "daily-close", label: "Daily Close", href: "/daily-close" },
      { key: "reports", label: "Reports & Analytics", href: "/reports" },
    ],
    stockModel: "MIXED_PLATE_AND_RECIPE",
    currency: "FCFA",
  },
  BAR: {
    key: "BAR",
    label: "Bar & Lounge",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
    description: "Beverage stock, crates/bottles, beverage sales (Phase 2)",
    isActive: false,
    modules: [],
  },
  PRESSING: {
    key: "PRESSING",
    label: "Pressing & Dry Cleaning",
    badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
    description: "Garment intake, washing, ironing, pickup tickets (Phase 2)",
    isActive: false,
    modules: [],
  },
  CAR_WASH: {
    key: "CAR_WASH",
    label: "Car Wash",
    badgeColor: "bg-cyan-100 text-cyan-800 border-cyan-200",
    description: "Vehicle queue, wash tickets, consumables (Phase 2)",
    isActive: false,
    modules: [],
  },
  ROOM_RENTAL: {
    key: "ROOM_RENTAL",
    label: "Room & Hall Rental",
    badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
    description: "Room booking, event hall rental, rent receipts (Phase 2)",
    isActive: false,
    modules: [],
  },
  MATERIAL_RENTAL: {
    key: "MATERIAL_RENTAL",
    label: "Material Rental",
    badgeColor: "bg-orange-100 text-orange-800 border-orange-200",
    description: "Chairs, canopies, sound systems, deposits (Phase 2)",
    isActive: false,
    modules: [],
  },
  SHOP: {
    key: "SHOP",
    label: "Retail Shop",
    badgeColor: "bg-pink-100 text-pink-800 border-pink-200",
    description: "Point of sale goods, retail inventory (Phase 2)",
    isActive: false,
    modules: [],
  },
  OTHER: {
    key: "OTHER",
    label: "General Commercial Unit",
    badgeColor: "bg-slate-100 text-slate-800 border-slate-200",
    description: "General cashflow and operational unit",
    isActive: false,
    modules: [],
  },
};

export function getDomainConfig(domain) {
  return DOMAIN_CONFIGS[domain] || DOMAIN_CONFIGS.RESTAURANT;
}

export function isRestaurantDomain(domain) {
  return !domain || domain === DepartmentDomain.RESTAURANT;
}

export const ALL_DOMAINS = Object.values(DOMAIN_CONFIGS);
