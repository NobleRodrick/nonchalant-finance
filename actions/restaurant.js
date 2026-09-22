"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function departmentFor(user, requestedId) {
  let departmentId = user.role === "ADMIN" ? requestedId : user.departmentId;
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

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function serialize(value) {
  if (!value) return value;
  return JSON.parse(JSON.stringify(value, (_, item) => (item?.constructor?.name === "Decimal" ? Number(item) : item)));
}

export async function createMenuItem(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");
    const departmentId = await departmentFor(user, data.departmentId);
    const name = String(data.name || "").trim();
    const sellingPrice = number(data.sellingPrice);
    if (!name || sellingPrice <= 0) throw new Error("Menu item name and selling price are required");

    const item = await db.menuItem.create({
      data: {
        name,
        description: data.description?.trim() || null,
        sellingPrice,
        organizationId: user.organizationId,
        departmentId,
        userId: user.id,
      },
    });
    revalidatePath("/menu");
    return { success: true, data: serialize(item) };
  } catch (error) {
    console.error("Create menu item error:", error);
    return { success: false, error: error.message };
  }
}

export async function getMenuItems(departmentId = null) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) return [];
    const targetDepartmentId = await departmentFor(user, departmentId);
    const items = await db.menuItem.findMany({
      where: { organizationId: user.organizationId, departmentId: targetDepartmentId, isActive: true },
      include: { recipe: { include: { stockItem: true } } },
      orderBy: { name: "asc" },
    });
    return serialize(items);
  } catch (error) {
    console.error("Get menu items error:", error);
    return [];
  }
}

export async function setMenuRecipe(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");
    const departmentId = await departmentFor(user, data.departmentId);
    const quantity = number(data.quantity);
    if (!data.menuItemId || !data.stockItemId || quantity <= 0) throw new Error("Menu item, stock item, and quantity are required");

    const [menuItem, stockItem] = await Promise.all([
      db.menuItem.findFirst({ where: { id: data.menuItemId, organizationId: user.organizationId, departmentId } }),
      db.departmentStockItem.findFirst({ where: { id: data.stockItemId, organizationId: user.organizationId, departmentId, isActive: true } }),
    ]);
    if (!menuItem || !stockItem) throw new Error("Menu item and stock item must belong to this department");

    const recipe = await db.recipeIngredient.upsert({
      where: { menuItemId_stockItemId: { menuItemId: menuItem.id, stockItemId: stockItem.id } },
      update: { quantity },
      create: { quantity, menuItemId: menuItem.id, stockItemId: stockItem.id, organizationId: user.organizationId, departmentId, userId: user.id },
    });
    revalidatePath("/menu");
    return { success: true, data: serialize(recipe) };
  } catch (error) {
    console.error("Set menu recipe error:", error);
    return { success: false, error: error.message };
  }
}

