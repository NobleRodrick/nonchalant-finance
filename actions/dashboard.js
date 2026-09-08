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
  return serialized;
};

export async function getDashboardData(selectedDepartmentId = null) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!user.organizationId) throw new Error("User has no associated organization");

  if (user.role !== "ADMIN" && !user.departmentId) {
    throw new Error("Your account is not assigned to a department. Contact your manager.");
  }

  let effectiveDeptId = selectedDepartmentId;
  if (user.role !== "ADMIN" && user.departmentId) {
    effectiveDeptId = user.departmentId;
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

  if (user.role !== "ADMIN" && !user.departmentId) {
    return [];
  }

  try {
    const accounts = await db.account.findMany({
      where: {
        organizationId: user.organizationId,
        ...(user.role !== "ADMIN" && user.departmentId
          ? { departmentId: user.departmentId }
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

export async function getExecutiveKpis() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !user.organizationId) {
    return null;
  }

  const transactions = await db.transaction.findMany({
    where: { organizationId: user.organizationId },
    include: { department: true },
    orderBy: { date: "desc" },
  });

  const departments = await db.department.findMany({
    where: { organizationId: user.organizationId },
  });

  let totalRevenue = 0;
  let totalExpenses = 0;
  const deptBreakdown = {};

  // Initialize dept breakdown
  departments.forEach((dept) => {
    deptBreakdown[dept.id] = {
      id: dept.id,
      name: dept.name,
      revenue: 0,
      expenses: 0,
      net: 0,
      transactionCount: 0,
    };
  });

  // Also handle uncategorized / legacy transactions if any
  deptBreakdown["other"] = {
    id: "other",
    name: "General / Other",
    revenue: 0,
    expenses: 0,
    net: 0,
    transactionCount: 0,
  };

  transactions.forEach((tx) => {
    const amt = Number(tx.amount);
    const deptKey = tx.departmentId && deptBreakdown[tx.departmentId] ? tx.departmentId : "other";

    if (tx.type === "INCOME") {
      totalRevenue += amt;
      deptBreakdown[deptKey].revenue += amt;
      deptBreakdown[deptKey].net += amt;
    } else {
      totalExpenses += amt;
      deptBreakdown[deptKey].expenses += amt;
      deptBreakdown[deptKey].net -= amt;
    }
    deptBreakdown[deptKey].transactionCount += 1;
  });

  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    transactionCount: transactions.length,
    departments: Object.values(deptBreakdown).filter(
      (d) => d.id !== "other" || d.transactionCount > 0
    ),
  };
}
