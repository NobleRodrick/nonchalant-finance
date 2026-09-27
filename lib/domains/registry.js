/**
 * Department types ("business domains"). The type chosen by the Boss when he creates a
 * department decides which modules, money types, dashboard cards and report sections the
 * department gets. Only RESTAURANT is built; the others can be created and staffed and show
 * a "coming soon" workspace. Adding a domain = adding a definition here (+ its modules).
 * Pure module: safe for client components.
 */

const RESTAURANT_NAV = [
  { key: "home", label: "Home", path: "", icon: "LayoutDashboard", roles: ["ADMIN", "HEAD"] },
  { key: "sell", label: "Sell", path: "/sell", icon: "ShoppingCart", roles: ["HEAD"] },
  { key: "menu-stock", label: "Menu & Stock", path: "/menu-stock", icon: "UtensilsCrossed", roles: ["ADMIN", "HEAD"] },
  { key: "money", label: "Money in / out", path: "/money", icon: "ArrowLeftRight", roles: ["ADMIN", "HEAD"] },
  { key: "debts", label: "Debts", path: "/debts", icon: "BookUser", roles: ["ADMIN", "HEAD"] },
  { key: "cash", label: "Cash to Boss", path: "/cash-handover", icon: "HandCoins", roles: ["HEAD"] },
  { key: "report", label: "Today's report", path: "/report", icon: "FileText", roles: ["ADMIN", "HEAD"] },
  { key: "history", label: "History", path: "/history", icon: "History", roles: ["ADMIN", "HEAD"] },
];

const COMING_SOON_NAV = [
  { key: "home", label: "Home", path: "", icon: "LayoutDashboard", roles: ["ADMIN", "HEAD"] },
];

export const DOMAINS = {
  RESTAURANT: {
    key: "RESTAURANT",
    label: "Restaurant",
    description: "Menu of dishes, plates in stock, sales, money in and out, debts, cash to the Boss and the daily report.",
    icon: "UtensilsCrossed",
    color: "emerald",
    codePrefix: "RST",
    enabled: true,
    hasMenu: true,
    stockModel: "PLATES",
    navigation: RESTAURANT_NAV,
    moneyInTypes: ["SALE", "RENT_INCOME", "OTHER_INCOME"],
    moneyOutTypes: ["DISCOUNT", "PURCHASE", "EXPENSE", "OTHER_EXPENSE"],
    words: { item: "Dish", items: "Dishes", unit: "plate", units: "plates", catalog: "Menu & Stock" },
  },
  BAR: {
    key: "BAR",
    label: "Bar / snack bar",
    description: "Drinks and snacks by the bottle or unit, crates and empties, happy-hour prices.",
    icon: "Wine",
    color: "amber",
    codePrefix: "BAR",
  },
  PRESSING: {
    key: "PRESSING",
    label: "Pressing (dress wash)",
    description: "Garment tickets from drop-off to collection, washing and ironing services.",
    icon: "Shirt",
    color: "sky",
    codePrefix: "PRS",
  },
  CAR_WASH: {
    key: "CAR_WASH",
    label: "Car wash",
    description: "Vehicle queue, wash services per vehicle type, washer commissions.",
    icon: "Car",
    color: "cyan",
    codePrefix: "CWS",
  },
  ROOM_RENTAL: {
    key: "ROOM_RENTAL",
    label: "Room / hall rental",
    description: "Room and hall bookings, deposits, check-in and check-out.",
    icon: "BedDouble",
    color: "violet",
    codePrefix: "ROOM",
  },
  MATERIAL_RENTAL: {
    key: "MATERIAL_RENTAL",
    label: "Material rental",
    description: "Chairs, canopies and equipment rented out and returned, deposits and late fees.",
    icon: "Tent",
    color: "orange",
    codePrefix: "MAT",
  },
  SHOP: {
    key: "SHOP",
    label: "Shop",
    description: "Products sold by the unit, shop stock, suppliers.",
    icon: "Store",
    color: "pink",
    codePrefix: "SHOP",
  },
  OTHER: {
    key: "OTHER",
    label: "Other",
    description: "Any other activity: money in and out and a daily report.",
    icon: "Building2",
    color: "slate",
    codePrefix: "OTH",
  },
};

for (const d of Object.values(DOMAINS)) {
  if (!d.enabled) {
    Object.assign(d, {
      enabled: false,
      hasMenu: false,
      stockModel: "NONE",
      navigation: COMING_SOON_NAV,
      moneyInTypes: [],
      moneyOutTypes: [],
      words: { item: "Item", items: "Items", unit: "unit", units: "units", catalog: "Catalog" },
    });
  }
}

export const DOMAIN_LIST = Object.values(DOMAINS);
export const DEFAULT_DOMAIN = "RESTAURANT";

export function getDomain(key) {
  return DOMAINS[key] || DOMAINS.OTHER;
}

export function isDomainEnabled(key) {
  return Boolean(DOMAINS[key]?.enabled);
}

export function isRestaurant(key) {
  return key === "RESTAURANT";
}

/** Sidebar items of a department for a role. */
export function departmentNavigation(department, role) {
  const domain = getDomain(department.domain);
  return domain.navigation
    .filter((n) => n.roles.includes(role))
    .map((n) => ({ id: n.key, label: n.label, icon: n.icon, href: `/d/${department.id}${n.path}` }));
}

/** Whether a department (by domain) offers a module and the role may open it. */
export function hasModule(department, key, role) {
  const nav = getDomain(department.domain).navigation.find((n) => n.key === key);
  return Boolean(nav && (!role || nav.roles.includes(role)));
}
