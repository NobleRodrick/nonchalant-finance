import { serialize } from "@/lib/serialize";

/**
 * Writes an immutable audit event. Pass the Prisma transaction client so the audit row
 * commits or rolls back together with the change it describes.
 */
export async function recordAudit(client, { user, organizationId, departmentId, action, entityType, entityId, before, after }) {
  return client.auditEvent.create({
    data: {
      organizationId: organizationId || user.organizationId,
      departmentId: departmentId || null,
      userId: user?.id || null,
      action,
      entityType,
      entityId,
      beforeJson: before === undefined ? undefined : serialize(before),
      afterJson: after === undefined ? undefined : serialize(after),
    },
  });
}
