"use server";

import { db } from "@/lib/prisma";
import { runAction } from "@/lib/action";
import { requireOrgUser, resolveDepartment } from "@/lib/access";
import { readValidatedFile } from "@/lib/attachments";

/**
 * Uploads a proof file (receipt, handover slip). The file is stored unlinked; the form then
 * passes its id to the financial action, which links it to the created record.
 */
export async function uploadAttachment(formData) {
  return runAction("uploadAttachment", async () => {
    const user = await requireOrgUser();
    const departmentId = formData?.get?.("departmentId") || null;
    const { departmentId: deptId } = await resolveDepartment(user, departmentId);
    const file = await readValidatedFile(formData?.get?.("file"));
    const created = await db.attachment.create({
      data: {
        organizationId: user.organizationId,
        departmentId: deptId,
        uploadedById: user.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        data: file.data,
      },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
    });
    return created;
  });
}
