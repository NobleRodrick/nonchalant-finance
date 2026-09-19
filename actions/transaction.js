"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const serializeAmount = (obj) => {
  if (!obj) return obj;
  return {
    ...obj,
    amount: Number(obj.amount || 0),
    grossAmount: obj.grossAmount ? Number(obj.grossAmount) : null,
    discountAmount: obj.discountAmount ? Number(obj.discountAmount) : 0,
    netAmount: obj.netAmount ? Number(obj.netAmount) : Number(obj.amount || 0),
  };
};

// Create Standard Transaction (Purchases, Operating Expenses, Sales, Other Income)
export async function createTransaction(data) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");
    if (!user.organizationId) throw new Error("User has no associated organization");

    // Enforce employee department scoping
    let targetDepartmentId = data.departmentId;
    if (user.role !== "ADMIN" && user.departmentId) {
      targetDepartmentId = user.departmentId;
    }

    if (!targetDepartmentId) {
      const defaultDept = await db.department.findFirst({
        where: { organizationId: user.organizationId },
      });
      targetDepartmentId = defaultDept?.id || null;
    }

    let account = null;
    if (data.accountId) {
      account = await db.account.findFirst({
        where: { id: data.accountId, organizationId: user.organizationId },
      });
      if (!account) throw new Error("Invalid account for this organization");
      if (
        user.role !== "ADMIN" &&
        user.departmentId &&
        account.departmentId &&
        account.departmentId !== user.departmentId
      ) {
        throw new Error("Account is not in your authorized department");
      }
    }

    const type = data.type || "EXPENSE";
    const grossAmount = data.grossAmount ? parseFloat(data.grossAmount) : parseFloat(data.amount);
    const discountAmount = data.discountAmount ? parseFloat(data.discountAmount) : 0;
    const netAmount = data.netAmount
      ? parseFloat(data.netAmount)
      : Math.max(0, grossAmount - discountAmount);
    const effectiveAmount = type === "SALE" ? netAmount : parseFloat(data.amount);
    const paymentMethod = data.paymentMethod || "CASH";

    const transaction = await db.$transaction(async (tx) => {
      const newTransaction = await tx.transaction.create({
        data: {
          type,
          amount: effectiveAmount,
          grossAmount: type === "SALE" ? grossAmount : null,
          discountAmount: discountAmount,
          netAmount: type === "SALE" ? netAmount : null,
          paymentMethod,
          customerName: data.customerName || null,
          isDebtPaid: paymentMethod === "CREDIT" ? false : true,
          operationCategory: data.operationCategory || null,
          description: data.description || "",
          category: data.category,
          date: data.date ? new Date(data.date) : new Date(),
          receiptUrl: data.receiptUrl || null,
          organizationId: user.organizationId,
          departmentId: targetDepartmentId,
          userId: user.id,
          accountId: data.accountId || null,
        },
      });

      // Update account balance
      if (data.accountId && account) {
        let balanceChange = 0;
        if (type === "EXPENSE" || type === "PURCHASE") {
          balanceChange = -effectiveAmount;
        } else if (type === "SALE" || type === "INCOME") {
          // For credit sales, cash doesn't enter account until collected
          if (paymentMethod !== "CREDIT") {
            balanceChange = effectiveAmount;
          }
        }

        if (balanceChange !== 0) {
          await tx.account.update({
            where: { id: data.accountId },
            data: { balance: { increment: balanceChange } },
          });
        }
      }

      return newTransaction;
    });

    revalidatePath("/dashboard");
    revalidatePath("/reports");

    return { success: true, data: serializeAmount(transaction) };
  } catch (error) {
    console.error("Create transaction error:", error);
    throw new Error(error.message);
  }
}

export async function createSaleTransaction(data) {
  return recordDailySale(data);
}

