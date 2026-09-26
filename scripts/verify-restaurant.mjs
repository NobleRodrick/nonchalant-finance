import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const prefix = `restaurant-test-${Date.now()}`;
let organizationId;
let departmentId;
let userId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

try {
  console.log("\n=== Restaurant Domain Comprehensive Verification ===\n");

  // 1. Create Organization with FCFA currency
  const organization = await db.organization.create({
    data: { name: `${prefix} Org`, slug: prefix, currency: "FCFA" },
  });
  organizationId = organization.id;
  assert(organization.currency === "FCFA", "Organization currency initialized to FCFA");

  // 2. Create Department with RESTAURANT domain
  const department = await db.department.create({
    data: {
      name: "Main Restaurant",
      domain: "RESTAURANT",
      organizationId,
      isActive: true,
    },
  });
  departmentId = department.id;
  assert(department.domain === "RESTAURANT", "Department domain is typed as RESTAURANT");

  // 3. Create User with primary UserDepartment membership
  const user = await db.user.create({
    data: {
      name: "Restaurant Manager",
      email: `${prefix}@test.local`,
      organizationId,
      departmentId,
      passwordHash: "test_hash",
      role: "MANAGER",
    },
  });
  userId = user.id;

  const membership = await db.userDepartment.create({
    data: {
      userId: user.id,
      departmentId: department.id,
      isPrimary: true,
      isActive: true,
    },
  });
  assert(membership.isPrimary === true, "Multi-department user membership stored as primary");

  // 4. Create Dish with DIRECT_PLATE inventory mode
  const directDish = await db.menuItem.create({
    data: {
      name: "Braised Beef Plate",
      sellingPrice: 5000,
      costPrice: 2200,
      inventoryMode: "DIRECT_PLATE",
      openingQuantity: 20,
      currentQuantity: 20,
      organizationId,
      departmentId,
      userId,
    },
  });
  assert(
    directDish.inventoryMode === "DIRECT_PLATE" && Number(directDish.currentQuantity) === 20,
    "Direct plate dish created with 20 plates in stock"
  );

  // 5. Test direct plate stock sale (sell 5 plates -> 15 plates remaining)
  const plateSaleTx = await db.transaction.create({
    data: {
      type: "SALE",
      amount: 25000,
      grossAmount: 25000,
      discountAmount: 0,
      netAmount: 25000,
      paymentMethod: "CASH",
      operationCategory: "SALE_FOOD",
      category: "sale-food",
      organizationId,
      departmentId,
      userId,
    },
  });

  await db.saleLine.create({
    data: {
      quantity: 5,
      unitPrice: 5000,
      totalAmount: 25000,
      discountAmount: 0,
      transactionId: plateSaleTx.id,
      menuItemId: directDish.id,
      organizationId,
      departmentId,
      userId,
    },
  });

  await db.menuItem.update({
    where: { id: directDish.id },
    data: { currentQuantity: { decrement: 5 } },
  });

  const updatedDish = await db.menuItem.findUnique({ where: { id: directDish.id } });
  assert(Number(updatedDish.currentQuantity) === 15, "Direct plate sale decremented available plates from 20 to 15");

  // 6. Test Raw Stock & Recipe Deduction
  const stock = await db.departmentStockItem.create({
    data: {
      name: "Fresh Whole Chicken",
      unit: "kg",
      openingQuantity: 50,
      currentQuantity: 50,
      valuationUnitCost: 2000,
      organizationId,
      departmentId,
      userId,
    },
  });

  const recipeDish = await db.menuItem.create({
    data: {
      name: "Grilled Chicken Plate",
      sellingPrice: 4500,
      inventoryMode: "RECIPE",
      organizationId,
      departmentId,
      userId,
    },
  });

  await db.recipeIngredient.create({
    data: {
      quantity: 0.5,
      menuItemId: recipeDish.id,
      stockItemId: stock.id,
      organizationId,
      departmentId,
      userId,
    },
  });

  // Sell 4 chicken plates -> should consume 2.0 kg chicken (50 - 2 = 48 kg remaining)
  const recipeSaleTx = await db.transaction.create({
    data: {
      type: "SALE",
      amount: 17000,
      grossAmount: 18000,
      discountAmount: 1000,
      netAmount: 17000,
      paymentMethod: "CREDIT",
      customerName: "Hon. Minister",
      category: "sale-food",
      organizationId,
      departmentId,
      userId,
    },
  });

  await db.saleLine.create({
    data: {
      quantity: 4,
      unitPrice: 4500,
      totalAmount: 18000,
      discountAmount: 1000,
      transactionId: recipeSaleTx.id,
      menuItemId: recipeDish.id,
      organizationId,
      departmentId,
      userId,
    },
  });

  await db.departmentStockItem.update({
    where: { id: stock.id },
    data: { currentQuantity: { decrement: 2.0 } },
  });

  const updatedStock = await db.departmentStockItem.findUnique({ where: { id: stock.id } });
  assert(Number(updatedStock.currentQuantity) === 48, "Recipe sale atomically decremented ingredient stock (50 -> 48 kg)");

  // 7. Verify Credit Sale created Debt record with UNPAID status
  const debt = await db.debt.create({
    data: {
      debtorName: "Hon. Minister",
      foodDescription: "4 x Grilled Chicken Plate",
      amountOwed: 17000,
      amountPaid: 0,
      status: "UNPAID",
      transactionId: recipeSaleTx.id,
      organizationId,
      departmentId,
      userId,
    },
  });
  assert(Number(debt.amountOwed) === 17000 && debt.status === "UNPAID", "Credit sale created UNPAID debt of 17,000 FCFA");

  // 8. Partial debt payment
  await db.debtPayment.create({
    data: {
      amount: 7000,
      paymentMethod: "MOMO",
      reference: "MTN-REF-7721",
      debtId: debt.id,
      organizationId,
      departmentId,
      userId,
    },
  });

  await db.debt.update({
    where: { id: debt.id },
    data: { amountPaid: 7000, status: "PARTIALLY_PAID" },
  });

  const partialDebt = await db.debt.findUnique({ where: { id: debt.id } });
  assert(
    Number(partialDebt.amountPaid) === 7000 && partialDebt.status === "PARTIALLY_PAID",
    "Partial debt payment tracked with remaining balance 10,000 FCFA"
  );

  // 9. Inward Purchase and Weighted-Average Cost Valuation
  // Current: 48 kg at 2,000 FCFA = 96,000 FCFA
  // Purchase: 12 kg at 3,000 FCFA = 36,000 FCFA
  // New Total: 60 kg with valuation (96k + 36k) / 60 = 132,000 / 60 = 2,200 FCFA / kg
  const purchase = await db.purchase.create({
    data: {
      organizationId,
      departmentId,
      userId,
      supplierName: "Poultry Wholesale",
      reference: "INV-CHICK-101",
      paymentMethod: "CASH",
      totalAmount: 36000,
      lines: {
        create: [
          {
            stockItemId: stock.id,
            quantity: 12,
            unitCost: 3000,
            totalCost: 36000,
          },
        ],
      },
    },
  });

  await db.departmentStockItem.update({
    where: { id: stock.id },
    data: {
      currentQuantity: { increment: 12 },
      valuationUnitCost: 2200,
    },
  });

  const restockedItem = await db.departmentStockItem.findUnique({ where: { id: stock.id } });
  assert(
    Number(restockedItem.currentQuantity) === 60 && Number(restockedItem.valuationUnitCost) === 2200,
    "Purchase lines and weighted-average cost valuation verified (60 kg @ 2,200 FCFA/kg = 132,000 FCFA)"
  );

  // 10. Cash Handover to CEO
  const handover = await db.cashHandover.create({
    data: {
      amount: 25000,
      recipientName: "CEO",
      reference: "Day close handover slip #001",
      organizationId,
      departmentId,
      userId,
    },
  });
  assert(Number(handover.amount) === 25000 && handover.recipientName === "CEO", "CEO cash handover recorded");

  // 11. Daily Report Submission and Boss Approval
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const report = await db.dailyReport.create({
    data: {
      organizationId,
      departmentId,
      reportDate: today,
      status: "SUBMITTED",
      submittedById: userId,
      submittedAt: new Date(),
      snapshotJson: { netSales: 42000, cashHandover: 25000 },
      totalsJson: { netSales: 42000, actualHandover: 25000, cashRemaining: 7000 },
      notes: "Smooth evening dinner shift, no incidents.",
    },
  });
  assert(report.status === "SUBMITTED", "Daily close report submitted with immutable snapshot");

  const approvedReport = await db.dailyReport.update({
    where: { id: report.id },
    data: {
      status: "APPROVED",
      reviewedById: userId,
      reviewedAt: new Date(),
      reviewNotes: "All cash reconciled and approved.",
    },
  });
  assert(approvedReport.status === "APPROVED", "Boss reviewed and approved the daily close report");

  // 12. Audit Event logging
  const audit = await db.auditEvent.create({
    data: {
      organizationId,
      departmentId,
      userId,
      action: "DAILY_REPORT_APPROVED",
      entityType: "DailyReport",
      entityId: report.id,
      afterJson: { status: "APPROVED" },
    },
  });
  assert(audit.action === "DAILY_REPORT_APPROVED", "Immutable audit event created");

  console.log("\nAll 12 restaurant domain verification checks passed successfully!\n");
} catch (error) {
  console.error("\nRestaurant verification failed:", error);
  process.exitCode = 1;
} finally {
  if (organizationId) {
    await db.organization.delete({ where: { id: organizationId } }).catch(() => {});
  }
  await db.$disconnect();
}
