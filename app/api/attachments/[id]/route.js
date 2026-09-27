import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { accessibleDepartmentIds } from "@/lib/access";

/** Serves a proof file only to users of the same organization with access to its department. */
export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  if (!user?.organizationId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const file = await db.attachment.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!file) return new Response("Not found", { status: 404 });
  if (user.role !== "ADMIN" && file.departmentId) {
    const allowed = await accessibleDepartmentIds(user);
    if (!allowed.includes(file.departmentId)) return new Response("Not found", { status: 404 });
  }
  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
