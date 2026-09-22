import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMenuItems, createMenuItem, setMenuRecipe } from "@/actions/restaurant";
import { getDepartmentStockItems } from "@/actions/stock";
import { MenuManager } from "./_components/menu-manager";

export default async function MenuPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const departmentId = user.role === "ADMIN" ? null : user.departmentId;
  const [menuItems, stockItems] = await Promise.all([getMenuItems(departmentId), getDepartmentStockItems(departmentId)]);
  return <div className="mx-auto max-w-6xl px-4 py-8"><MenuManager departmentId={departmentId} menuItems={menuItems} stockItems={stockItems} /></div>;
}
