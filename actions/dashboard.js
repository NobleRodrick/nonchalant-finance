"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const serializeDecimal = (obj) => {
  if (!obj) return obj;
  const serialized = { ...obj };
  if (obj.balance !== undefined && obj.balance !== null) {
    serialized.balance = Number(obj.balance);
  }
  if (obj.amount !== undefined && obj.amount !== null) {
    serialized.amount = Number(obj.amount);
  }
  if (obj.grossAmount !== undefined && obj.grossAmount !== null) {
    serialized.grossAmount = Number(obj.grossAmount);
  }
  if (obj.discountAmount !== undefined && obj.discountAmount !== null) {
    serialized.discountAmount = Number(obj.discountAmount);
  }
  if (obj.netAmount !== undefined && obj.netAmount !== null) {
    serialized.netAmount = Number(obj.netAmount);
  }
  return serialized;
};

export async function getDashboardData(selectedDepartmentId = null) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!user.organizationId) throw new Error("User has no associated organization");

  if (user.role !== "ADMIN" && !user.departmentId && (!user.memberships || user.memberships.length === 0)) {
    throw new Error("Your account is not assigned to a department. Contact your manager.");
  }

  let effectiveDeptId = selectedDepartmentId || user.activeDepartmentId || user.departmentId;
  if (user.role !== "ADMIN") {
    effectiveDeptId = user.activeDepartmentId || user.departmentId || user.memberships?.[0]?.departmentId;
  }

  const whereClause = {
    organizationId: user.organizationId,
  };

  if (effectiveDeptId && effectiveDeptId !== "all") {
    whereClause.departmentId = effectiveDeptId;
  }

  // Get all matching transactions
  const transactions = await db.transaction.findMany({
    where: whereClause,
    include: {
      department: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { date: "desc" },
  });

  return transactions.map((t) => ({
    ...serializeDecimal(t),
    amount: Number(t.amount),
  }));
}

