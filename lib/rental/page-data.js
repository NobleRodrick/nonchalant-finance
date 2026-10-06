/**
 * What the event rental booking pages share: customers (for the picker), the items that can be
 * booked, the people who can be responsible (the heads, and the Boss when he runs the
 * department himself), read in parallel.
 */
import { db } from "@/lib/prisma";
import { departmentTeam } from "@/lib/departments/team";
import { bookableItems } from "./item-queries";

export async function rentalFormData({ department, user, perms }) {
  const [clients, items, team] = await Promise.all([
    db.venueClient.findMany({ where: { departmentId: department.id }, select: { id: true, name: true, phone: true, email: true }, orderBy: { name: "asc" }, take: 2000 }),
    bookableItems(department.id),
    departmentTeam(department.id),
  ]);
  const heads = perms?.ownerRuns ? [{ id: user.id, name: user.name, title: "Boss" }, ...team] : team;
  return { clients, items, heads };
}
