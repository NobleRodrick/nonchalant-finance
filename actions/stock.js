"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { calculateStockClosing } from "@/lib/restaurant-metrics";

const serializeStock = (obj) => {
  if (!obj) return null;
  return {
    ...obj,
    openingStock: Number(obj.openingStock || 0),
    newPurchases: Number(obj.newPurchases || 0),
    stockUsed: Number(obj.stockUsed || 0),
    damagedStock: Number(obj.damagedStock || 0),
    closingStock: Number(obj.closingStock || 0),
    availableStock:
      Number(obj.openingStock || 0) + Number(obj.newPurchases || 0),
  };
};

export async function recordDailyStock(data) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");
    if (!user.organizationId) throw new Error("No organization associated");

    let targetDeptId = data.departmentId;
    if (user.role !== "ADMIN" && user.departmentId) {
      targetDeptId = user.departmentId;
    }

    if (!targetDeptId) {
      const firstDept = await db.department.findFirst({
        where: { organizationId: user.organizationId },
      });
      targetDeptId = firstDept?.id;
    }

    if (!targetDeptId) {
      throw new Error("No department specified");
    }

    const openingStock = parseFloat(data.openingStock || 0);
    const newPurchases = parseFloat(data.newPurchases || 0);
    const stockUsed = parseFloat(data.stockUsed || 0);
    const damagedStock = parseFloat(data.damagedStock || 0);

    const recordDate = data.date ? new Date(data.date) : new Date();
    const todayStart = new Date(recordDate);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(recordDate);
    todayEnd.setHours(23, 59, 59, 999);

    const latestRecord = await db.dailyStockRecord.findFirst({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
      },
      orderBy: { date: "desc" },
    });

    const effectiveOpening =
      Number.isFinite(openingStock) && openingStock > 0
        ? openingStock
        : latestRecord
          ? Number(latestRecord.closingStock || 0)
          : 0;

    const stockCalc = calculateStockClosing({
      openingStock: effectiveOpening,
      newPurchases,
      stockUsed,
      damagedStock,
    });

    const existingRecord = await db.dailyStockRecord.findFirst({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
        date: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    const record = existingRecord
      ? await db.dailyStockRecord.update({
          where: { id: existingRecord.id },
          data: {
            openingStock: stockCalc.openingStock,
            newPurchases: stockCalc.newPurchases,
            stockUsed: stockCalc.stockUsed,
            damagedStock: stockCalc.damagedStock,
            closingStock: stockCalc.closingStock,
            notes: data.notes || existingRecord.notes,
            date: recordDate,
          },
          include: {
            department: true,
            user: { select: { name: true } },
          },
        })
      : await db.dailyStockRecord.create({
          data: {
            organizationId: user.organizationId,
            departmentId: targetDeptId,
            userId: user.id,
            date: recordDate,
            openingStock: stockCalc.openingStock,
            newPurchases: stockCalc.newPurchases,
            stockUsed: stockCalc.stockUsed,
            damagedStock: stockCalc.damagedStock,
            closingStock: stockCalc.closingStock,
            notes: data.notes || null,
          },
          include: {
            department: true,
            user: { select: { name: true } },
          },
        });

    revalidatePath("/stock");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    return {
      success: true,
      data: serializeStock(record),
    };
  } catch (error) {
    console.error("Record daily stock error:", error);
    return { success: false, error: error.message };
  }
}

export async function getLatestStockRecord(departmentId = null) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) return null;

    let targetDeptId = departmentId;
    if (user.role !== "ADMIN" && user.departmentId) {
      targetDeptId = user.departmentId;
    }

    const whereClause = {
      organizationId: user.organizationId,
    };
    if (targetDeptId) {
      whereClause.departmentId = targetDeptId;
    }

    const latest = await db.dailyStockRecord.findFirst({
      where: whereClause,
      orderBy: { date: "desc" },
      include: { department: true },
    });

    return serializeStock(latest);
  } catch (error) {
    console.error("Get latest stock error:", error);
    return null;
  }
}

export async function getDepartmentStockHistory(departmentId = null, startDate = null, endDate = null) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) return [];

    let targetDeptId = departmentId;
    if (user.role !== "ADMIN" && user.departmentId) {
      targetDeptId = user.departmentId;
    }

    const whereClause = {
      organizationId: user.organizationId,
      ...(targetDeptId && targetDeptId !== "all" ? { departmentId: targetDeptId } : {}),
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    };

    const records = await db.dailyStockRecord.findMany({
      where: whereClause,
      orderBy: { date: "desc" },
      include: {
        department: true,
        user: { select: { name: true } },
      },
    });

    return records.map(serializeStock);
  } catch (error) {
    console.error("Get department stock history error:", error);
    return [];
  }
}

export async function getDepartmentStockRecords(departmentId = null, limit = 30) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) return [];

    let targetDeptId = departmentId;
    if (user.role !== "ADMIN" && user.departmentId) {
      targetDeptId = user.departmentId;
    }

    const whereClause = {
      organizationId: user.organizationId,
    };
    if (targetDeptId && targetDeptId !== "all") {
      whereClause.departmentId = targetDeptId;
    }

    const records = await db.dailyStockRecord.findMany({
      where: whereClause,
      orderBy: { date: "desc" },
      take: limit,
      include: {
        department: true,
        user: { select: { name: true } },
      },
    });

    return records.map(serializeStock);
  } catch (error) {
    console.error("Get department stock records error:", error);
    return [];
  }
}