// Specialized Action: Record Daily Sales (Cash vs Credit vs Discounts)
export async function recordDailySale(data) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");
    if (!user.organizationId) throw new Error("User has no associated organization");

    let targetDepartmentId = data.departmentId;
    if (user.role !== "ADMIN" && user.departmentId) {
      targetDepartmentId = user.departmentId;
    }
    if (!targetDepartmentId) {
      const defaultDept = await db.department.findFirst({
        where: { organizationId: user.organizationId },
      });
      targetDepartmentId = defaultDept?.id || null;
    }

    const grossSales = parseFloat(data.grossSales || 0);
    const discounts = parseFloat(data.discounts || 0);
    const cashSales = parseFloat(data.cashSales || 0);
    const creditSales = parseFloat(data.creditSales || 0);
    const otherIncome = parseFloat(data.otherIncome || 0);
    const netSales = Math.max(0, grossSales - discounts);

    if (grossSales <= 0 && otherIncome <= 0) {
      throw new Error("Total sales or other income must be greater than 0");
    }

    if (creditSales > 0 && !String(data.customerName || "").trim()) {
      throw new Error("Customer name is required for credit sales");
    }

    const operationCategory = data.operationCategory ||
      (data.category?.startsWith("sale-") ? data.category.replace("sale-", "SALE_").toUpperCase() : "SALE_FOOD");

    const txDate = data.date ? new Date(data.date) : new Date();

    const createdRecords = await db.$transaction(async (tx) => {
      const results = [];

      // 1. If there are Cash Sales:
      if (cashSales > 0 || (grossSales > 0 && creditSales === 0)) {
        const cashPortion = cashSales > 0 ? cashSales : netSales;
        const cashTx = await tx.transaction.create({
          data: {
            type: "SALE",
            amount: cashPortion,
            grossAmount: cashSales > 0 ? cashSales + (creditSales === 0 ? discounts : 0) : grossSales,
            discountAmount: creditSales === 0 ? discounts : 0,
            netAmount: cashPortion,
            paymentMethod: "CASH",
            category: data.category || "sale-food",
            operationCategory: operationCategory,
            description: data.description ? `${data.description} (Cash Sales)` : "Daily Cash Sales",
            date: txDate,
            organizationId: user.organizationId,
            departmentId: targetDepartmentId,
            userId: user.id,
            accountId: data.accountId || null,
            isDebtPaid: true,
          },
        });
        results.push(cashTx);

        // Increment cash account if provided
        if (data.accountId) {
          await tx.account.update({
            where: { id: data.accountId },
            data: { balance: { increment: cashPortion } },
          });
        }
      }

      // 2. If there are Credit / Debt Sales:
      if (creditSales > 0) {
        const creditTx = await tx.transaction.create({
          data: {
            type: "SALE",
            amount: creditSales,
            grossAmount: creditSales,
            discountAmount: cashSales === 0 ? discounts : 0,
            netAmount: creditSales,
            paymentMethod: "CREDIT",
            customerName: data.customerName || "Customer on Credit",
            category: data.category || "sale-food",
            operationCategory: operationCategory,
            description: data.description
              ? `${data.description} (Credit Sales to: ${data.customerName || "Customer"})`
              : `Credit/Debt Sale - ${data.customerName || "Customer"}`,
            date: txDate,
            organizationId: user.organizationId,
            departmentId: targetDepartmentId,
            userId: user.id,
            accountId: data.accountId || null,
            isDebtPaid: false,
          },
        });
        results.push(creditTx);
      }

      // 3. If there is Other Income:
      if (otherIncome > 0) {
        const otherTx = await tx.transaction.create({
          data: {
            type: "INCOME",
            amount: otherIncome,
            grossAmount: otherIncome,
            netAmount: otherIncome,
            paymentMethod: "CASH",
            category: "other-income",
            description: data.otherIncomeDescription || "Other Income",
            date: txDate,
            organizationId: user.organizationId,
            departmentId: targetDepartmentId,
            userId: user.id,
            accountId: data.accountId || null,
            isDebtPaid: true,
          },
        });
        results.push(otherTx);

        if (data.accountId) {
          await tx.account.update({
            where: { id: data.accountId },
            data: { balance: { increment: otherIncome } },
          });
        }
      }

      return results;
    });

    revalidatePath("/dashboard");
    revalidatePath("/reports");

    return {
      success: true,
      data: createdRecords.map(serializeAmount),
      summary: {
        grossSales,
        discounts,
        netSales,
        cashSales,
        creditSales,
        otherIncome,
      },
    };
  } catch (error) {
    console.error("Record daily sale error:", error);
    return { success: false, error: error.message };
  }
}

// Mark Outstanding Customer Debt as Paid
export async function markDebtPaid(transactionId, accountId = null) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const txRecord = await db.transaction.findUnique({
      where: { id: transactionId, organizationId: user.organizationId },
    });

    if (!txRecord) throw new Error("Transaction not found");
    if (txRecord.paymentMethod !== "CREDIT") throw new Error("This is not a credit sale");
    if (txRecord.isDebtPaid) return { success: true, message: "Debt already marked as paid" };

    await db.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transactionId },
        data: { isDebtPaid: true },
      });

      const targetAccount = accountId || txRecord.accountId;
      if (targetAccount) {
        await tx.account.update({
          where: { id: targetAccount },
          data: { balance: { increment: Number(txRecord.amount) } },
        });
      }
    });

    revalidatePath("/dashboard");
    revalidatePath("/reports");

    return { success: true };
  } catch (error) {
    console.error("Mark debt paid error:", error);
    return { success: false, error: error.message };
  }
}

