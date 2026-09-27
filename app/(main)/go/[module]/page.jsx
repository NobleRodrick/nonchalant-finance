import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/page-guards";
import { accessibleDepartmentIds } from "@/lib/access";

export const dynamic = "force-dynamic";

const MODULES = { home: "", sell: "/sell", "menu-stock": "/menu-stock", money: "/money", debts: "/debts", "cash-handover": "/cash-handover", report: "/report", history: "/history" };

/** Opens a module of the active department (used by links that do not know the department). */
export default async function GoToModule({ params, searchParams }) {
  const { module } = await params;
  const query = new URLSearchParams(await searchParams).toString();
  const user = await requirePageUser();
  const ids = await accessibleDepartmentIds(user);
  const dept = ids.includes(user.activeDepartmentId) ? user.activeDepartmentId : ids[0];
  if (!dept) redirect(user.role === "ADMIN" ? "/boss/departments" : "/profile?notice=no-department");
  redirect(`/d/${dept}${MODULES[module] ?? ""}${query ? `?${query}` : ""}`);
}
