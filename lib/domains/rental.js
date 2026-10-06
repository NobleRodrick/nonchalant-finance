/**
 * Event & decoration rental (e.g. Deco Diva): items rented out for weddings, birthdays, church
 * services, conferences, funerals … and decoration services. Stock with a movement ledger,
 * bookings with availability control from dispatch to return, returns with damages and losses,
 * payments and documents, expenses, purchases, assets with depreciation, profit per event and
 * reports (docs/EVENT_RENTAL_PLAN.md). Pure module (safe for client components).
 */
export const MATERIAL_RENTAL = {
  key: "MATERIAL_RENTAL",
  label: "Event & decoration rental",
  description: "Chairs, tables, tableware, decorations and equipment rented out for events: stock, bookings without double-booking, dispatch and returns, damages, payments and documents, expenses, assets and profit per event.",
  icon: "Tent",
  color: "orange",
  codePrefix: "REN",
  enabled: true,
  hasMenu: false,
  stockModel: "NONE",
  navigation: [
    { key: "home", label: "Dashboard", path: "", icon: "LayoutDashboard", roles: ["ADMIN", "HEAD"] },
    { key: "calendar", label: "Calendar", path: "/calendar", icon: "CalendarDays", roles: ["ADMIN", "HEAD"] },
    { key: "bookings", label: "Bookings", path: "/bookings", icon: "ClipboardList", roles: ["ADMIN", "HEAD"] },
    { key: "customers", label: "Customers", path: "/customers", icon: "Users", roles: ["ADMIN", "HEAD"] },
    { key: "stock", label: "Stock", path: "/stock", icon: "Boxes", roles: ["ADMIN", "HEAD"] },
    { key: "damages", label: "Damages & repairs", path: "/damages", icon: "Wrench", roles: ["ADMIN", "HEAD"] },
    { key: "purchases", label: "Purchases", path: "/purchases", icon: "ShoppingCart", roles: ["ADMIN", "HEAD"] },
    { key: "money", label: "Money in / out", path: "/money", icon: "ArrowLeftRight", roles: ["ADMIN", "HEAD"] },
    { key: "reports", label: "Reports", path: "/reports", icon: "BarChart3", roles: ["ADMIN", "HEAD"] },
    { key: "search", label: "Search", path: "/search", icon: "Search", roles: ["ADMIN", "HEAD"] },
    { key: "assets", label: "Assets", path: "/assets", icon: "Landmark", roles: ["ADMIN", "HEAD"] },
    { key: "cash", label: "Cash to Boss", path: "/cash-handover", icon: "HandCoins", roles: ["HEAD"] },
    { key: "settings", label: "Business details", path: "/settings", icon: "SlidersHorizontal", roles: ["ADMIN", "HEAD"] },
  ],
  moneyInTypes: ["BOOKING_PAYMENT", "OTHER_INCOME"],
  moneyOutTypes: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"],
  words: { item: "Item", items: "Items", unit: "piece", units: "pieces", catalog: "Stock" },
};

/** Event types offered when booking (free text is accepted too). */
export const RENTAL_EVENT_TYPES = ["Wedding", "Birthday", "Church service", "Meeting / conference", "Corporate event", "Traditional ceremony", "Anniversary", "Party", "Funeral", "Other"];

/** Item categories offered on the stock sheet (free text is accepted too). */
export const RENTAL_ITEM_CATEGORIES = ["Chairs", "Tables", "Tableware", "Cutlery", "Glassware", "Flowers", "Vases & centrepieces", "Linen & tablecloths", "Curtains & drapes", "Lighting", "Stands & structures", "Backdrops", "Carpets", "Wedding decoration", "Church decoration", "Sound", "Other"];
