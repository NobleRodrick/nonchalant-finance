import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/page-guards";
import { accessibleDepartmentIds } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Where "home" is: the Boss's overview, the last department opened, or a department chooser. */
export default async function HomeRedirect() {
  const user = await requirePageUser();
  if (user.role === "ADMIN") redirect("/boss");
  if (user.role === "ACCOUNTANT") redirect("/accounting");
  const ids = await accessibleDepartmentIds(user);
  if (!ids.length) redirect("/profile?notice=no-department");
  if (user.activeDepartmentId && ids.includes(user.activeDepartmentId)) redirect(`/d/${user.activeDepartmentId}`);
  if (ids.length === 1) redirect(`/d/${ids[0]}`);
  redirect("/my-departments");
}
