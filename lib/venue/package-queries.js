import { db } from "@/lib/prisma";

/** Packages of a venue department: the active ones (booking forms) or all of them. */
export async function venuePackages(departmentId, { includeInactive = false, client = db } = {}) {
  return client.venuePackage.findMany({
    where: { departmentId, ...(includeInactive ? {} : { isActive: true, archivedAt: null }) },
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}
