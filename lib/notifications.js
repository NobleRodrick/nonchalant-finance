/**
 * In-app notifications. Written inside the transaction of the event they describe, so a
 * notification exists exactly when the event committed.
 */
import { db } from "@/lib/prisma";

/** Notifies every active Boss (ADMIN) of the organization. */
export async function notifyBosses(tx, { organizationId, departmentId = null, kind, title, body = null, href }) {
  const bosses = await tx.user.findMany({ where: { organizationId, role: "ADMIN", isActive: true }, select: { id: true } });
  if (!bosses.length) return 0;
  await tx.notification.createMany({
    data: bosses.map((b) => ({ organizationId, userId: b.id, departmentId, kind, title, body, href })),
  });
  return bosses.length;
}

/** Notifies specific users. */
export async function notifyUsers(tx, { organizationId, userIds, departmentId = null, kind, title, body = null, href }) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return 0;
  await tx.notification.createMany({
    data: ids.map((userId) => ({ organizationId, userId, departmentId, kind, title, body, href })),
  });
  return ids.length;
}

/** The heads of a department: every active person assigned to it. */
export async function departmentHeadIds(tx, departmentId) {
  const members = await tx.userDepartment.findMany({
    where: { departmentId, isActive: true, user: { isActive: true, role: "HEAD" } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

export async function unreadNotifications(userId, { take = 20 } = {}) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}
