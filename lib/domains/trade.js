/**
 * Department types built on the sales & stock engine (lib/trade) and the job tickets engine
 * (lib/services): shop, bar, pressing, car wash, other (docs/TRADE_AND_SERVICES_PLAN.md).
 * Each type keeps its own words and sections. Pure module (safe for client components).
 */
const N = (key, label, path, icon, roles = ["ADMIN", "HEAD"]) => ({ key, label, path, icon, roles });

const COMMON_TAIL = [
  N("money", "Money in / out", "/money", "ArrowLeftRight"),
  N("reports", "Reports", "/reports", "BarChart3"),
  N("search", "Search", "/search", "Search"),
  N("cash", "Cash to Boss", "/cash-handover", "HandCoins", ["HEAD"]),
  N("settings", "Business details", "/settings", "SlidersHorizontal"),
];

export const SHOP = {
  key: "SHOP",
  label: "Shop",
  description: "Products sold by the unit or by weight: sales by search or barcode, stock at average cost, purchases and suppliers, customers on credit, reports and margins.",
  icon: "Store",
  color: "pink",
  codePrefix: "SHOP",
  enabled: true,
  engine: "TRADE",
  hasMenu: false,
  stockModel: "NONE",
  navigation: [
    N("home", "Dashboard", "", "LayoutDashboard"),
    N("sell", "Sell", "/sell", "ShoppingCart", ["HEAD"]),
    N("products", "Products", "/products", "Package"),
    N("stock", "Stock", "/stock", "Boxes"),
    N("purchases", "Purchases & suppliers", "/purchases", "Truck"),
    N("debts", "Customers on credit", "/debts", "BookUser"),
    ...COMMON_TAIL,
  ],
  moneyInTypes: ["SALE", "OTHER_INCOME"],
  moneyOutTypes: ["EXPENSE", "OTHER_EXPENSE"],
  saleCategory: "sale-goods",
  purchaseCategory: "purchase-goods",
  words: { item: "Product", items: "Products", unit: "piece", units: "pieces", catalog: "Products" },
};

export const BAR = {
  key: "BAR",
  label: "Bar / snack bar",
  description: "Drinks and snacks by the bottle or unit: open tabs per table, crates and empty bottles with their deposits, breakages, purchases from the brewery, stock and margins.",
  icon: "Wine",
  color: "amber",
  codePrefix: "BAR",
  enabled: true,
  engine: "TRADE",
  hasMenu: false,
  stockModel: "NONE",
  tabs: true,
  packaging: true,
  navigation: [
    N("home", "Dashboard", "", "LayoutDashboard"),
    N("sell", "Sell & tabs", "/sell", "Beer", ["HEAD"]),
    N("products", "Drinks & snacks", "/products", "Wine"),
    N("stock", "Stock", "/stock", "Boxes"),
    N("crates", "Crates & empties", "/crates", "Package"),
    N("purchases", "Purchases & suppliers", "/purchases", "Truck"),
    N("debts", "Customers on credit", "/debts", "BookUser"),
    ...COMMON_TAIL,
  ],
  moneyInTypes: ["SALE", "OTHER_INCOME"],
  moneyOutTypes: ["EXPENSE", "OTHER_EXPENSE"],
  saleCategory: "sale-drinks",
  purchaseCategory: "purchase-drinks",
  words: { item: "Drink", items: "Drinks", unit: "bottle", units: "bottles", catalog: "Drinks & snacks" },
};

export const PRESSING = {
  key: "PRESSING",
  label: "Pressing (dress wash)",
  description: "Garments from drop-off to collection: tickets with tag numbers, price list per garment and service, express, payments at drop-off or collection, ready messages, unclaimed items, damage claims.",
  icon: "Shirt",
  color: "sky",
  codePrefix: "PRS",
  enabled: true,
  engine: "SERVICES",
  hasMenu: false,
  stockModel: "NONE",
  navigation: [
    N("home", "Dashboard", "", "LayoutDashboard"),
    N("tickets", "Tickets", "/tickets", "ClipboardList"),
    N("prices", "Price list", "/prices", "Tags"),
    N("customers", "Customers", "/customers", "Users"),
    ...COMMON_TAIL,
  ],
  moneyInTypes: ["BOOKING_PAYMENT", "OTHER_INCOME"],
  moneyOutTypes: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"],
  variantsLabel: "Garment",
  defaultVariants: ["Shirt", "Trousers", "Suit (2 pieces)", "Dress", "Traditional outfit", "Jacket", "Bed sheet", "Blanket / duvet", "Curtain", "Other"],
  words: { item: "Garment", items: "Garments", unit: "item", units: "items", catalog: "Price list", ticket: "Ticket", tickets: "Tickets" },
};