export async function recordItemizedSale(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");
    const departmentId = await departmentFor(user, data.departmentId);
    const lines = Array.isArray(data.lines) ? data.lines : [];
    if (!lines.length) throw new Error("Add at least one menu item");

    const discount = Math.max(0, number(data.discountAmount));
    const paymentMethod = data.paymentMethod || "CASH";
    if (paymentMethod === "CREDIT" && !String(data.customerName || "").trim()) throw new Error("Customer name is required for credit sales");
    const date = data.date ? new Date(data.date) : new Date();

    if (data.accountId) {
      const account = await db.account.findFirst({
        where: {
          id: data.accountId,
          organizationId: user.organizationId,
          ...(user.role !== "ADMIN" ? { departmentId: user.departmentId } : {}),
        },
      });
      if (!account) throw new Error("Selected account is not available to this department");
    }

    const result = await db.$transaction(async (tx) => {
      const resolvedLines = [];
      let grossAmount = 0;
      for (const input of lines) {
        const quantity = number(input.quantity);
        if (quantity <= 0) throw new Error("Sale quantities must be greater than zero");
        const menuItem = await tx.menuItem.findFirst({
          where: { id: input.menuItemId, organizationId: user.organizationId, departmentId, isActive: true },
          include: { recipe: true },
        });
        if (!menuItem) throw new Error("A selected menu item is not in this department");
        if (menuItem.recipe.length === 0) throw new Error(`${menuItem.name} has no recipe configured`);
        const totalAmount = Number(menuItem.sellingPrice) * quantity;
        grossAmount += totalAmount;
        resolvedLines.push({ menuItem, quantity, totalAmount });
      }
      if (discount > grossAmount) throw new Error("Discount cannot exceed gross sales");
      const netAmount = grossAmount - discount;

      for (const line of resolvedLines) {
        for (const ingredient of line.menuItem.recipe) {
          const usedQuantity = Number(ingredient.quantity) * line.quantity;
          const stockItem = await tx.departmentStockItem.findFirst({ where: { id: ingredient.stockItemId, departmentId, organizationId: user.organizationId, isActive: true } });
          if (!stockItem || Number(stockItem.currentQuantity) < usedQuantity) {
            throw new Error(`Insufficient stock for ${stockItem?.name || "a recipe ingredient"}`);
          }
          await tx.departmentStockItem.update({ where: { id: stockItem.id }, data: { currentQuantity: { decrement: usedQuantity } } });
        }
      }

      const transaction = await tx.transaction.create({
        data: {
          type: "SALE",
          amount: netAmount,
          grossAmount,
          discountAmount: discount,
          netAmount,
          paymentMethod,
          customerName: data.customerName?.trim() || null,
          isDebtPaid: paymentMethod !== "CREDIT",
          operationCategory: "SALE_FOOD",
          description: data.description?.trim() || "Itemized menu sale",
          date,
          category: "sale-food",
          organizationId: user.organizationId,
          departmentId,
          userId: user.id,
          accountId: data.accountId || null,
        },
      });

      for (const line of resolvedLines) {
        await tx.saleLine.create({
          data: {
            quantity: line.quantity,
            unitPrice: line.menuItem.sellingPrice,
            totalAmount: line.totalAmount,
            discountAmount: discount * (line.totalAmount / grossAmount),
            transactionId: transaction.id,
            menuItemId: line.menuItem.id,
            organizationId: user.organizationId,
            departmentId,
            userId: user.id,
          },
        });
        for (const ingredient of line.menuItem.recipe) {
          await tx.stockMovement.create({
            data: {
              type: "USAGE",
              quantity: Number(ingredient.quantity) * line.quantity,
              date,
              notes: `Used for ${line.quantity} x ${line.menuItem.name}`,
              stockItemId: ingredient.stockItemId,
              transactionId: transaction.id,
              organizationId: user.organizationId,
              departmentId,
              userId: user.id,
            },
          });
        }
      }

      if (paymentMethod === "CREDIT") {
        await tx.debt.create({
          data: {
            debtorName: data.customerName.trim(),
            debtorContact: data.customerContact?.trim() || null,
            foodDescription: resolvedLines.map((line) => `${line.quantity} x ${line.menuItem.name}`).join(", "),
            amountOwed: netAmount,
            date,
            transactionId: transaction.id,
            organizationId: user.organizationId,
            departmentId,
            userId: user.id,
          },
        });
      }

      if (data.accountId && paymentMethod !== "CREDIT") {
        await tx.account.update({
          where: { id: data.accountId },
          data: { balance: { increment: netAmount } },
        });
      }
      return transaction;
    });

    revalidatePath("/dashboard");
    revalidatePath("/reports");
    revalidatePath("/menu");
    revalidatePath("/stock");
    revalidatePath("/debts");
    return { success: true, data: serialize(result) };
  } catch (error) {
    console.error("Record itemized sale error:", error);
    return { success: false, error: error.message };
  }
}

export async function getDebts(departmentId = null) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) return [];
    const where = { organizationId: user.organizationId };
    if (user.role !== "ADMIN" || departmentId) where.departmentId = await departmentFor(user, departmentId);
    const debts = await db.debt.findMany({ where, include: { payments: true, transaction: { include: { saleLines: { include: { menuItem: true } } } } }, orderBy: { date: "desc" } });
    return serialize(debts);
  } catch (error) {
    console.error("Get debts error:", error);
    return [];
  }
}

