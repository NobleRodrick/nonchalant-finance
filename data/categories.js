// Operational & Managerial Categories for Springer Finance
// Structured for Restaurants, Hospitality, and Commercial Department Management

export const defaultCategories = [
  // --- SALES (Revenue) Categories ---
  {
    id: "sale-food",
    name: "Food & Kitchen Sales",
    type: "SALE",
    color: "#16a34a", // emerald-600
    icon: "UtensilsCrossed",
    description: "Meals, dining, takeaway, kitchen orders",
  },
  {
    id: "sale-drinks",
    name: "Bar & Drinks Sales",
    type: "SALE",
    color: "#059669", // emerald-700
    icon: "Wine",
    description: "Beer, wine, spirits, soft drinks, juices",
  },
  {
    id: "sale-catering",
    name: "Events & Catering",
    type: "SALE",
    color: "#0d9488", // teal-600
    icon: "Sparkles",
    description: "Private events, banquets, catering contracts",
  },
  {
    id: "sale-other",
    name: "Other Sales & Service",
    type: "SALE",
    color: "#10b981", // emerald-500
    icon: "Receipt",
    description: "Delivery fees, table service, other direct sales",
  },

  // --- PURCHASES (Cost of Goods Sold / Raw Food & Drink Materials) ---
  {
    id: "purchase-meat",
    name: "Meat & Poultry",
    type: "PURCHASE",
    color: "#e11d48", // rose-600
    icon: "Beef",
    subcategories: ["Beef", "Chicken", "Pork", "Goat", "Sausages"],
  },
  {
    id: "purchase-fish",
    name: "Fish & Seafood",
    type: "PURCHASE",
    color: "#0284c7", // sky-600
    icon: "Fish",
    subcategories: ["Fresh Fish", "Smoked Fish", "Prawns", "Crabs"],
  },
  {
    id: "purchase-vegetables",
    name: "Vegetables & Fresh Produce",
    type: "PURCHASE",
    color: "#65a30d", // lime-600
    icon: "Carrot",
    subcategories: ["Tomatoes", "Onions", "Leafy Greens", "Potatoes", "Plantains"],
  },
  {
    id: "purchase-rice-grains",
    name: "Rice, Flour & Grains",
    type: "PURCHASE",
    color: "#d97706", // amber-600
    icon: "Wheat",
    subcategories: ["Rice", "Flour", "Pasta", "Semolina", "Couscous"],
  },
  {
    id: "purchase-oil-spices",
    name: "Cooking Oil, Condiments & Spices",
    type: "PURCHASE",
    color: "#f59e0b", // amber-500
    icon: "Flame",
    subcategories: ["Vegetable Oil", "Palm Oil", "Spices", "Maggi/Seasonings", "Salt"],
  },
  {
    id: "purchase-drinks-stock",
    name: "Drinks & Beverage Stock",
    type: "PURCHASE",
    color: "#7c3aed", // violet-600
    icon: "Beer",
    subcategories: ["Crates of Beer", "Liquor & Spirits", "Sodas/Soft Drinks", "Mineral Water", "Juices"],
  },
  {
    id: "purchase-other-materials",
    name: "Other Food Materials & Packaging",
    type: "PURCHASE",
    color: "#ea580c", // orange-600
    icon: "ShoppingBag",
    subcategories: ["Takeaway Containers", "Foil & Wraps", "Napkins", "Straws", "Dairy & Eggs"],
  },

  // --- OPERATING EXPENSES (Overheads & Running Costs) ---
  {
    id: "opex-transport",
    name: "Transportation & Logistics",
    type: "EXPENSE",
    color: "#f97316", // orange-500
    icon: "Car",
    subcategories: ["Fuel", "Market Taxi", "Dispatch/Delivery", "Vehicle Maintenance"],
  },
  {
    id: "opex-electricity",
    name: "Electricity & Generator Fuel",
    type: "EXPENSE",
    color: "#0284c7", // sky-600
    icon: "Zap",
    subcategories: ["ENEO / Power Bills", "Generator Diesel", "Generator Maintenance"],
  },
  {
    id: "opex-water-gas",
    name: "Water & Cooking Gas",
    type: "EXPENSE",
    color: "#06b6d4", // cyan-500
    icon: "Droplets",
    subcategories: ["Water Bills", "Gas Bottle Refills"],
  },
  {
    id: "opex-repairs",
    name: "Repairs & Maintenance",
    type: "EXPENSE",
    color: "#dc2626", // red-600
    icon: "Wrench",
    subcategories: ["Kitchen Equipment", "Refrigeration", "Plumbing", "Electrical"],
  },
  {
    id: "opex-cleaning",
    name: "Cleaning & Hygiene Materials",
    type: "EXPENSE",
    color: "#14b8a6", // teal-500
    icon: "Sparkle",
    subcategories: ["Dishwashing Soap", "Bleach & Disinfectants", "Mops & Brooms", "Trash Bags"],
  },
  {
    id: "opex-wages",
    name: "Daily / Casual Staff Wages",
    type: "EXPENSE",
    color: "#4f46e5", // indigo-600
    icon: "Users",
    subcategories: ["Shift Allowances", "Casual Dishwashers", "Security Shift"],
  },
  {
    id: "opex-other",
    name: "Other Operating Expenses",
    type: "EXPENSE",
    color: "#64748b", // slate-500
    icon: "MoreHorizontal",
    subcategories: ["Licenses/Permits", "Administrative Fees", "Communication/Airtime", "Incidentals"],
  },

  // --- DISCOUNTS ---
  {
    id: "discount-customer",
    name: "Customer Courtesy Discounts",
    type: "DISCOUNT",
    color: "#f43f5e", // rose-500
    icon: "Tag",
    description: "Rounding off bills, customer goodwill reductions",
  },
  {
    id: "discount-promo",
    name: "Promotional & Happy Hour Discounts",
    type: "DISCOUNT",
    color: "#ec4899", // pink-500
    icon: "BadgePercent",
    description: "Marketing campaigns, event promotions, coupons",
  },
  {
    id: "discount-other",
    name: "Staff / VIP Discounts",
    type: "DISCOUNT",
    color: "#a855f7", // purple-500
    icon: "Award",
    description: "Staff meal discount, management/VIP concessions",
  },

  // --- General / Legacy Categories (for backwards compatibility) ---
  {
    id: "salary",
    name: "Salary",
    type: "INCOME",
    color: "#22c55e",
    icon: "Wallet",
  },
  {
    id: "freelance",
    name: "Freelance",
    type: "INCOME",
    color: "#06b6d4",
    icon: "Laptop",
  },
  {
    id: "investments",
    name: "Investments",
    type: "INCOME",
    color: "#6366f1",
    icon: "TrendingUp",
  },
  {
    id: "business",
    name: "Business Revenue",
    type: "INCOME",
    color: "#ec4899",
    icon: "Building",
  },
  {
    id: "other-income",
    name: "Other Income",
    type: "INCOME",
    color: "#64748b",
    icon: "Plus",
  },
  {
    id: "housing",
    name: "Rent & Housing",
    type: "EXPENSE",
    color: "#ef4444",
    icon: "Home",
  },
  {
    id: "transportation",
    name: "Transportation",
    type: "EXPENSE",
    color: "#f97316",
    icon: "Car",
  },
  {
    id: "utilities",
    name: "Utilities",
    type: "EXPENSE",
    color: "#06b6d4",
    icon: "Zap",
  },
  {
    id: "food",
    name: "Food",
    type: "EXPENSE",
    color: "#f43f5e",
    icon: "UtensilsCrossed",
  },
  {
    id: "other-expense",
    name: "Other Expenses",
    type: "EXPENSE",
    color: "#94a3b8",
    icon: "MoreHorizontal",
  },
];

export const categoryColors = defaultCategories.reduce((acc, category) => {
  acc[category.id] = category.color;
  return acc;
}, {});
