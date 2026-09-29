"use server";

import { db } from "@/lib/prisma";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/access";

/** Marks one notification (or all when no id) as read for the current user. */
export async function markNotificationsRead({ id = null } = {}) {
  return runAction("markNotificationsRead", async () => {
    const user = await requireUser();
    const res = await db.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
    // No page refresh: the bell updates itself, and a refresh here would race the navigation
    // the click starts.
    return { updated: res.count };
  });
}
