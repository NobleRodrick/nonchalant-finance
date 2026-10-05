/**
 * Restaurant: a menu of dishes (plates in stock), sales, money in and out, debts, cash to the
 * Boss and the daily report. Pure module (safe for client components).
 */
export const RESTAURANT = {
  key: "RESTAURANT",
  label: "Restaurant",
  description: "Menu of dishes, plates in stock, sales, money in and out, debts, cash to the Boss and the daily report.",
  icon: "UtensilsCrossed",
  color: "emerald",
  codePrefix: "RST",
  enabled: true,
  hasMenu: true,
  stockModel: "PLATES",
  navigation: [
    { key: "home", label: "Home", path: "", icon: "LayoutDashboard", roles: ["ADMIN", "HEAD"] },
    { key: "sell", label: "Sell", path: "/sell", icon: "ShoppingCart", roles: ["HEAD"] },
    { key: "menu-stock", label: "Menu & Stock", path: "/menu-stock", icon: "UtensilsCrossed", roles: ["ADMIN", "HEAD"] },
    { key: "money", label: "Money in / out", path: "/money", icon: "ArrowLeftRight", roles: ["ADMIN", "HEAD"] },
    { key: "debts", label: "Debts", path: "/debts", icon: "BookUser", roles: ["ADMIN", "HEAD"] },
    { key: "cash", label: "Cash to Boss", path: "/cash-handover", icon: "HandCoins", roles: ["HEAD"] },
    { key: "report", label: "Today's report", path: "/report", icon: "FileText", roles: ["ADMIN", "HEAD"] },
    { key: "history", label: "History", path: "/history", icon: "History", roles: ["ADMIN", "HEAD"] },
  ],
  moneyInTypes: ["SALE", "RENT_INCOME", "OTHER_INCOME"],
  moneyOutTypes: ["DISCOUNT", "PURCHASE", "EXPENSE", "OTHER_EXPENSE"],
  words: { item: "Dish", items: "Dishes", unit: "plate", units: "plates", catalog: "Menu & Stock" },
};
