"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { calculateSaleTotals, deriveDebtDetails, toSafeNumber } from "@/lib/ledger-service";

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

export async function createMenuItem(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");
    const departmentId = await departmentFor(user, data.departmentId);
    const name = String(data.name || "").trim();
    const sellingPrice = toSafeNumber(data.sellingPrice);
    const costPrice = toSafeNumber(data.costPrice);
    const inventoryMode = data.inventoryMode === "RECIPE" ? "RECIPE" : "DIRECT_PLATE";
    const openingQuantity = Math.max(0, toSafeNumber(data.openingQuantity));

    if (!name || sellingPrice <= 0) {
      throw new Error("Menu item name and selling price (> 0) are required");
    }

    const item = await db.menuItem.create({
      data: {
        name,
        description: data.description?.trim() || null,
        sellingPrice,
        costPrice,
        inventoryMode,
        openingQuantity,
        currentQuantity: openingQuantity,
        organizationId: user.organizationId,
        departmentId,
        userId: user.id,
      },
    });

    revalidatePath("/menu");
    revalidatePath("/restaurant");
    return { success: true, data: serialize(item) };
  } catch (error) {
    console.error("Create menu item error:", error);
    return { success: false, error: error.message };
  }
}

export async function updateMenuItem(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");
    if (!data.id) throw new Error("Menu item ID is required");

    const existing = await db.menuItem.findFirst({
      where: { id: data.id, organizationId: user.organizationId },
    });
    if (!existing) throw new Error("Menu item not found");

    const updateData = {};
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new Error("Dish name cannot be empty");
      updateData.name = name;
    }
    if (data.sellingPrice !== undefined) {
      const price = toSafeNumber(data.sellingPrice);
      if (price <= 0) throw new Error("Selling price must be greater than 0");
      updateData.sellingPrice = price;
    }
    if (data.costPrice !== undefined) {
      updateData.costPrice = Math.max(0, toSafeNumber(data.costPrice));
    }
    if (data.inventoryMode !== undefined) {
      updateData.inventoryMode = data.inventoryMode === "RECIPE" ? "RECIPE" : "DIRECT_PLATE";
    }
    if (data.currentQuantity !== undefined) {
      updateData.currentQuantity = Math.max(0, toSafeNumber(data.currentQuantity));
    }
    if (data.description !== undefined) {
      updateData.description = data.description?.trim() || null;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = Boolean(data.isActive);
    }

    const updated = await db.menuItem.update({
      where: { id: data.id },
      data: updateData,
    });

    revalidatePath("/menu");
    revalidatePath("/restaurant");
    return { success: true, data: serialize(updated) };
  } catch (error) {
    console.error("Update menu item error:", error);
    return { success: false, error: error.message };
  }
}

export async function deactivateMenuItem(id) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");

    const item = await db.menuItem.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!item) throw new Error("Menu item not found");

    const updated = await db.menuItem.update({
      where: { id },
      data: { isActive: false },
    });

    revalidatePath("/menu");
    revalidatePath("/restaurant");
    return { success: true, data: serialize(updated) };
  } catch (error) {
    console.error("Deactivate menu item error:", error);
    return { success: false, error: error.message };
  }
}

