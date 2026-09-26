import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { getMenuItems } from "@/actions/restaurant";
import { getDepartmentStockItems } from "@/actions/stock";
import { getUserAccounts } from "@/actions/dashboard";
import { getPurchases } from "@/actions/purchases";
import { getDailyCloseData } from "@/actions/daily-report";
import { RestaurantWorkspace } from "./_components/restaurant-workspace";
import { isRestaurantDomain, getDomainConfig } from "@/lib/domain-capabilities";
import { Card, CardContent } from "@/components/ui/card";
import { Layers, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function RestaurantPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.organizationId) redirect("/onboarding");

  // Determine active department
  let departmentId = user.activeDepartmentId || user.departmentId;
  if (!departmentId) {
    const firstDept = await db.department.findFirst({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    departmentId = firstDept?.id;
  }

  if (!departmentId) {
    redirect("/organization/departments");
  }

  const department = await db.department.findFirst({
    where: { id: departmentId, organizationId: user.organizationId },
  });

  if (!department) {
    redirect("/dashboard");
  }

  // Domain gate: If this department is not a RESTAURANT, show domain placeholder
  if (!isRestaurantDomain(department.domain)) {
    const config = getDomainConfig(department.domain);
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl space-y-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
          <Layers className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full border ${config.badgeColor}`}>
            {config.label}
          </span>
          <h1 className="text-2xl font-black text-slate-900">{department.name}</h1>
          <p className="text-sm text-muted-foreground">
            {config.description}
          </p>
        </div>

        <Card className="border-slate-200 shadow-sm text-left">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-slate-900">Domain Roadmap</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This sector is designated for the <strong>{config.label}</strong> operating domain. Its custom workflow models (tickets, specialized stock, service queues) will be enabled in the upcoming domain release.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
              <span className="text-slate-500">Need food & catering operations?</span>
              <Link href="/organization/departments">
                <Button variant="outline" size="sm">
                  Switch to a Restaurant Sector <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Load all restaurant domain data in parallel
  const [menuItems, stockItems, accounts, purchases, dailyCloseData] = await Promise.all([
    getMenuItems(department.id),
    getDepartmentStockItems(department.id),
    getUserAccounts(),
    getPurchases({ departmentId: department.id }),
    getDailyCloseData({ departmentId: department.id }),
  ]);

  return (
    <div className="container mx-auto px-4 py-6">
      <RestaurantWorkspace
        user={user}
        department={department}
        menuItems={menuItems}
        stockItems={stockItems}
        accounts={accounts}
        purchases={purchases}
        dailyCloseData={dailyCloseData}
      />
    </div>
  );
}
