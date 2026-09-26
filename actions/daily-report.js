"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  calculateCashReconciliation,
  calculateInventoryClosing,
  toSafeNumber,
} from "@/lib/ledger-service";
import { startOfDay, endOfDay } from "date-fns";

async function departmentFor(user, requestedId) {
  let departmentId = user.role === "ADMIN" ? requestedId : (user.activeDepartmentId || user.departmentId);
  if (user.role === "ADMIN" && !departmentId) {
    const firstDepartment = await db.department.findFirst({
      where: { organizationId: user.organizationId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    departmentId = firstDepartment?.id;
  }
  if (!departmentId) throw new Error("A department is required");
  const department = await db.department.findFirst({
    where: { id: departmentId, organizationId: user.organizationId },
  });
  if (!department) throw new Error("Department is not in your organization");
  return department.id;
}

function serialize(value) {
  if (!value) return value;
  return JSON.parse(
    JSON.stringify(value, (_, item) =>
      item?.constructor?.name === "Decimal" ? Number(item) : item
    )
  );
}

/**
 * Aggregates all transactions, sales, debts, purchases, stock movements, and handovers
 * for a specific department and date to produce the daily closing statement.
 */
export async function getDailyCloseData({ departmentId = null, date = new Date() } = {}) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");
    const targetDeptId = await departmentFor(user, departmentId);

    const targetDate = date ? new Date(date) : new Date();
    const dayStart = startOfDay(targetDate);
    const dayEnd = endOfDay(targetDate);

    // Fetch department details
    const department = await db.department.findUnique({
      where: { id: targetDeptId },
      include: { organization: true },
    });

    // 1. Transactions of the day
    const transactions = await db.transaction.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
        date: { gte: dayStart, lte: dayEnd },
      },
      include: {
        account: true,
        user: { select: { name: true, role: true } },
      },
      orderBy: { date: "asc" },
    });

    // 2. Sale lines of the day
    const saleLines = await db.saleLine.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      include: {
        menuItem: true,
        transaction: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. Debts created today
    const debtsCreated = await db.debt.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
        date: { gte: dayStart, lte: dayEnd },
      },
      include: { payments: true },
      orderBy: { date: "asc" },
    });

    // 4. Debt payments collected today
    const debtPayments = await db.debtPayment.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
        date: { gte: dayStart, lte: dayEnd },
      },
      include: { debt: true },
      orderBy: { date: "asc" },
    });

    // 5. Purchases recorded today
    const purchases = await db.purchase.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
        date: { gte: dayStart, lte: dayEnd },
      },
      include: {
        lines: {
          include: { stockItem: true, menuItem: true },
        },
      },
      orderBy: { date: "asc" },
    });

    // 6. Cash handovers recorded today
    const handovers = await db.cashHandover.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
        date: { gte: dayStart, lte: dayEnd },
      },
      include: {
        user: { select: { name: true } },
        account: true,
      },
      orderBy: { date: "asc" },
    });

    // 7. Stock items and movements today
    const stockItems = await db.departmentStockItem.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
        isActive: true,
      },
      include: {
        movements: {
          where: { date: { gte: dayStart, lte: dayEnd } },
        },
      },
      orderBy: { name: "asc" },
    });

    // 8. Menu dishes and current plate quantities
    const menuItems = await db.menuItem.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
        isActive: true,
      },
      include: {
        saleLines: {
          where: { createdAt: { gte: dayStart, lte: dayEnd } },
        },
      },
      orderBy: { name: "asc" },
    });

    // 9. Existing DailyReport record if any
    const existingReport = await db.dailyReport.findUnique({
      where: {
        departmentId_reportDate: {
          departmentId: targetDeptId,
          reportDate: dayStart,
        },
      },
      include: {
        submittedBy: { select: { name: true, email: true } },
        reviewedBy: { select: { name: true, email: true } },
      },
    });

    // --- Financial Aggregations ---
    let grossSales = 0;
    let totalDiscount = 0;
    let netSales = 0;
    let cashSales = 0;
    let creditSales = 0;
    let momoSales = 0;
    let bankSales = 0;

    let rentIncome = 0;
    let otherIncome = 0;
    let cashPurchases = 0;
    let creditPurchases = 0;
    let operatingExpenses = 0;
    let otherExpenses = 0;

    for (const t of transactions) {
      const amount = toSafeNumber(t.amount);
      const gross = toSafeNumber(t.grossAmount) || amount;
      const discount = toSafeNumber(t.discountAmount);

      if (t.type === "SALE") {
        grossSales += gross;
        totalDiscount += discount;
        netSales += amount;

        if (t.paymentMethod === "CASH") cashSales += amount;
        else if (t.paymentMethod === "CREDIT") creditSales += amount;
        else if (t.paymentMethod === "MOMO") momoSales += amount;
        else if (t.paymentMethod === "BANK_TRANSFER") bankSales += amount;
      } else if (t.type === "INCOME") {
        if (t.operationCategory === "RENT_INCOME") {
          rentIncome += amount;
        } else if (t.operationCategory === "DEBT_COLLECTION") {
          // Handled in debtPayments
        } else {
          otherIncome += amount;
        }
      } else if (t.type === "PURCHASE") {
        if (t.paymentMethod === "CREDIT") creditPurchases += amount;
        else cashPurchases += amount;
      } else if (t.type === "EXPENSE") {
        if (t.operationCategory === "CASH_HANDOVER") {
          // Handled in handovers
        } else if (t.operationCategory === "OTHER_EXPENSE") {
          otherExpenses += amount;
        } else {
          operatingExpenses += amount;
        }
      }
    }

    const debtPaymentsReceived = debtPayments.reduce(
      (sum, p) => sum + toSafeNumber(p.amount),
      0
    );

    const actualHandover = handovers.reduce(
      (sum, h) => sum + toSafeNumber(h.amount),
      0
    );

    // Cash reconciliation
    const cashReconciliation = calculateCashReconciliation({
      cashSales,
      rentIncome,
      otherIncome,
      debtPaymentsReceived,
      cashPurchases,
      cashExpenses: operatingExpenses,
      otherExpenses,
      actualHandover,
      countedCash: null,
    });

    // Dishes sold summary
    const dishSummary = menuItems.map((dish) => {
      const platesSold = dish.saleLines.reduce(
        (sum, sl) => sum + toSafeNumber(sl.quantity),
        0
      );
      const salesValue = platesSold * toSafeNumber(dish.sellingPrice);
      return {
        id: dish.id,
        name: dish.name,
        sellingPrice: toSafeNumber(dish.sellingPrice),
        inventoryMode: dish.inventoryMode,
        platesSold,
        salesValue,
        currentQuantity: toSafeNumber(dish.currentQuantity),
      };
    });

    // Inventory closing summary
    let totalStockValue = 0;
    const inventorySummary = stockItems.map((item) => {
      let purchasedToday = 0;
      let usedToday = 0;
      let damagedToday = 0;

      for (const m of item.movements) {
        const qty = toSafeNumber(m.quantity);
        if (m.type === "PURCHASE") purchasedToday += qty;
        else if (m.type === "USAGE") usedToday += qty;
        else if (m.type === "DAMAGE" || m.type === "WASTE") damagedToday += qty;
      }

      const closingCalc = calculateInventoryClosing({
        openingQuantity: item.openingQuantity,
        purchasedQuantity: purchasedToday,
        soldQuantity: usedToday,
        wastedQuantity: damagedToday,
        unitCost: item.valuationUnitCost,
      });

      totalStockValue += closingCalc.closingValue;

      return {
        id: item.id,
        name: item.name,
        unit: item.unit,
        currentQuantity: toSafeNumber(item.currentQuantity),
        valuationUnitCost: toSafeNumber(item.valuationUnitCost),
        purchasedToday,
        usedToday,
        damagedToday,
        closingQuantity: toSafeNumber(item.currentQuantity),
        closingValue: toSafeNumber(item.currentQuantity) * toSafeNumber(item.valuationUnitCost),
      };
    });

    return serialize({
      department,
      reportDate: dayStart,
      status: existingReport?.status || "DRAFT",
      existingReport,
      metrics: {
        grossSales,
        totalDiscount,
        netSales,
        cashSales,
        creditSales,
        momoSales,
        bankSales,
        rentIncome,
        otherIncome,
        debtPaymentsReceived,
        cashPurchases,
        creditPurchases,
        operatingExpenses,
        otherExpenses,
        actualHandover,
        totalStockValue,
        ...cashReconciliation,
      },
      dishSummary,
      inventorySummary,
      purchases,
      debtsCreated,
      debtPayments,
      handovers,
      transactions,
    });
  } catch (error) {
    console.error("Get daily close data error:", error);
    return null;
  }
}