export async function getMenuItems(departmentId = null) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) return [];
    const targetDepartmentId = await departmentFor(user, departmentId);

    const items = await db.menuItem.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: targetDepartmentId,
        isActive: true,
      },
      include: {
        recipe: {
          include: { stockItem: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // Compute real available quantity based on inventoryMode
    const enriched = items.map((dish) => {
      let availableQuantity = 0;
      if (dish.inventoryMode === "DIRECT_PLATE") {
        availableQuantity = Math.max(0, toSafeNumber(dish.currentQuantity));
      } else if (dish.recipe && dish.recipe.length > 0) {
        // Limited by ingredient with lowest servings available
        const portions = dish.recipe.map((r) => {
          const ingredientQty = toSafeNumber(r.stockItem?.currentQuantity);
          const perDish = toSafeNumber(r.quantity);
          return perDish > 0 ? Math.floor(ingredientQty / perDish) : 0;
        });
        availableQuantity = Math.min(...portions);
      }

      return {
        ...dish,
        sellingPrice: toSafeNumber(dish.sellingPrice),
        costPrice: toSafeNumber(dish.costPrice),
        openingQuantity: toSafeNumber(dish.openingQuantity),
        currentQuantity: toSafeNumber(dish.currentQuantity),
        availableQuantity: Math.max(0, availableQuantity),
        estimatedValue: availableQuantity * toSafeNumber(dish.costPrice || dish.sellingPrice),
      };
    });

    return serialize(enriched);
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
    const quantity = toSafeNumber(data.quantity);
    if (!data.menuItemId || !data.stockItemId || quantity <= 0) {
      throw new Error("Menu item, stock item, and quantity (> 0) are required");
    }

    const [menuItem, stockItem] = await Promise.all([
      db.menuItem.findFirst({
        where: { id: data.menuItemId, organizationId: user.organizationId, departmentId },
      }),
      db.departmentStockItem.findFirst({
        where: { id: data.stockItemId, organizationId: user.organizationId, departmentId, isActive: true },
      }),
    ]);
    if (!menuItem || !stockItem) throw new Error("Menu item and stock item must belong to this department");

    const recipe = await db.recipeIngredient.upsert({
      where: {
        menuItemId_stockItemId: { menuItemId: menuItem.id, stockItemId: stockItem.id },
      },
      update: { quantity },
      create: {
        quantity,
        menuItemId: menuItem.id,
        stockItemId: stockItem.id,
        organizationId: user.organizationId,
        departmentId,
        userId: user.id,
      },
    });

    // If recipe is configured, ensure inventoryMode can be set to RECIPE if user chooses
    revalidatePath("/menu");
    revalidatePath("/restaurant");
    return { success: true, data: serialize(recipe) };
  } catch (error) {
    console.error("Set menu recipe error:", error);
    return { success: false, error: error.message };
  }
}

export async function removeMenuRecipe(menuItemId, stockItemId) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");

    await db.recipeIngredient.deleteMany({
      where: {
        menuItemId,
        stockItemId,
        organizationId: user.organizationId,
      },
    });

    revalidatePath("/menu");
    revalidatePath("/restaurant");
    return { success: true };
  } catch (error) {
    console.error("Remove menu recipe error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomically records an itemized restaurant sale.
 * Enforces stock availability for both direct plates and recipe ingredients.
 */
export async function recordItemizedSale(data) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) throw new Error("Unauthorized");
    const departmentId = await departmentFor(user, data.departmentId);
    const lines = Array.isArray(data.lines) ? data.lines : [];
    if (!lines.length) throw new Error("Add at least one menu item to the sale");

    const discount = Math.max(0, toSafeNumber(data.discountAmount));
    const paymentMethod = data.paymentMethod || "CASH";
    if (paymentMethod === "CREDIT" && !String(data.customerName || "").trim()) {
      throw new Error("Customer / Debtor name is mandatory for credit sales");
    }
    const date = data.date ? new Date(data.date) : new Date();

    if (data.accountId && paymentMethod !== "CREDIT") {
      const account = await db.account.findFirst({
        where: {
          id: data.accountId,
          organizationId: user.organizationId,
        },
      });
      if (!account) throw new Error("Selected account is not in this organization");
    }

    const result = await db.$transaction(async (tx) => {
      const resolvedLines = [];
      let calculatedGross = 0;

      for (const input of lines) {
        const quantity = toSafeNumber(input.quantity);
        if (quantity <= 0) throw new Error("Sale quantities must be greater than zero");

        const menuItem = await tx.menuItem.findFirst({
          where: {
            id: input.menuItemId,
            organizationId: user.organizationId,
            departmentId,
            isActive: true,
          },
          include: { recipe: true },
        });

        if (!menuItem) throw new Error(`Selected menu item ${input.menuItemId} is not active in this department`);

        // Check stock availability
        if (menuItem.inventoryMode === "DIRECT_PLATE") {
          const available = toSafeNumber(menuItem.currentQuantity);
          if (available < quantity) {
            throw new Error(
              `Insufficient stock for "${menuItem.name}". Available plates: ${available}, Requested: ${quantity}`
            );
          }
        } else {
          // Recipe ingredient mode
          if (!menuItem.recipe || menuItem.recipe.length === 0) {
            throw new Error(`"${menuItem.name}" is set to recipe mode but has no recipe configured`);
          }

          for (const ingredient of menuItem.recipe) {
            const neededQuantity = toSafeNumber(ingredient.quantity) * quantity;
            const stockItem = await tx.departmentStockItem.findFirst({
              where: {
                id: ingredient.stockItemId,
                departmentId,
                organizationId: user.organizationId,
                isActive: true,
              },
            });

            if (!stockItem || toSafeNumber(stockItem.currentQuantity) < neededQuantity) {
              throw new Error(
                `Insufficient ingredient stock for "${stockItem?.name || "ingredient"}" in dish "${menuItem.name}". Available: ${stockItem?.currentQuantity || 0}, Needed: ${neededQuantity}`
              );
            }
          }
        }

        const unitSellingPrice = toSafeNumber(menuItem.sellingPrice);
        const lineTotal = unitSellingPrice * quantity;
        calculatedGross += lineTotal;

        resolvedLines.push({
          menuItem,
          quantity,
          unitPrice: unitSellingPrice,
          totalAmount: lineTotal,
        });
      }

      if (discount > calculatedGross) {
        throw new Error("Discount amount cannot exceed total gross sales");
      }

      const saleTotals = calculateSaleTotals(resolvedLines, discount);
      const netAmount = saleTotals.netAmount;

      // 1. Deduct stock atomically
      for (const line of saleTotals.lines) {
        if (line.menuItem.inventoryMode === "DIRECT_PLATE") {
          await tx.menuItem.update({
            where: { id: line.menuItem.id },
            data: { currentQuantity: { decrement: line.quantity } },
          });
        } else {
          for (const ingredient of line.menuItem.recipe) {
            const usedQty = toSafeNumber(ingredient.quantity) * line.quantity;
            await tx.departmentStockItem.update({
              where: { id: ingredient.stockItemId },
              data: { currentQuantity: { decrement: usedQty } },
            });
          }
        }
      }

      // 2. Create Transaction
      const transaction = await tx.transaction.create({
        data: {
          type: "SALE",
          amount: netAmount,
          grossAmount: saleTotals.grossAmount,
          discountAmount: saleTotals.discountAmount,
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
          accountId: paymentMethod !== "CREDIT" ? (data.accountId || null) : null,
        },
      });

      // 3. Create SaleLines and Movements
      for (const line of saleTotals.lines) {
        await tx.saleLine.create({
          data: {
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalAmount: line.totalAmount,
            discountAmount: line.discountAmount,
            transactionId: transaction.id,
            menuItemId: line.menuItem.id,
            organizationId: user.organizationId,
            departmentId,
            userId: user.id,
          },
        });

        if (line.menuItem.inventoryMode === "RECIPE") {
          for (const ingredient of line.menuItem.recipe) {
            await tx.stockMovement.create({
              data: {
                type: "USAGE",
                quantity: toSafeNumber(ingredient.quantity) * line.quantity,
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
      }

      // 4. If credit, create Debt record
      if (paymentMethod === "CREDIT") {
        await tx.debt.create({
          data: {
            debtorName: data.customerName.trim(),
            debtorContact: data.customerContact?.trim() || null,
            foodDescription: saleTotals.lines
              .map((l) => `${l.quantity} x ${l.menuItem.name}`)
              .join(", "),
            amountOwed: netAmount,
            amountPaid: 0,
            status: "UNPAID",
            date,
            transactionId: transaction.id,
            organizationId: user.organizationId,
            departmentId,
            userId: user.id,
          },
        });
      }

      // 5. If immediate cash/momo/bank and account specified, update balance
      if (data.accountId && paymentMethod !== "CREDIT") {
        await tx.account.update({
          where: { id: data.accountId },
          data: { balance: { increment: netAmount } },
        });
      }

      // 6. Record Audit Event
      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          departmentId,
          userId: user.id,
          action: "SALE_CREATED",
          entityType: "Transaction",
          entityId: transaction.id,
          afterJson: {
            netAmount,
            grossAmount: saleTotals.grossAmount,
            discount: saleTotals.discountAmount,
            paymentMethod,
            lineCount: saleTotals.lines.length,
          },
        },
      });

      return transaction;
    });

    revalidatePath("/dashboard");
    revalidatePath("/reports");
    revalidatePath("/restaurant");
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
    if (user.role !== "ADMIN" || departmentId) {
      where.departmentId = await departmentFor(user, departmentId);
    }
    const debts = await db.debt.findMany({
      where,
      include: {
        payments: { orderBy: { date: "desc" } },
        transaction: {
          include: {
            saleLines: {
              include: { menuItem: true },
            },
          },
        },
      },
      orderBy: { date: "desc" },
    });
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

    const debt = await db.debt.findFirst({
      where: {
        id: data.debtId,
        organizationId: user.organizationId,
        departmentId: user.role === "ADMIN" ? undefined : (user.activeDepartmentId || user.departmentId),
      },
    });
    if (!debt) throw new Error("Debt record not found");

    const paymentAmount = toSafeNumber(data.amount);
    const owed = toSafeNumber(debt.amountOwed);
    const alreadyPaid = toSafeNumber(debt.amountPaid);
    const outstanding = Math.max(0, owed - alreadyPaid);

    if (paymentAmount <= 0) throw new Error("Payment must be greater than zero");
    if (paymentAmount > outstanding) {
      throw new Error(`Payment cannot exceed outstanding balance of ${outstanding} FCFA`);
    }

    if (data.accountId) {
      const account = await db.account.findFirst({
        where: {
          id: data.accountId,
          organizationId: user.organizationId,
        },
      });
      if (!account) throw new Error("Selected account not found");
    }

    const result = await db.$transaction(async (tx) => {
      const payment = await tx.debtPayment.create({
        data: {
          amount: paymentAmount,
          paymentMethod: data.paymentMethod || "CASH",
          reference: data.reference?.trim() || null,
          date: data.date ? new Date(data.date) : new Date(),
          debtId: debt.id,
          organizationId: user.organizationId,
          departmentId: debt.departmentId,
          userId: user.id,
        },
      });

      const newTotalPaid = alreadyPaid + paymentAmount;
      const debtDetails = deriveDebtDetails(owed, newTotalPaid);

      await tx.debt.update({
        where: { id: debt.id },
        data: {
          amountPaid: newTotalPaid,
          status: debtDetails.status,
        },
      });

      // Update account balance
      if (data.accountId) {
        await tx.account.update({
          where: { id: data.accountId },
          data: { balance: { increment: paymentAmount } },
        });
      }

      // Record transaction for cashflow tracking
      await tx.transaction.create({
        data: {
          type: "INCOME",
          amount: paymentAmount,
          paymentMethod: data.paymentMethod || "CASH",
          customerName: debt.debtorName,
          operationCategory: "DEBT_COLLECTION",
          description: `Debt payment received from ${debt.debtorName}`,
          date: data.date ? new Date(data.date) : new Date(),
          category: "debt-recovery",
          organizationId: user.organizationId,
          departmentId: debt.departmentId,
          userId: user.id,
          accountId: data.accountId || null,
        },
      });

      return { payment, newTotalPaid, status: debtDetails.status };
    });

    revalidatePath("/debts");
    revalidatePath("/reports");
    revalidatePath("/dashboard");
    return { success: true, data: serialize(result) };
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
    const amount = toSafeNumber(data.amount);
    if (amount <= 0) throw new Error("Handover amount must be greater than zero");

    if (data.accountId) {
      const account = await db.account.findFirst({
        where: {
          id: data.accountId,
          organizationId: user.organizationId,
        },
      });
      if (!account) throw new Error("Selected account not found");
      if (toSafeNumber(account.balance) < amount) {
        throw new Error(
          `Handover (${amount} FCFA) exceeds account balance (${account.balance} FCFA)`
        );
      }
    }

    const handover = await db.$transaction(async (tx) => {
      const created = await tx.cashHandover.create({
        data: {
          amount,
          recipientName: data.recipientName?.trim() || "CEO",
          reference: data.reference?.trim() || null,
          receiptUrl: data.receiptUrl || null,
          date: data.date ? new Date(data.date) : new Date(),
          organizationId: user.organizationId,
          departmentId,
          userId: user.id,
          accountId: data.accountId || null,
        },
      });

      if (data.accountId) {
        await tx.account.update({
          where: { id: data.accountId },
          data: { balance: { decrement: amount } },
        });
      }

      await tx.transaction.create({
        data: {
          type: "EXPENSE",
          amount,
          operationCategory: "CASH_HANDOVER",
          description: `Cash handover to ${data.recipientName?.trim() || "CEO"}`,
          date: data.date ? new Date(data.date) : new Date(),
          category: "cash-handover",
          receiptUrl: data.receiptUrl || null,
          organizationId: user.organizationId,
          departmentId,
          userId: user.id,
          accountId: data.accountId || null,
        },
      });

      return created;
    });

    revalidatePath("/cash-handover");
    revalidatePath("/reports");
    revalidatePath("/restaurant");
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
    if (user.role !== "ADMIN" || departmentId) {
      where.departmentId = await departmentFor(user, departmentId);
    }
    const handovers = await db.cashHandover.findMany({
      where,
      include: {
        department: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { date: "desc" },
    });
    return serialize(handovers);
  } catch (error) {
    console.error("Get cash handovers error:", error);
    return [];
  }
}

export async function getRestaurantReportData({
  departmentId = null,
  startDate = null,
  endDate = null,
} = {}) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return {
        saleLines: [],
        debts: [],
        debtPayments: [],
        handovers: [],
        stockMovements: [],
        purchases: [],
      };
    }

    const dateFilter = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
    const departmentWhere = {};
    if (user.role !== "ADMIN" || departmentId) {
      departmentWhere.departmentId = await departmentFor(user, departmentId);
    }

    const [saleLines, debts, debtPayments, handovers, stockMovements, purchases] =
      await Promise.all([
        db.saleLine.findMany({
          where: {
            organizationId: user.organizationId,
            ...departmentWhere,
            ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
          },
          include: { menuItem: true, transaction: true },
          orderBy: { createdAt: "desc" },
        }),
        db.debt.findMany({
          where: { organizationId: user.organizationId, ...departmentWhere },
          include: { payments: true },
          orderBy: { date: "desc" },
        }),
        db.debtPayment.findMany({
          where: {
            organizationId: user.organizationId,
            ...departmentWhere,
            ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
          },
          orderBy: { date: "desc" },
        }),
        db.cashHandover.findMany({
          where: {
            organizationId: user.organizationId,
            ...departmentWhere,
            ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
          },
          orderBy: { date: "desc" },
        }),
        db.stockMovement.findMany({
          where: {
            organizationId: user.organizationId,
            ...departmentWhere,
            ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
          },
          include: { stockItem: true },
          orderBy: { date: "desc" },
        }),
        db.purchase.findMany({
          where: {
            organizationId: user.organizationId,
            ...departmentWhere,
            ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
          },
          include: { lines: { include: { stockItem: true, menuItem: true } } },
          orderBy: { date: "desc" },
        }),
      ]);

    return serialize({
      saleLines,
      debts,
      debtPayments,
      handovers,
      stockMovements,
      purchases,
    });
  } catch (error) {
    console.error("Get restaurant report data error:", error);
    return {
      saleLines: [],
      debts: [],
      debtPayments: [],
      handovers: [],
      stockMovements: [],
      purchases: [],
    };
  }
}
