"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getCurrentBudget(accountId) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const budget = await db.budget.findFirst({
      where: {
        userId: user.id,
      },
    });

    const currentDate = new Date();
    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );

    const expenses = await db.transaction.aggregate({
      where: {
        organizationId: user.organizationId,
        ...(user.role !== "ADMIN" && user.departmentId
          ? { departmentId: user.departmentId }
          : {}),
        type: "EXPENSE",
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return {
      budget: budget ? { ...budget, amount: Number(budget.amount) } : null,
      currentExpenses: expenses._sum.amount
        ? Number(expenses._sum.amount)
        : 0,
    };
  } catch (error) {
    console.error("Error fetching budget:", error);
    throw error;
  }
}

export async function updateBudget(amount) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const budget = await db.budget.upsert({
      where: {
        userId: user.id,
      },
      update: {
        amount: parseFloat(amount),
      },
      create: {
        userId: user.id,
        amount: parseFloat(amount),
      },
    });

    revalidatePath("/dashboard");
    return {
      success: true,
      data: { ...budget, amount: Number(budget.amount) },
    };
  } catch (error) {
    console.error("Error updating budget:", error);
    return { success: false, error: error.message };
  }
}
