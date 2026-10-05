"use server";

import { db } from "@/lib/prisma";
import { runAction } from "@/lib/action";
import { PERMISSIONS } from "@/lib/permissions";
import { departmentContext, operation } from "@/lib/action-context";

/**
 * The department head hands cash over to the Boss, optionally answering one of his cash requests
 * (never more than the drawer should hold). The Boss himself cannot record handovers.
 */
export async function recordHandover(input) {
  return runAction("recordHandover", () => operation("handover.record", input));
}

/** The Boss confirms he received the cash, or disputes the amount (a disputed handover does not count). */
export async function reviewHandover(input) {
  return runAction("reviewHandover", () => operation("handover.review", input));
}

/** Handovers of one department (newest first). */
export async function listHandovers({ departmentId }) {
  const res = await runAction("listHandovers", async () => {
    const ctx = await departmentContext(departmentId, { permission: PERMISSIONS.DEPARTMENT_READ, read: true });
    return db.cashHandover.findMany({
      where: { departmentId: ctx.department.id },
      include: { user: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 100,
    });
  });
  return res.success ? res.data : [];
}