export const CAR_WASH = {
  key: "CAR_WASH",
  label: "Car wash",
  description: "Vehicles from arrival to departure: the queue, services priced by vehicle type, washers and their commissions, payments, loyalty (every Nth wash free), reports per washer and per service.",
  icon: "Car",
  color: "cyan",
  codePrefix: "CWS",
  enabled: true,
  engine: "SERVICES",
  hasMenu: false,
  stockModel: "NONE",
  workers: true,
  navigation: [
    N("home", "Queue & dashboard", "", "LayoutDashboard"),
    N("tickets", "Washes", "/tickets", "ClipboardList"),
    N("prices", "Services & prices", "/prices", "Tags"),
    N("workers", "Washers", "/workers", "Users"),
    N("customers", "Customers & vehicles", "/customers", "Car"),
    ...COMMON_TAIL,
  ],
  moneyInTypes: ["BOOKING_PAYMENT", "OTHER_INCOME"],
  moneyOutTypes: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"],
  variantsLabel: "Vehicle",
  defaultVariants: ["Car (saloon)", "4x4 / SUV", "Minibus / van", "Truck", "Motorbike"],
  words: { item: "Service", items: "Services", unit: "wash", units: "washes", catalog: "Services & prices", ticket: "Wash", tickets: "Washes", worker: "Washer", workers: "Washers" },
};

export const OTHER = {
  key: "OTHER",
  label: "Other activity",
  description: "Any other activity (print shop, repairs, tailoring, consulting …): a catalogue of products and services, quick sales, job tickets when work takes time, purchases, money in and out, customers on credit, reports.",
  icon: "Building2",
  color: "slate",
  codePrefix: "OTH",
  enabled: true,
  engine: "BOTH",
  hasMenu: false,
  stockModel: "NONE",
  navigation: [
    N("home", "Dashboard", "", "LayoutDashboard"),
    N("sell", "Sell", "/sell", "ShoppingCart", ["HEAD"]),
    N("products", "Products & services", "/products", "Package"),
    N("tickets", "Jobs", "/tickets", "ClipboardList"),
    N("prices", "Job price list", "/prices", "Tags"),
    N("stock", "Stock", "/stock", "Boxes"),
    N("purchases", "Purchases & suppliers", "/purchases", "Truck"),
    N("debts", "Customers on credit", "/debts", "BookUser"),
    N("customers", "Customers", "/customers", "Users"),
    ...COMMON_TAIL,
  ],
  moneyInTypes: ["SALE", "BOOKING_PAYMENT", "OTHER_INCOME"],
  moneyOutTypes: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"],
  saleCategory: "sale-other",
  purchaseCategory: "purchase-goods",
  variantsLabel: "Option",
  defaultVariants: [],
  words: { item: "Item", items: "Items", unit: "unit", units: "units", catalog: "Products & services", ticket: "Job", tickets: "Jobs" },
};

export const PRODUCTION = {
  key: "PRODUCTION",
  label: "Production (bakery, workshop)",
  description: "Make and sell your own products — bakery, juice, soap, tailoring, crafts: raw materials, recipes, production batches at their real cost, waste, sales and margins.",
  icon: "Factory",
  color: "orange",
  codePrefix: "PRD",
  enabled: true,
  engine: "TRADE",
  production: true,
  hasMenu: false,
  stockModel: "NONE",
  navigation: [
    N("home", "Dashboard", "", "LayoutDashboard"),
    N("sell", "Sell", "/sell", "ShoppingCart", ["HEAD"]),
    N("production", "Production", "/production", "Factory"),
    N("recipes", "Recipes", "/recipes", "BookOpen"),
    N("products", "Products & materials", "/products", "Package"),
    N("stock", "Stock", "/stock", "Boxes"),
    N("purchases", "Purchases & suppliers", "/purchases", "Truck"),
    N("debts", "Customers on credit", "/debts", "BookUser"),
    ...COMMON_TAIL,
  ],
  moneyInTypes: ["SALE", "OTHER_INCOME"],
  moneyOutTypes: ["EXPENSE", "OTHER_EXPENSE"],
  saleCategory: "sale-production",
  purchaseCategory: "purchase-raw",
  words: { item: "Product", items: "Products", unit: "piece", units: "pieces", catalog: "Products & materials" },
};

