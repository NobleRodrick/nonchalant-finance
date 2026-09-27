"use server";

import { db } from "@/lib/prisma";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/access";
import { revalidateOperations } from "@/lib/transaction-runner";

/** Marks one notification (or all when no id) as read for the current user. */
export async function markNotificationsRead({ id = null } = {}) {
  return runAction("markNotificationsRead", async () => {
    const user = await requireUser();
    const res = await db.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
    revalidateOperations();
    return { updated: res.count };
  });
}
