"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { calculateWeightedAverageCost, toSafeNumber } from "@/lib/ledger-service";

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
 * Creates a structured purchase transaction with line items and updates inventory valuation.
 */
export async function createPurchaseRecord(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");

    const departmentId = await departmentFor(user, data.departmentId);
    const lines = Array.isArray(data.lines) ? data.lines : [];
    if (!lines.length) throw new Error("At least one purchase item is required");

    const supplierName = String(data.supplierName || "").trim() || null;
    const reference = String(data.reference || "").trim() || null;
    const paymentMethod = data.paymentMethod || "CASH";
    const date = data.date ? new Date(data.date) : new Date();
    const notes = String(data.notes || "").trim() || null;
    const receiptUrl = data.receiptUrl || null;

    // Check account if cash/bank payment
    if (data.accountId && paymentMethod !== "CREDIT") {
      const account = await db.account.findFirst({
        where: {
          id: data.accountId,
          organizationId: user.organizationId,
        },
      });
      if (!account) throw new Error("Selected account not found in this organization");
    }

    const result = await db.$transaction(async (tx) => {
      let totalAmount = 0;
      const validatedLines = [];

      for (const input of lines) {
        const quantity = toSafeNumber(input.quantity);
        const unitCost = toSafeNumber(input.unitCost);
        if (quantity <= 0 || unitCost < 0) {
          throw new Error("Quantity must be greater than 0 and unit cost cannot be negative");
        }
        const lineTotal = quantity * unitCost;
        totalAmount += lineTotal;

        if (input.stockItemId) {
          const stockItem = await tx.departmentStockItem.findFirst({
            where: {
              id: input.stockItemId,
              departmentId,
              organizationId: user.organizationId,
            },
          });
          if (!stockItem) throw new Error(`Stock item ${input.stockItemId} not found`);
          validatedLines.push({
            type: "STOCK",
            item: stockItem,
            quantity,
            unitCost,
            lineTotal,
          });
        } else if (input.menuItemId) {
          const menuItem = await tx.menuItem.findFirst({
            where: {
              id: input.menuItemId,
              departmentId,
              organizationId: user.organizationId,
            },
          });
          if (!menuItem) throw new Error(`Menu dish ${input.menuItemId} not found`);
          validatedLines.push({
            type: "DISH",
            item: menuItem,
            quantity,
            unitCost,
            lineTotal,
          });
        } else {
          throw new Error("Each line must specify a stock item or menu dish");
        }
      }

      // Create primary Transaction
      const transaction = await tx.transaction.create({
        data: {
          type: "PURCHASE",
          amount: totalAmount,
          paymentMethod,
          customerName: supplierName,
          operationCategory: "PURCHASE_FOOD",
          description: notes || `Purchase from ${supplierName || "Supplier"}`,
          date,
          category: "purchase-food",
          receiptUrl,
          purchaseSupplier: supplierName,
          purchaseReference: reference,
          organizationId: user.organizationId,
          departmentId,
          userId: user.id,
          accountId: data.accountId || null,
        },
      });

      // Create Purchase Header
      const purchase = await tx.purchase.create({
        data: {
          organizationId: user.organizationId,
          departmentId,
          userId: user.id,
          supplierName,
          reference,
          paymentMethod,
          totalAmount,
          date,
          receiptUrl,
          notes,
          transactionId: transaction.id,
        },
      });

      // Process lines and update stock + valuation
      for (const line of validatedLines) {
        if (line.type === "STOCK") {
          const newCost = calculateWeightedAverageCost({
            currentQuantity: line.item.currentQuantity,
            currentValuationCost: line.item.valuationUnitCost,
            purchaseQuantity: line.quantity,
            purchaseUnitCost: line.unitCost,
          });

          await tx.departmentStockItem.update({
            where: { id: line.item.id },
            data: {
              currentQuantity: { increment: line.quantity },
              valuationUnitCost: newCost,
            },
          });

          await tx.purchaseLine.create({
            data: {
              purchaseId: purchase.id,
              stockItemId: line.item.id,
              quantity: line.quantity,
              unitCost: line.unitCost,
              totalCost: line.lineTotal,
            },
          });

          await tx.stockMovement.create({
            data: {
              type: "PURCHASE",
              quantity: line.quantity,
              unitCost: line.unitCost,
              date,
              notes: `Purchased from ${supplierName || "Supplier"}${reference ? ` (Ref: ${reference})` : ""}`,
              stockItemId: line.item.id,
              transactionId: transaction.id,
              organizationId: user.organizationId,
              departmentId,
              userId: user.id,
            },
          });
        } else if (line.type === "DISH") {
          // Prepared plate direct stock
          await tx.menuItem.update({
            where: { id: line.item.id },
            data: {
              currentQuantity: { increment: line.quantity },
              costPrice: line.unitCost > 0 ? line.unitCost : line.item.costPrice,
            },
          });

          await tx.purchaseLine.create({
            data: {
              purchaseId: purchase.id,
              menuItemId: line.item.id,
              quantity: line.quantity,
              unitCost: line.unitCost,
              totalCost: line.lineTotal,
            },
          });
        }
      }

      // Deduct account balance if paid immediately from an account
      if (data.accountId && paymentMethod !== "CREDIT") {
        await tx.account.update({
          where: { id: data.accountId },
          data: { balance: { decrement: totalAmount } },
        });
      }

      // Audit event
      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          departmentId,
          userId: user.id,
          action: "PURCHASE_CREATED",
          entityType: "Purchase",
          entityId: purchase.id,
          afterJson: {
            totalAmount,
            supplierName,
            lineCount: validatedLines.length,
          },
        },
      });

      return purchase;
    });

    revalidatePath("/stock");
    revalidatePath("/restaurant");
    revalidatePath("/reports");
    revalidatePath("/dashboard");

    return { success: true, data: serialize(result) };
  } catch (error) {
    console.error("Create purchase record error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Retrieves purchases for a department within an optional date range.
 */
export async function getPurchases({ departmentId = null, startDate = null, endDate = null } = {}) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) return [];

    const targetDeptId = await departmentFor(user, departmentId);
    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const purchases = await db.purchase.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDeptId,
        ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
      },
      include: {
        lines: {
          include: {
            stockItem: true,
            menuItem: true,
          },
        },
        user: { select: { name: true, email: true } },
      },
      orderBy: { date: "desc" },
    });

    return serialize(purchases);
  } catch (error) {
    console.error("Get purchases error:", error);
    return [];
  }
}
