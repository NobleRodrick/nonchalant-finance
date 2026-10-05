/**
 * Rooms / guest house (e.g. Executive Stay): rooms and their rates, stays (no two stays of a room
 * overlap), the occupancy calendar, check-in and check-out. Rooms given free with an event
 * venue package are stays of this department. Pure module (safe for client components).
 */
export const ROOM_RENTAL = {
  key: "ROOM_RENTAL",
  label: "Rooms / guest house",
  description: "Apartments or rooms with their state and rates, bookings, check-in and check-out, payments and receipts, expenses per apartment, assets, maintenance and reports.",
  icon: "BedDouble",
  color: "violet",
  codePrefix: "ROOM",
  enabled: true,
  hasMenu: false,
  stockModel: "NONE",
  navigation: [
    { key: "home", label: "Dashboard", path: "", icon: "LayoutDashboard", roles: ["ADMIN", "HEAD"] },
    { key: "rooms", label: "Apartments", path: "/rooms", icon: "BedDouble", roles: ["ADMIN", "HEAD"] },
    { key: "occupancy", label: "Calendar", path: "/occupancy", icon: "CalendarDays", roles: ["ADMIN", "HEAD"] },
    { key: "stays", label: "Bookings", path: "/stays", icon: "ClipboardList", roles: ["ADMIN", "HEAD"] },
    { key: "money", label: "Money in / out", path: "/money", icon: "ArrowLeftRight", roles: ["ADMIN", "HEAD"] },
    { key: "assets", label: "Assets", path: "/assets", icon: "Boxes", roles: ["ADMIN", "HEAD"] },
    { key: "maintenance", label: "Maintenance", path: "/maintenance", icon: "Wrench", roles: ["ADMIN", "HEAD"] },
    { key: "reports", label: "Reports", path: "/reports", icon: "BarChart3", roles: ["ADMIN", "HEAD"] },
    { key: "cash", label: "Cash to Boss", path: "/cash-handover", icon: "HandCoins", roles: ["HEAD"] },
  ],
  moneyInTypes: ["BOOKING_PAYMENT", "OTHER_INCOME"],
  moneyOutTypes: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"],
  words: { item: "Apartment", items: "Apartments", unit: "night", units: "nights", catalog: "Apartments" },
};
