/**
 * Event venue / banquet hall: bookings and calendar (one event per date), prices, packages,
 * clients and leads, payments and receipts, assets checked before and after every event, cash
 * to the Boss and reports (docs/VENUE_RENTAL_PLAN.md). Pure module (safe for client components).
 */
export const EVENT_VENUE = {
  key: "EVENT_VENUE",
  label: "Event venue / banquet hall",
  description: "Hall bookings and calendar, prices and packages, clients and leads, payments and receipts, assets checked before and after every event.",
  icon: "PartyPopper",
  color: "rose",
  codePrefix: "HALL",
  enabled: true,
  hasMenu: false,
  stockModel: "NONE",
  navigation: [
    { key: "home", label: "Dashboard", path: "", icon: "LayoutDashboard", roles: ["ADMIN", "HEAD"] },
    { key: "calendar", label: "Calendar", path: "/calendar", icon: "CalendarDays", roles: ["ADMIN", "HEAD"] },
    { key: "bookings", label: "Bookings", path: "/bookings", icon: "ClipboardList", roles: ["ADMIN", "HEAD"] },
    { key: "leads", label: "Leads", path: "/leads", icon: "Target", roles: ["ADMIN", "HEAD"] },
    { key: "packages", label: "Packages", path: "/packages", icon: "Package", roles: ["ADMIN", "HEAD"] },
    { key: "assets", label: "Assets", path: "/assets", icon: "Boxes", roles: ["ADMIN", "HEAD"] },
    { key: "money", label: "Money in / out", path: "/money", icon: "ArrowLeftRight", roles: ["ADMIN", "HEAD"] },
    { key: "reports", label: "Reports", path: "/reports", icon: "BarChart3", roles: ["ADMIN", "HEAD"] },
    { key: "cash", label: "Cash to Boss", path: "/cash-handover", icon: "HandCoins", roles: ["HEAD"] },
    { key: "venue-settings", label: "Hall & prices", path: "/hall", icon: "SlidersHorizontal", roles: ["ADMIN", "HEAD"] },
  ],
  moneyInTypes: ["BOOKING_PAYMENT", "OTHER_INCOME"],
  moneyOutTypes: ["BOOKING_REFUND", "EXPENSE", "OTHER_EXPENSE"],
  words: { item: "Booking", items: "Bookings", unit: "event", units: "events", catalog: "Bookings" },
};
