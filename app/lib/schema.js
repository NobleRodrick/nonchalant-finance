import { z } from "zod";

export const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["CURRENT", "SAVINGS"]),
  balance: z.string().min(1, "Initial balance is required"),
  isDefault: z.boolean().default(false),
  departmentId: z.string().optional(),
});

export const transactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE", "SALE", "PURCHASE", "DISCOUNT"]),
    amount: z.string().min(1, "Amount is required"),
    grossAmount: z.string().optional(),
    discountAmount: z.string().optional(),
    netAmount: z.string().optional(),
    paymentMethod: z.enum(["CASH", "CREDIT", "MOMO", "BANK_TRANSFER"]).default("CASH"),
    customerName: z.string().optional(),
    description: z.string().optional(),
    date: z.date({ required_error: "Date is required" }),
    departmentId: z.string().optional(),
    accountId: z.string().optional(),
    category: z.string().min(1, "Category is required"),
    isRecurring: z.boolean().default(false),
    recurringInterval: z
      .enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"])
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isRecurring && !data.recurringInterval) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurring interval is required for recurring transactions",
        path: ["recurringInterval"],
      });
    }
  });
