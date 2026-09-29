import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { resolveDepartment } from "@/lib/access";
import { storeAttachment } from "@/lib/attachments";
import { ActionError } from "@/lib/errors";
import { logEvent, newErrorId } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Receives a proof file kept on a device with a record (the outbox uploads it just before sending
 * the record). A route, not a server action, so a page opened before a new deployment can still
 * send it. 4xx = the file is refused (the record is sent without it); 5xx = try again later.
 */
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user?.organizationId) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const form = await request.formData();
    const { departmentId } = await resolveDepartment(user, form.get("departmentId") || null);
    const file = await storeAttachment(db, { user, departmentId, file: form.get("file") });
    return Response.json(file, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ActionError) return Response.json({ error: error.message }, { status: 422 });
    const errorId = newErrorId();
    logEvent("error", { event: "attachment_upload_failed", errorId, userId: user.id, message: error?.message });
    return Response.json({ error: `The file could not be stored right now (reference ${errorId}).` }, { status: 500 });
  }
}
