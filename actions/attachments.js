"use server";

import { db } from "@/lib/prisma";
import { runAction } from "@/lib/action";
import { requireOrgUser, resolveDepartment } from "@/lib/access";
import { storeAttachment } from "@/lib/attachments";

/**
 * Uploads a proof file (receipt, handover slip). The file is stored unlinked; the record then
 * passes its id, and the operation links it to the created record. (Devices use POST /api/attachments.)
 */
export async function uploadAttachment(formData) {
  return runAction("uploadAttachment", async () => {
    const user = await requireOrgUser();
    const { departmentId } = await resolveDepartment(user, formData?.get?.("departmentId") || null);
    return storeAttachment(db, { user, departmentId, file: formData?.get?.("file") });
  });
}