/**
 * Submits the daily closing report from Department Head to CEO.
 * Stores an immutable snapshot of all metrics and lines.
 */
export async function submitDailyReport(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");
    const departmentId = await departmentFor(user, data.departmentId);

    const reportDate = data.date ? startOfDay(new Date(data.date)) : startOfDay(new Date());

    // Compute fresh snapshot data
    const closeData = await getDailyCloseData({ departmentId, date: reportDate });
    if (!closeData) throw new Error("Failed to compute daily closing data");

    const countedCash = data.countedCash !== undefined ? toSafeNumber(data.countedCash) : null;
    if (countedCash !== null) {
      closeData.metrics.countedCash = countedCash;
      closeData.metrics.variance = countedCash - closeData.metrics.cashRemaining;
    }

    const report = await db.$transaction(async (tx) => {
      const created = await tx.dailyReport.upsert({
        where: {
          departmentId_reportDate: {
            departmentId,
            reportDate,
          },
        },
        update: {
          status: "SUBMITTED",
          submittedById: user.id,
          submittedAt: new Date(),
          notes: data.notes?.trim() || null,
          snapshotJson: closeData,
          totalsJson: closeData.metrics,
        },
        create: {
          organizationId: user.organizationId,
          departmentId,
          reportDate,
          status: "SUBMITTED",
          submittedById: user.id,
          submittedAt: new Date(),
          notes: data.notes?.trim() || null,
          snapshotJson: closeData,
          totalsJson: closeData.metrics,
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          departmentId,
          userId: user.id,
          action: "DAILY_REPORT_SUBMITTED",
          entityType: "DailyReport",
          entityId: created.id,
          afterJson: {
            netSales: closeData.metrics.netSales,
            cashHandover: closeData.metrics.actualHandover,
            variance: closeData.metrics.variance,
          },
        },
      });

      return created;
    });

    revalidatePath("/reports");
    revalidatePath("/daily-close");
    revalidatePath("/dashboard");
    revalidatePath("/organization/reports");

    return { success: true, data: serialize(report) };
  } catch (error) {
    console.error("Submit daily report error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Boss / Admin Report Inbox: Fetches submitted daily reports across departments.
 */
export async function getBossReportInbox({ status = null, departmentId = null, date = null } = {}) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN" || !user.organizationId) {
      return [];
    }

    const where = {
      organizationId: user.organizationId,
    };
    if (status && status !== "ALL") where.status = status;
    if (departmentId && departmentId !== "ALL") where.departmentId = departmentId;
    if (date) {
      where.reportDate = startOfDay(new Date(date));
    }

    const reports = await db.dailyReport.findMany({
      where,
      include: {
        department: true,
        submittedBy: { select: { name: true, email: true } },
        reviewedBy: { select: { name: true, email: true } },
      },
      orderBy: { reportDate: "desc" },
    });

    return serialize(reports);
  } catch (error) {
    console.error("Get boss report inbox error:", error);
    return [];
  }
}

