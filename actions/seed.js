"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { subDays } from "date-fns";

/**
 * Safe, development-only seed function for Springer Finance restaurant domain.
 * Replaces the legacy personal-finance dummy seed.
 */
export async function seedTransactions() {
  try {
    const currentUser = await getCurrentUser();
    let orgId = currentUser?.organizationId;
    let userId = currentUser?.id;

    // In dev mode without a user, find or create a development admin
    if (!userId) {
      if (process.env.NODE_ENV === "production") {
        return { success: false, error: "Seeding is disabled in production" };
      }

      let devUser = await db.user.findFirst({
        where: { role: "ADMIN" },
        include: { organization: true },
      });

      if (!devUser) {
        const passwordHash = await hashPassword("Admin1234!");
        devUser = await db.user.create({
          data: {
            name: "Demo Boss",
            email: "boss@sunrise-bistro.local",
            passwordHash,
            role: "ADMIN",
            isActive: true,
          },
        });
      }

      userId = devUser.id;
      orgId = devUser.organizationId;
    }

    // Ensure Organization exists
    let org = null;
    if (orgId) {
      org = await db.organization.findUnique({ where: { id: orgId } });
    }

    if (!org) {
      org = await db.organization.create({
        data: {
          name: "Sunrise Bistro & Dining",
          slug: `sunrise-bistro-${Date.now().toString(36)}`,
          currency: "FCFA",
        },
      });
      orgId = org.id;

      await db.user.update({
        where: { id: userId },
        data: { organizationId: org.id },
      });
    }

    // Ensure Default Account exists
    let account = await db.account.findFirst({
      where: { organizationId: org.id, isDefault: true },
    });
    if (!account) {
      account = await db.account.create({
        data: {
          name: "Main Cash Drawer",
          type: "CURRENT",
          balance: 250000,
          isDefault: true,
          organizationId: org.id,
          userId,
        },
      });
    }

    // Ensure Restaurant Department exists
    let department = await db.department.findFirst({
      where: { organizationId: org.id, domain: "RESTAURANT" },
    });
    if (!department) {
      department = await db.department.create({
        data: {
          name: "Main Restaurant",
          description: "Primary dining hall, grill and kitchen operations",
          domain: "RESTAURANT",
          organizationId: org.id,
        },
      });
    }

    // Ensure primary user department membership
    await db.userDepartment.upsert({
      where: {
        userId_departmentId: { userId, departmentId: department.id },
      },
      update: { isPrimary: true, isActive: true },
      create: {
        userId,
        departmentId: department.id,
        isPrimary: true,
        isActive: true,
      },
    });

    // Seed Stock Items
    const stockDefinitions = [
      { name: "Fresh Chicken (kg)", unit: "kg", qty: 45, cost: 2200 },
      { name: "Beef Steak Cut (kg)", unit: "kg", qty: 30, cost: 3500 },
      { name: "Basmati Rice (25kg bag)", unit: "bag", qty: 6, cost: 18500 },
      { name: "Cooking Oil (5L)", unit: "bottle", qty: 12, cost: 6500 },
      { name: "Ripe Plantain (Regime)", unit: "piece", qty: 15, cost: 3000 },
      { name: "Seasoning & Spices Pack", unit: "pack", qty: 25, cost: 1500 },
    ];

    const stockItemMap = {};
    for (const def of stockDefinitions) {
      const item = await db.departmentStockItem.upsert({
        where: {
          departmentId_name: { departmentId: department.id, name: def.name },
        },
        update: {
          openingQuantity: def.qty,
          currentQuantity: def.qty,
          valuationUnitCost: def.cost,
        },
        create: {
          name: def.name,
          unit: def.unit,
          openingQuantity: def.qty,
          currentQuantity: def.qty,
          valuationUnitCost: def.cost,
          organizationId: org.id,
          departmentId: department.id,
          userId,
        },
      });
      stockItemMap[def.name] = item;
    }

    // Seed Menu Dishes (both Direct Plate mode and Recipe mode)
    const menuDefinitions = [
      {
        name: "Grilled Chicken & Alloco Plate",
        sellingPrice: 4500,
        costPrice: 2000,
        inventoryMode: "DIRECT_PLATE",
        plates: 35,
      },
      {
        name: "Braised Beef Tenderloin & Rice",
        sellingPrice: 5500,
        costPrice: 2400,
        inventoryMode: "DIRECT_PLATE",
        plates: 28,
      },
      {
        name: "Fried Fish Brochette Special",
        sellingPrice: 4000,
        costPrice: 1800,
        inventoryMode: "DIRECT_PLATE",
        plates: 20,
      },
      {
        name: "Chef Fried Rice Large",
        sellingPrice: 3000,
        costPrice: 1200,
        inventoryMode: "DIRECT_PLATE",
        plates: 40,
      },
    ];

    const menuItems = [];
    for (const def of menuDefinitions) {
      const dish = await db.menuItem.upsert({
        where: {
          departmentId_name: { departmentId: department.id, name: def.name },
        },
        update: {
          sellingPrice: def.sellingPrice,
          costPrice: def.costPrice,
          inventoryMode: def.inventoryMode,
          openingQuantity: def.plates,
          currentQuantity: def.plates,
        },
        create: {
          name: def.name,
          sellingPrice: def.sellingPrice,
          costPrice: def.costPrice,
          inventoryMode: def.inventoryMode,
          openingQuantity: def.plates,
          currentQuantity: def.plates,
          organizationId: org.id,
          departmentId: department.id,
          userId,
        },
      });
      menuItems.push(dish);
    }

    // Seed recent purchases, sales, debt, and cash handover for realistic metrics
    const today = new Date();
    const yesterday = subDays(today, 1);

    // 1. A Purchase yesterday
    const purchase = await db.purchase.create({
      data: {
        organizationId: org.id,
        departmentId: department.id,
        userId,
        supplierName: "Agro-Market Fresh",
        reference: "INV-2026-081",
        paymentMethod: "CASH",
        totalAmount: 48000,
        date: yesterday,
        notes: "Restock of chicken and plantains",
        lines: {
          create: [
            {
              stockItemId: stockItemMap["Fresh Chicken (kg)"]?.id,
              quantity: 15,
              unitCost: 2200,
              totalCost: 33000,
            },
            {
              stockItemId: stockItemMap["Ripe Plantain (Regime)"]?.id,
              quantity: 5,
              unitCost: 3000,
              totalCost: 15000,
            },
          ],
        },
      },
    });

    // 2. Sales with SaleLines
    const saleTx1 = await db.transaction.create({
      data: {
        type: "SALE",
        amount: 22500,
        grossAmount: 22500,
        discountAmount: 0,
        netAmount: 22500,
        paymentMethod: "CASH",
        customerName: "Table 4 Dining Guests",
        operationCategory: "SALE_FOOD",
        description: "Lunch service order",
        date: today,
        category: "sale-food",
        organizationId: org.id,
        departmentId: department.id,
        userId,
        accountId: account.id,
        saleLines: {
          create: [
            {
              menuItemId: menuItems[0].id,
              quantity: 3,
              unitPrice: 4500,
              totalAmount: 13500,
              organizationId: org.id,
              departmentId: department.id,
              userId,
            },
            {
              menuItemId: menuItems[3].id,
              quantity: 3,
              unitPrice: 3000,
              totalAmount: 9000,
              organizationId: org.id,
              departmentId: department.id,
              userId,
            },
          ],
        },
      },
    });

    // 3. A Credit Sale creating Debt
    const creditTx = await db.transaction.create({
      data: {
        type: "SALE",
        amount: 15000,
        grossAmount: 16500,
        discountAmount: 1500,
        netAmount: 15000,
        paymentMethod: "CREDIT",
        customerName: "Dr. Amadou Traore",
        isDebtPaid: false,
        operationCategory: "SALE_FOOD",
        description: "Dinner VIP credit order",
        date: today,
        category: "sale-food",
        organizationId: org.id,
        departmentId: department.id,
        userId,
        saleLines: {
          create: [
            {
              menuItemId: menuItems[1].id,
              quantity: 3,
              unitPrice: 5500,
              totalAmount: 16500,
              discountAmount: 1500,
              organizationId: org.id,
              departmentId: department.id,
              userId,
            },
          ],
        },
      },
    });

    const debt = await db.debt.create({
      data: {
        debtorName: "Dr. Amadou Traore",
        debtorContact: "+237 670 000 111",
        foodDescription: "3 x Braised Beef Tenderloin & Rice",
        amountOwed: 15000,
        amountPaid: 5000,
        status: "PARTIALLY_PAID",
        date: today,
        transactionId: creditTx.id,
        organizationId: org.id,
        departmentId: department.id,
        userId,
        payments: {
          create: {
            amount: 5000,
            paymentMethod: "MOMO",
            reference: "MTN-MOMO-9812",
            date: today,
            organizationId: org.id,
            departmentId: department.id,
            userId,
          },
        },
      },
    });

    // 4. Cash Handover to CEO
    await db.cashHandover.create({
      data: {
        amount: 20000,
        recipientName: "CEO",
        reference: "Mid-day deposit receipt #041",
        date: today,
        organizationId: org.id,
        departmentId: department.id,
        userId,
        accountId: account.id,
      },
    });

    return {
      success: true,
      message: "Seeded restaurant operations successfully with realistic catalog, dishes, stock, sales, and debt.",
      organizationName: org.name,
      departmentName: department.name,
    };
  } catch (error) {
    console.error("Seed error:", error);
    return { success: false, error: error.message };
  }
}
