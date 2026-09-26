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

const serializeStockItem = (item) => {
  if (!item) return null;
  return {
    ...item,
    openingQuantity: Number(item.openingQuantity || 0),
    currentQuantity: Number(item.currentQuantity || 0),
    valuationUnitCost: Number(item.valuationUnitCost || 0),
    reorderLevel: Number(item.reorderLevel || 0),
    movements: item.movements?.map((movement) => ({
      ...movement,
      quantity: Number(movement.quantity || 0),
      unitCost: movement.unitCost === null ? null : Number(movement.unitCost || 0),
    })),
  };
};

async function resolveDepartment(user, requestedDepartmentId) {
  let departmentId = requestedDepartmentId;
  if (user.role !== "ADMIN" && user.departmentId) {
    departmentId = user.departmentId;
  }

  if (!departmentId) {
    const department = await db.department.findFirst({
      where: { organizationId: user.organizationId },
      select: { id: true },
    });
    departmentId = department?.id;
  }

  if (!departmentId) throw new Error("No department specified");

  const department = await db.department.findFirst({
    where: { id: departmentId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!department) throw new Error("Department is not in your organization");

  return departmentId;
}

export async function createStockItem(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");

    const departmentId = await resolveDepartment(user, data.departmentId);
    const name = String(data.name || "").trim();
    if (!name) throw new Error("Stock item name is required");

    const openingQuantity = Math.max(0, Number(data.openingQuantity) || 0);
    const item = await db.$transaction(async (tx) => {
      const created = await tx.departmentStockItem.create({
        data: {
          name,
          category: data.category || null,
          unit: data.unit || "unit",
          trackingPeriod: data.trackingPeriod || "DAILY",
           periodStart: data.periodStart ? new Date(data.periodStart) : null,
           periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
          openingQuantity,
          currentQuantity: openingQuantity,
          reorderLevel: Math.max(0, Number(data.reorderLevel) || 0),
          organizationId: user.organizationId,
          departmentId,
          userId: user.id,
        },
      });

      if (openingQuantity > 0) {
        await tx.stockMovement.create({
          data: {
            type: "OPENING",
            quantity: openingQuantity,
            stockItemId: created.id,
            organizationId: user.organizationId,
            departmentId,
            userId: user.id,
          },
        });
      }

      return created;
    });

    revalidatePath("/stock");
    return { success: true, data: serializeStockItem(item) };
  } catch (error) {
    console.error("Create stock item error:", error);
    return { success: false, error: error.message };
  }
}

export async function getDepartmentStockItems(departmentId = null) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) return [];

    const targetDepartmentId = await resolveDepartment(user, departmentId);
    const items = await db.departmentStockItem.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDepartmentId,
        isActive: true,
      },
      orderBy: { name: "asc" },
      include: {
        movements: { orderBy: { date: "desc" }, take: 10 },
      },
    });

    return items.map(serializeStockItem);
  } catch (error) {
    console.error("Get department stock items error:", error);
    return [];
  }
}

export async function recordStockMovement(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");

    const departmentId = await resolveDepartment(user, data.departmentId);
    const quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Quantity must be greater than zero");
    }

    const item = await db.departmentStockItem.findFirst({
      where: {
        id: data.stockItemId,
        organizationId: user.organizationId,
        departmentId,
        isActive: true,
      },
    });
    if (!item) throw new Error("Stock item not found in this department");

    const movementType = data.type || "PURCHASE";
    const signedChange = ["USAGE", "DAMAGE"].includes(movementType) ? -quantity : quantity;
    const nextQuantity = Number(item.currentQuantity || 0) + signedChange;
    if (nextQuantity < 0) throw new Error("Movement cannot reduce stock below zero");

    const result = await db.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          type: movementType,
          quantity,
          unitCost: data.unitCost ? Number(data.unitCost) : null,
          date: data.date ? new Date(data.date) : new Date(),
          notes: data.notes || null,
          stockItemId: item.id,
          transactionId: data.transactionId || null,
          organizationId: user.organizationId,
          departmentId,
          userId: user.id,
        },
      });
      const updatedItem = await tx.departmentStockItem.update({
        where: { id: item.id },
        data: { currentQuantity: nextQuantity },
      });
      return { movement, updatedItem };
    });

    revalidatePath("/stock");
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    return { success: true, data: serializeStockItem(result.updatedItem) };
  } catch (error) {
    console.error("Record stock movement error:", error);
    return { success: false, error: error.message };
  }
}

export async function updateStockItem(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");

    const departmentId = await resolveDepartment(user, data.departmentId);
    const item = await db.departmentStockItem.findFirst({
      where: {
        id: data.stockItemId,
        organizationId: user.organizationId,
        departmentId,
      },
    });
    if (!item) throw new Error("Stock item not found in this department");

    const updated = await db.departmentStockItem.update({
      where: { id: item.id },
      data: {
        name: data.name?.trim() || item.name,
        category: data.category ?? item.category,
        unit: data.unit || item.unit,
        trackingPeriod: data.trackingPeriod || item.trackingPeriod,
         periodStart: data.periodStart || item.periodStart,
         periodEnd: data.periodEnd || item.periodEnd,
        reorderLevel: data.reorderLevel === undefined ? item.reorderLevel : Math.max(0, Number(data.reorderLevel) || 0),
        isActive: data.isActive ?? item.isActive,
      },
    });

    revalidatePath("/stock");
    return { success: true, data: serializeStockItem(updated) };
  } catch (error) {
    console.error("Update stock item error:", error);
    return { success: false, error: error.message };
  }
}

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