/**
 * Allows the Boss / CEO to review, approve, or return a submitted daily report with notes.
 */
export async function reviewDailyReport(data) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") throw new Error("Only admins can review reports");

    const { reportId, status, reviewNotes } = data;
    if (!reportId || !["APPROVED", "RETURNED", "REVIEWED"].includes(status)) {
      throw new Error("Valid report ID and status (APPROVED or RETURNED) are required");
    }

    const report = await db.$transaction(async (tx) => {
      const updated = await tx.dailyReport.update({
        where: { id: reportId, organizationId: user.organizationId },
        data: {
          status,
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewNotes: reviewNotes?.trim() || null,
        },
        include: {
          department: true,
          submittedBy: true,
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          departmentId: updated.departmentId,
          userId: user.id,
          action: `DAILY_REPORT_${status}`,
          entityType: "DailyReport",
          entityId: updated.id,
          afterJson: {
            status,
            reviewNotes: reviewNotes?.trim() || null,
          },
        },
      });

      return updated;
    });

    revalidatePath("/reports");
    revalidatePath("/daily-close");
    revalidatePath("/organization/reports");
    revalidatePath("/dashboard");

    return { success: true, data: serialize(report) };
  } catch (error) {
    console.error("Review daily report error:", error);
    return { success: false, error: error.message };
  }
}
