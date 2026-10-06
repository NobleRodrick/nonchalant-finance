/**
 * Office & property rental (e.g. Place Étoilée & Main Building): offices in several buildings,
 * tenants on contracts, monthly rent with price history, utilities and other charges (meter
 * readings or fixed), payments allocated to the months and charges they pay, deposits kept apart
 * from income, arrears, maintenance, inspections, move-out and reports
 * (docs/PROPERTY_RENTAL_PLAN.md). Pure module (safe for client components).
 */
export const PROPERTY_RENTAL = {
  key: "PROPERTY_RENTAL",
  label: "Office & property rental",
  description: "Offices in one or more buildings: tenants and contracts, monthly rent and price history, electricity, water and other charges, payments and receipts, deposits, arrears, maintenance, inspections and reports.",
  icon: "Building2",
  color: "indigo",
  codePrefix: "PRP",
  enabled: true,
  hasMenu: false,
  stockModel: "NONE",
  navigation: [
    { key: "home", label: "Dashboard", path: "", icon: "LayoutDashboard", roles: ["ADMIN", "HEAD"] },
    { key: "offices", label: "Offices", path: "/offices", icon: "Building2", roles: ["ADMIN", "HEAD"] },
    { key: "tenants", label: "Tenants", path: "/tenants", icon: "Users", roles: ["ADMIN", "HEAD"] },
    { key: "contracts", label: "Contracts", path: "/contracts", icon: "FileText", roles: ["ADMIN", "HEAD"] },
    { key: "arrears", label: "Arrears", path: "/arrears", icon: "CircleAlert", roles: ["ADMIN", "HEAD"] },
    { key: "billing", label: "Billing & meters", path: "/billing", icon: "Gauge", roles: ["ADMIN", "HEAD"] },
    { key: "money", label: "Money in / out", path: "/money", icon: "ArrowLeftRight", roles: ["ADMIN", "HEAD"] },
    { key: "maintenance", label: "Maintenance", path: "/maintenance", icon: "Wrench", roles: ["ADMIN", "HEAD"] },
    { key: "inspections", label: "Inspections", path: "/inspections", icon: "ClipboardList", roles: ["ADMIN", "HEAD"] },
    { key: "calendar", label: "Calendar", path: "/calendar", icon: "CalendarDays", roles: ["ADMIN", "HEAD"] },
    { key: "reports", label: "Reports", path: "/reports", icon: "BarChart3", roles: ["ADMIN", "HEAD"] },
    { key: "search", label: "Search", path: "/search", icon: "Search", roles: ["ADMIN", "HEAD"] },
    { key: "cash", label: "Cash to Boss", path: "/cash-handover", icon: "HandCoins", roles: ["HEAD"] },
    { key: "settings", label: "Business details", path: "/settings", icon: "SlidersHorizontal", roles: ["ADMIN", "HEAD"] },
  ],
  moneyInTypes: ["BOOKING_PAYMENT", "OTHER_INCOME"],
  moneyOutTypes: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"],
  words: { item: "Office", items: "Offices", unit: "month", units: "months", catalog: "Offices" },
};

/** Office categories offered (free text is accepted too). */
export const OFFICE_CATEGORIES = ["Single office", "Double office", "Open space", "Suite", "Shop / ground floor", "Meeting room", "Storage", "Other"];

/** Buildings proposed when the department is set up (the owner's two locations). */
export const DEFAULT_BUILDINGS = ["Main Building", "Place Étoilée"];
