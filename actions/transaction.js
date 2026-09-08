"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const serializeAmount = (obj) => ({
  ...obj,
  amount: Number(obj.amount),
});

// Create Transaction
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
      // If admin didn't select, try finding the first department in the org
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

    const transaction = await db.$transaction(async (tx) => {
      const newTransaction = await tx.transaction.create({
        data: {
          type: data.type,
          amount: parseFloat(data.amount),
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

      // If an account was specified, update balance
      if (data.accountId && account) {
        const balanceChange = data.type === "EXPENSE" ? -parseFloat(data.amount) : parseFloat(data.amount);
        await tx.account.update({
          where: { id: data.accountId },
          data: { balance: { increment: balanceChange } },
        });
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

    const transaction = await db.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          type: data.type,
          amount: parseFloat(data.amount),
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
      Analyze this receipt or invoice image and extract the following information in JSON format:
      - Total amount (just the number, with no currency symbol or thousands separators; do not convert currencies)
      - Date (in ISO format)
      - Description or items purchased (brief summary)
      - Merchant/store/supplier name
      - Suggested category (one of: housing,transportation,groceries,utilities,entertainment,food,shopping,healthcare,education,personal,travel,insurance,gifts,bills,inventory,supplies,maintenance,other-expense)
      
      Only respond with valid JSON in this exact format:
      {
        "amount": number,
        "date": "ISO date string",
        "description": "string",
        "merchantName": "string",
        "category": "string"
      }

      If it's not a receipt or invoice, return an empty object
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
        category: data.category,
        merchantName: data.merchantName,
      },
    };
  } catch (error) {
    console.error("Error scanning receipt:", error);
    return { success: false, error: "Failed to scan receipt. Please try again." };
  }
}
