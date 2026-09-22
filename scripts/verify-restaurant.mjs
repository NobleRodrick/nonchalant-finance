import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const prefix = `restaurant-test-${Date.now()}`;
let organizationId;
let departmentId;
let userId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  OK ${message}`);
}

try {
  console.log("\n=== Restaurant Domain Verification ===\n");
  const organization = await db.organization.create({ data: { name: `${prefix} Org`, slug: prefix } });
  organizationId = organization.id;
  const department = await db.department.create({ data: { name: "Restaurant", organizationId } });
  departmentId = department.id;
  const user = await db.user.create({ data: { name: "Restaurant Manager", email: `${prefix}@test.local`, organizationId, departmentId, passwordHash: "test" } });
  userId = user.id;

  const stock = await db.departmentStockItem.create({ data: { name: "Chicken", unit: "kg", openingQuantity: 100, currentQuantity: 100, organizationId, departmentId, userId } });
  const menu = await db.menuItem.create({ data: { name: "Chicken Plate", sellingPrice: 5000, organizationId, departmentId, userId } });
  await db.recipeIngredient.create({ data: { quantity: 0.25, menuItemId: menu.id, stockItemId: stock.id, organizationId, departmentId, userId } });
  assert(Number(menu.sellingPrice) === 5000, "menu selling price is stored");
  assert(Number((await db.recipeIngredient.findUnique({ where: { menuItemId_stockItemId: { menuItemId: menu.id, stockItemId: stock.id } } })).quantity) === 0.25, "recipe quantity is stored per plate");

  const transaction = await db.transaction.create({ data: { type: "SALE", amount: 9000, grossAmount: 10000, discountAmount: 1000, netAmount: 9000, paymentMethod: "CREDIT", customerName: "Test Customer", category: "sale-food", organizationId, departmentId, userId } });
  await db.saleLine.create({ data: { quantity: 2, unitPrice: 5000, totalAmount: 10000, discountAmount: 1000, transactionId: transaction.id, menuItemId: menu.id, organizationId, departmentId, userId } });
  await db.departmentStockItem.update({ where: { id: stock.id }, data: { currentQuantity: { decrement: 0.5 } } });
  await db.stockMovement.create({ data: { type: "USAGE", quantity: 0.5, stockItemId: stock.id, transactionId: transaction.id, organizationId, departmentId, userId } });
  const debt = await db.debt.create({ data: { debtorName: "Test Customer", foodDescription: "2 x Chicken Plate", amountOwed: 9000, transactionId: transaction.id, organizationId, departmentId, userId } });
  assert((await db.saleLine.count({ where: { transactionId: transaction.id } })) === 1, "itemized sale line is linked to the transaction");
  assert(Number((await db.departmentStockItem.findUnique({ where: { id: stock.id } })).currentQuantity) === 99.5, "recipe usage reduces stock by quantity sold");
  assert(Number(debt.amountOwed) === 9000 && debt.status === "UNPAID", "credit sale creates an unpaid debt");

  await db.debtPayment.create({ data: { amount: 4000, debtId: debt.id, organizationId, departmentId, userId } });
  await db.debt.update({ where: { id: debt.id }, data: { amountPaid: 4000, status: "PARTIALLY_PAID" } });
  const partialDebt = await db.debt.findUnique({ where: { id: debt.id } });
  assert(Number(partialDebt.amountPaid) === 4000 && partialDebt.status === "PARTIALLY_PAID", "partial debt payment is tracked");

  const handover = await db.cashHandover.create({ data: { amount: 4000, recipientName: "CEO", reference: "Daily close", organizationId, departmentId, userId } });
  assert(handover.recipientName === "CEO" && Number(handover.amount) === 4000, "CEO cash handover is recorded");
  console.log("\nAll restaurant domain checks passed.\n");
} catch (error) {
  console.error("\nRestaurant verification failed:", error.message);
  process.exitCode = 1;
} finally {
  if (organizationId) {
    await db.organization.delete({ where: { id: organizationId } }).catch(() => {});
  }
  await db.$disconnect();
}