export async function getUserAccounts() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const deptId = user.activeDepartmentId || user.departmentId;

  try {
    const accounts = await db.account.findMany({
      where: {
        organizationId: user.organizationId,
        ...(user.role !== "ADMIN" && deptId
          ? { OR: [{ departmentId: deptId }, { departmentId: null }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        department: true,
        _count: {
          select: { transactions: true },
        },
      },
    });

    return accounts.map(serializeDecimal);
  } catch (error) {
    console.error("Error fetching accounts:", error.message);
    return [];
  }
}

export async function createAccount(data) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const balanceFloat = parseFloat(data.balance);
    if (isNaN(balanceFloat)) {
      throw new Error("Invalid balance amount");
    }

    const existingAccounts = await db.account.findMany({
      where: { organizationId: user.organizationId },
    });

    const shouldBeDefault = existingAccounts.length === 0 ? true : data.isDefault;

    if (shouldBeDefault) {
      await db.account.updateMany({
        where: { organizationId: user.organizationId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await db.account.create({
      data: {
        name: data.name,
        type: data.type,
        balance: balanceFloat,
        organizationId: user.organizationId,
        departmentId: data.departmentId || user.departmentId || null,
        userId: user.id,
        isDefault: shouldBeDefault,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, data: serializeDecimal(account) };
  } catch (error) {
    throw new Error(error.message);
  }
}

// Calculate the Industry Overview KPIs (Sales, Purchases, Expenses, Discounts, Stock, Cash, Debts, Profit)
export async function getOperationsKpis(departmentId = "all", startDate = null, endDate = null) {
  const user = await getCurrentUser();
  if (!user || !user.organizationId) return null;

  let effectiveDeptId = departmentId;
  if (user.role !== "ADMIN" && user.departmentId) {
    effectiveDeptId = user.departmentId;
  }

  const whereClause = {
    organizationId: user.organizationId,
  };

  if (effectiveDeptId && effectiveDeptId !== "all") {
    whereClause.departmentId = effectiveDeptId;
  }

  if (startDate || endDate) {
    whereClause.date = {};
    if (startDate) whereClause.date.gte = new Date(startDate);
    if (endDate) whereClause.date.lte = new Date(endDate);
  }

  const [transactions, stockRecords] = await Promise.all([
    db.transaction.findMany({
      where: whereClause,
      include: { department: true },
      orderBy: { date: "desc" },
    }),
    db.dailyStockRecord.findMany({
      where: {
        organizationId: user.organizationId,
        ...(effectiveDeptId && effectiveDeptId !== "all" ? { departmentId: effectiveDeptId } : {}),
        ...(startDate || endDate
          ? {
              date: {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(endDate) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "desc" },
    }),
  ]);

  let totalGrossSales = 0;
  let totalDiscounts = 0;
  let totalNetSales = 0;
  let cashSales = 0;
  let creditSales = 0;
  let otherIncome = 0;
  let totalPurchases = 0;
  let totalExpenses = 0;
  let outstandingDebts = 0;

  transactions.forEach((tx) => {
    const amt = Number(tx.amount || 0);
    const gross = Number(tx.grossAmount || tx.amount || 0);
    const disc = Number(tx.discountAmount || 0);
    const net = Number(tx.netAmount || tx.amount || 0);

    if (tx.type === "SALE") {
      totalGrossSales += gross;
      totalDiscounts += disc;
      totalNetSales += net;

      if (tx.paymentMethod === "CREDIT") {
        creditSales += net;
        if (!tx.isDebtPaid) {
          outstandingDebts += net;
        }
      } else {
        cashSales += net;
      }
    } else if (tx.type === "INCOME") {
      // Legacy income or other income
      totalGrossSales += amt;
      totalNetSales += amt;
      cashSales += amt;
      otherIncome += amt;
    } else if (tx.type === "PURCHASE") {
      totalPurchases += amt;
    } else if (tx.type === "EXPENSE") {
      // If categorized under purchase categories in legacy data
      if (tx.category && tx.category.startsWith("purchase-")) {
        totalPurchases += amt;
      } else {
        totalExpenses += amt;
      }
    } else if (tx.type === "DISCOUNT") {
      totalDiscounts += amt;
    }
  });

  // Stock values
  let stockUsed = 0;
  let stockDamaged = 0;
  let latestClosingStock = 0;

  stockRecords.forEach((s) => {
    stockUsed += Number(s.stockUsed || 0);
    stockDamaged += Number(s.damagedStock || 0);
  });

  if (stockRecords.length > 0) {
    latestClosingStock = Number(stockRecords[0].closingStock || 0);
  }

  // Cost of Goods Sold: use recorded stock usage if entered; otherwise total purchases
  const cogs = stockUsed > 0 ? stockUsed : totalPurchases;
  const estimatedProfit = totalNetSales - cogs - totalExpenses;
  const profitMargin = totalNetSales > 0 ? ((estimatedProfit / totalNetSales) * 100).toFixed(1) : 0;

  // Cash to be Handed Over:
  // Actual cash that entered drawer minus cash that left drawer
  const cashToHandOver = Math.max(0, cashSales + otherIncome - totalPurchases - totalExpenses);

  return {
    totalGrossSales,
    totalDiscounts,
    totalNetSales,
    cashSales,
    creditSales,
    otherIncome,
    totalPurchases,
    totalExpenses,
    stockUsed,
    stockDamaged,
    latestClosingStock,
    cashToHandOver,
    outstandingDebts,
    estimatedProfit,
    profitMargin,
    transactionCount: transactions.length,
  };
}

export async function getExecutiveKpis() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !user.organizationId) {
    return null;
  }

  const [transactions, departments, stockRecords] = await Promise.all([
    db.transaction.findMany({
      where: { organizationId: user.organizationId },
      include: { department: true },
      orderBy: { date: "desc" },
    }),
    db.department.findMany({
      where: { organizationId: user.organizationId },
    }),
    db.dailyStockRecord.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { date: "desc" },
    }),
  ]);

  let totalSales = 0;
  let totalDiscounts = 0;
  let totalPurchases = 0;
  let totalExpenses = 0;
  let outstandingDebts = 0;
  let cashSales = 0;

  const deptBreakdown = {};

  departments.forEach((dept) => {
    deptBreakdown[dept.id] = {
      id: dept.id,
      name: dept.name,
      sales: 0,
      discounts: 0,
      purchases: 0,
      expenses: 0,
      netProfit: 0,
      cashToHandOver: 0,
      debts: 0,
      transactionCount: 0,
    };
  });

  deptBreakdown["other"] = {
    id: "other",
    name: "General / Other",
    sales: 0,
    discounts: 0,
    purchases: 0,
    expenses: 0,
    netProfit: 0,
    cashToHandOver: 0,
    debts: 0,
    transactionCount: 0,
  };

  transactions.forEach((tx) => {
    const amt = Number(tx.amount || 0);
    const gross = Number(tx.grossAmount || tx.amount || 0);
    const disc = Number(tx.discountAmount || 0);
    const net = Number(tx.netAmount || tx.amount || 0);
    const deptKey = tx.departmentId && deptBreakdown[tx.departmentId] ? tx.departmentId : "other";

    if (tx.type === "SALE" || tx.type === "INCOME") {
      totalSales += gross;
      totalDiscounts += disc;
      deptBreakdown[deptKey].sales += net;
      if (tx.paymentMethod === "CREDIT") {
        if (!tx.isDebtPaid) {
          outstandingDebts += net;
          deptBreakdown[deptKey].debts += net;
        }
      } else {
        cashSales += net;
      }
    } else if (tx.type === "PURCHASE" || (tx.category && tx.category.startsWith("purchase-"))) {
      totalPurchases += amt;
      deptBreakdown[deptKey].purchases += amt;
    } else {
      totalExpenses += amt;
      deptBreakdown[deptKey].expenses += amt;
    }

    deptBreakdown[deptKey].transactionCount += 1;
  });

  Object.values(deptBreakdown).forEach((d) => {
    d.netProfit = d.sales - d.purchases - d.expenses;
    d.cashToHandOver = Math.max(0, d.sales - d.purchases - d.expenses);
  });

  const netSales = totalSales - totalDiscounts;
  const netProfit = netSales - totalPurchases - totalExpenses;
  const profitMargin = netSales > 0 ? ((netProfit / netSales) * 100).toFixed(1) : 0;
  const cashToHandOver = Math.max(0, cashSales - totalPurchases - totalExpenses);

  return {
    totalSales,
    totalDiscounts,
    netSales,
    totalPurchases,
    totalExpenses,
    netProfit,
    profitMargin,
    cashToHandOver,
    outstandingDebts,
    transactionCount: transactions.length,
    departments: Object.values(deptBreakdown).filter(
      (d) => d.id !== "other" || d.transactionCount > 0
    ),
  };
}