export async function recordDebtPayment(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");
    const debt = await db.debt.findFirst({ where: { id: data.debtId, organizationId: user.organizationId, departmentId: user.role === "ADMIN" ? undefined : user.departmentId } });
    if (!debt) throw new Error("Debt not found");
    const amount = number(data.amount);
    const outstanding = Number(debt.amountOwed) - Number(debt.amountPaid);
    if (amount <= 0 || amount > outstanding) throw new Error("Payment must be greater than zero and no more than the outstanding balance");

    if (data.accountId) {
      const account = await db.account.findFirst({
        where: {
          id: data.accountId,
          organizationId: user.organizationId,
          ...(user.role !== "ADMIN" ? { departmentId: user.departmentId } : {}),
        },
      });
      if (!account) throw new Error("Selected account is not available to this department");
    }

    const result = await db.$transaction(async (tx) => {
      await tx.debtPayment.create({ data: { amount, paymentMethod: data.paymentMethod || "CASH", reference: data.reference?.trim() || null, debtId: debt.id, organizationId: user.organizationId, departmentId: debt.departmentId, userId: user.id } });
      const amountPaid = Number(debt.amountPaid) + amount;
      const status = amountPaid >= Number(debt.amountOwed) ? "PAID" : "PARTIALLY_PAID";
      await tx.debt.update({ where: { id: debt.id }, data: { amountPaid, status } });
      if (data.accountId) {
        await tx.account.update({ where: { id: data.accountId }, data: { balance: { increment: amount } } });
      }
      return { amountPaid, status };
    });
    revalidatePath("/debts");
    revalidatePath("/reports");
    return { success: true, data: result };
  } catch (error) {
    console.error("Record debt payment error:", error);
    return { success: false, error: error.message };
  }
}

export async function recordCashHandover(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");
    const departmentId = await departmentFor(user, data.departmentId);
    const amount = number(data.amount);
    if (amount <= 0) throw new Error("Handover amount must be greater than zero");
    if (data.accountId) {
      const account = await db.account.findFirst({
        where: {
          id: data.accountId,
          organizationId: user.organizationId,
          ...(user.role !== "ADMIN" ? { departmentId: user.departmentId } : {}),
        },
      });
      if (!account) throw new Error("Selected account is not available to this department");
      if (Number(account.balance) < amount) throw new Error("Handover cannot exceed the selected account balance");
    }
    const handover = await db.$transaction(async (tx) => {
      const created = await tx.cashHandover.create({ data: { amount, recipientName: data.recipientName?.trim() || "CEO", reference: data.reference?.trim() || null, receiptUrl: data.receiptUrl || null, date: data.date ? new Date(data.date) : new Date(), organizationId: user.organizationId, departmentId, userId: user.id, accountId: data.accountId || null } });
      if (data.accountId) await tx.account.update({ where: { id: data.accountId }, data: { balance: { decrement: amount } } });
      return created;
    });
    revalidatePath("/cash-handover");
    revalidatePath("/reports");
    revalidatePath("/dashboard");
    return { success: true, data: serialize(handover) };
  } catch (error) {
    console.error("Record cash handover error:", error);
    return { success: false, error: error.message };
  }
}

export async function getCashHandovers(departmentId = null) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) return [];
    const where = { organizationId: user.organizationId };
    if (user.role !== "ADMIN" || departmentId) where.departmentId = await departmentFor(user, departmentId);
    const handovers = await db.cashHandover.findMany({ where, include: { department: true, user: { select: { name: true } } }, orderBy: { date: "desc" } });
    return serialize(handovers);
  } catch (error) {
    console.error("Get cash handovers error:", error);
    return [];
  }
}

export async function getRestaurantReportData({ departmentId = null, startDate = null, endDate = null } = {}) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) return { saleLines: [], debts: [], debtPayments: [], handovers: [], stockMovements: [] };

    const date = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
    const department = {};
    if (user.role !== "ADMIN" || departmentId) department.departmentId = await departmentFor(user, departmentId);

    const [saleLines, debts, debtPayments, handovers, stockMovements] = await Promise.all([
      db.saleLine.findMany({ where: { organizationId: user.organizationId, ...department, ...(Object.keys(date).length ? { createdAt: date } : {}) }, include: { menuItem: true, transaction: true }, orderBy: { createdAt: "desc" } }),
      db.debt.findMany({ where: { organizationId: user.organizationId, ...department }, include: { payments: true }, orderBy: { date: "desc" } }),
      db.debtPayment.findMany({ where: { organizationId: user.organizationId, ...department, ...(Object.keys(date).length ? { date } : {}) }, orderBy: { date: "desc" } }),
      db.cashHandover.findMany({ where: { organizationId: user.organizationId, ...department, ...(Object.keys(date).length ? { date } : {}) }, orderBy: { date: "desc" } }),
      db.stockMovement.findMany({ where: { organizationId: user.organizationId, ...department, ...(Object.keys(date).length ? { date } : {}) }, include: { stockItem: true }, orderBy: { date: "desc" } }),
    ]);

    return serialize({ saleLines, debts, debtPayments, handovers, stockMovements });
  } catch (error) {
    console.error("Get restaurant report data error:", error);
    return { saleLines: [], debts: [], debtPayments: [], handovers: [], stockMovements: [] };
  }
}
