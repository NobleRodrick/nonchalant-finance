"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const serializeDecimal = (obj) => {
  const serialized = { ...obj };
  if (obj.balance) {
    serialized.balance = Number(obj.balance);
  }
  if (obj.amount) {
    serialized.amount = Number(obj.amount);
  }
  return serialized;
};

export async function getAccountWithTransactions(accountId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const account = await db.account.findUnique({
    where: {
      id: accountId,
      organizationId: user.organizationId,
    },
    include: {
      transactions: {
        orderBy: { date: "desc" },
      },
      _count: {
        select: { transactions: true },
      },
    },
  });

  if (!account) return null;

  return {
    ...serializeDecimal(account),
    transactions: account.transactions.map(serializeDecimal),
  };
}

export async function bulkDeleteTransactions(transactionIds) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const transactions = await db.transaction.findMany({
      where: {
        id: { in: transactionIds },
        organizationId: user.organizationId,
      },
    });

    const accountBalanceChanges = transactions.reduce((acc, transaction) => {
      const amount = Number(transaction.amount);
      const change = transaction.type === "EXPENSE" ? amount : -amount;
      if (transaction.accountId) {
        acc[transaction.accountId] = (acc[transaction.accountId] || 0) + change;
      }
      return acc;
    }, {});

    await db.$transaction(async (tx) => {
      await tx.transaction.deleteMany({
        where: {
          id: { in: transactionIds },
          organizationId: user.organizationId,
        },
      });

      for (const [accountId, balanceChange] of Object.entries(
        accountBalanceChanges
      )) {
        await tx.account.update({
          where: { id: accountId },
          data: {
            balance: {
              increment: balanceChange,
            },
          },
        });
      }
    });

    revalidatePath("/dashboard");
    revalidatePath("/reports");

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateDefaultAccount(accountId) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    await db.account.updateMany({
      where: {
        organizationId: user.organizationId,
        isDefault: true,
      },
      data: { isDefault: false },
    });

    const account = await db.account.update({
      where: {
        id: accountId,
        organizationId: user.organizationId,
      },
      data: { isDefault: true },
    });

    revalidatePath("/dashboard");
    return { success: true, data: serializeDecimal(account) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
