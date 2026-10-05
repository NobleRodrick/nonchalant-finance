import { db } from "@/lib/prisma";

/** The active heads of a department (for the Boss's view of any department type). */
export async function departmentTeam(departmentId, client = db) {
  const rows = await client.userDepartment.findMany({
    where: { departmentId, isActive: true, user: { isActive: true, role: "HEAD" } },
    select: { user: { select: { id: true, name: true, title: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => m.user);
}