export const FARM = {
  key: "FARM",
  label: "Farm (livestock, crops, fish)",
  description: "Poultry and livestock bands, crop fields and fish ponds: deaths, feed and treatments from stock, eggs and harvests, sales, and the profit of each batch.",
  icon: "Sprout",
  color: "lime",
  codePrefix: "FRM",
  enabled: true,
  engine: "TRADE",
  farm: true,
  hasMenu: false,
  stockModel: "NONE",
  navigation: [
    N("home", "Dashboard", "", "LayoutDashboard"),
    N("batches", "Batches & fields", "/batches", "Sprout"),
    N("sell", "Sell", "/sell", "ShoppingCart", ["HEAD"]),
    N("products", "Inputs & produce", "/products", "Package"),
    N("stock", "Stock", "/stock", "Boxes"),
    N("purchases", "Purchases & suppliers", "/purchases", "Truck"),
    N("debts", "Customers on credit", "/debts", "BookUser"),
    ...COMMON_TAIL,
  ],
  moneyInTypes: ["SALE", "OTHER_INCOME"],
  moneyOutTypes: ["EXPENSE", "OTHER_EXPENSE"],
  saleCategory: "sale-farm",
  purchaseCategory: "purchase-farm-inputs",
  words: { item: "Product", items: "Products", unit: "unit", units: "units", catalog: "Inputs & produce" },
};

export const SALON = {
  key: "SALON",
  label: "Salon, spa or gym",
  description: "Hair and beauty salons, spas, barbers, gyms: appointments per staff member, visits from the price list, memberships and session packs with check-ins, expiry and renewal reminders.",
  icon: "Scissors",
  color: "fuchsia",
  codePrefix: "SLN",
  enabled: true,
  engine: "SERVICES",
  appointments: true,
  memberships: true,
  workers: true,
  hasMenu: false,
  stockModel: "NONE",
  navigation: [
    N("home", "Dashboard", "", "LayoutDashboard"),
    N("appointments", "Appointments", "/appointments", "CalendarClock"),
    N("tickets", "Visits", "/tickets", "ClipboardList"),
    N("memberships", "Memberships", "/memberships", "IdCard"),
    N("prices", "Price list", "/prices", "Tags"),
    N("workers", "Staff", "/workers", "Users"),
    N("customers", "Customers", "/customers", "Contact"),
    ...COMMON_TAIL,
  ],
  moneyInTypes: ["SALE", "BOOKING_PAYMENT", "OTHER_INCOME"],
  moneyOutTypes: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"],
  saleCategory: "membership-sale",
  variantsLabel: "Option",
  defaultVariants: [],
  words: { item: "Service", items: "Services", unit: "service", units: "services", catalog: "Price list", ticket: "Visit", tickets: "Visits", worker: "Staff member", workers: "Staff" },
};

/** Units offered for products (free text accepted). */
export const PRODUCT_UNITS = ["piece", "bottle", "can", "packet", "carton", "kg", "g", "litre", "metre", "dozen", "bag", "tray", "loaf", "head", "plate", "service"];

/** Product categories offered by type (free text accepted). */
export const PRODUCT_CATEGORIES = {
  SHOP: ["Food & groceries", "Drinks", "Household", "Hygiene & beauty", "Stationery", "Electronics", "Clothing", "Hardware", "Phone credit", "Other"],
  BAR: ["Beer", "Soft drinks", "Water", "Wine & spirits", "Snacks", "Grills", "Cigarettes", "Other"],
  OTHER: ["Products", "Services", "Other"],
  PRODUCTION: ["Finished products", "Raw materials", "Packaging", "Other"],
  FARM: ["Feed", "Vaccines & medicine", "Seeds & fertiliser", "Eggs", "Live animals", "Meat", "Harvest", "Fish", "Other"],
};

/** Types that sell from a catalogue / work on job tickets. */
export const TRADE_DOMAINS = ["SHOP", "BAR", "OTHER", "PRODUCTION", "FARM"];
export const SERVICE_DOMAINS = ["PRESSING", "CAR_WASH", "OTHER", "SALON"];