export async function getTransaction(id) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const whereClause = {
    id,
    organizationId: user.organizationId,
  };

  if (user.role !== "ADMIN" && user.departmentId) {
    whereClause.departmentId = user.departmentId;
  }

  const transaction = await db.transaction.findFirst({
    where: whereClause,
    include: {
      department: true,
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!transaction) throw new Error("Transaction not found");

  return serializeAmount(transaction);
}

export async function updateTransaction(id, data) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const originalTransaction = await db.transaction.findUnique({
      where: {
        id,
        organizationId: user.organizationId,
      },
    });

    if (!originalTransaction) throw new Error("Transaction not found");

    if (user.role !== "ADMIN" && user.departmentId) {
      if (originalTransaction.departmentId !== user.departmentId) {
        throw new Error("Unauthorized to edit this transaction");
      }
    }

    const targetDepartmentId =
      user.role === "ADMIN"
        ? data.departmentId || originalTransaction.departmentId
        : user.departmentId || originalTransaction.departmentId;

    const amountFloat = parseFloat(data.amount);
    const grossAmount = data.grossAmount ? parseFloat(data.grossAmount) : amountFloat;
    const discountAmount = data.discountAmount ? parseFloat(data.discountAmount) : 0;
    const netAmount = data.netAmount ? parseFloat(data.netAmount) : amountFloat;

    const transaction = await db.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          type: data.type,
          amount: amountFloat,
          grossAmount,
          discountAmount,
          netAmount,
          paymentMethod: data.paymentMethod || originalTransaction.paymentMethod,
          customerName: data.customerName || originalTransaction.customerName,
          description: data.description || "",
          category: data.category,
          date: data.date ? new Date(data.date) : new Date(),
          departmentId: targetDepartmentId,
        },
      });

      return updated;
    });

    revalidatePath("/dashboard");
    revalidatePath("/reports");

    return { success: true, data: serializeAmount(transaction) };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function getUserTransactions(query = {}) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const whereClause = {
      organizationId: user.organizationId,
      ...query,
    };

    if (user.role !== "ADMIN" && user.departmentId) {
      whereClause.departmentId = user.departmentId;
    }

    const transactions = await db.transaction.findMany({
      where: whereClause,
      include: {
        department: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { date: "desc" },
    });

    return { success: true, data: transactions.map(serializeAmount) };
  } catch (error) {
    throw new Error(error.message);
  }
}

const NOT_A_RECEIPT =
  "Could not read a receipt from this image. Please try a clearer photo of a receipt.";

// Scan Receipt with Gemini AI
export async function scanReceipt(file) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

    const arrayBuffer = await file.arrayBuffer();
    const base64String = Buffer.from(arrayBuffer).toString("base64");

    const prompt = `
      Analyze this restaurant or business purchase receipt / invoice and extract the following in JSON:
      - Total amount (number only, no currency symbol or thousands separator)
      - Date (in ISO format)
      - Description (brief summary of items purchased)
      - Merchant/supplier name
      - Suggested type: "PURCHASE" (if food/drink materials like meat, rice, drinks, vegetables) or "EXPENSE" (if utilities, transport, repairs, cleaning)
      - Suggested category (e.g. purchase-meat, purchase-fish, purchase-vegetables, purchase-rice-grains, purchase-oil-spices, purchase-drinks-stock, purchase-other-materials, opex-transport, opex-electricity, opex-repairs, opex-cleaning, opex-other)
      
      Only respond with valid JSON:
      {
        "amount": number,
        "date": "ISO date string",
        "description": "string",
        "merchantName": "string",
        "type": "PURCHASE" | "EXPENSE",
        "category": "string"
      }
    `;

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      },
      prompt,
    ]);

    const response = await result.response;
    const text = response.text();
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();

    let data;
    try {
      data = JSON.parse(cleanedText);
    } catch {
      console.error("Receipt scan: model response was not valid JSON:", cleanedText);
      return { success: false, error: NOT_A_RECEIPT };
    }

    const amount = parseFloat(data?.amount);
    const date = new Date(data?.date);
    if (isNaN(amount) || isNaN(date.getTime())) {
      return { success: false, error: NOT_A_RECEIPT };
    }

    return {
      success: true,
      data: {
        amount,
        date,
        description: data.description,
        type: data.type || "PURCHASE",
        category: data.category || "purchase-other-materials",
        merchantName: data.merchantName,
      },
    };
  } catch (error) {
    console.error("Error scanning receipt:", error);
    return { success: false, error: "Failed to scan receipt. Please try again." };
  }
}
