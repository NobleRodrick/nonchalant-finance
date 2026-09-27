"use server";

import { runAction } from "@/lib/action";
import { requireOrgUser, readableDepartmentIds } from "@/lib/access";
import { notFound } from "@/lib/errors";
import { recordDetail } from "@/lib/history";

/** One record with its lines, links, attachments and audit trail (for the detail drawer). */
export async function getRecordDetail({ kind, id }) {
  return runAction("getRecordDetail", async () => {
    const user = await requireOrgUser();
    const detail = await recordDetail({ organizationId: user.organizationId, kind: kind === "stock" ? "stock" : "money", id });
    if (!detail) throw notFound("Record not found.");
    const allowed = await readableDepartmentIds(user);
    if (!allowed.includes(detail.record.departmentId)) throw notFound("Record not found.");
    return detail;
  });
}
