import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDepartments } from "@/actions/organization";
import { getLatestStockRecord, getDepartmentStockRecords, getDepartmentStockItems } from "@/actions/stock";
import { DailyStockForm } from "./_components/daily-stock-form";
import { StockItemsPanel } from "./_components/stock-items-panel";
import { Boxes, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function StockPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [departments, latestRecord, history, items] = await Promise.all([
    getDepartments(),
    getLatestStockRecord(user.role !== "ADMIN" ? user.departmentId : null),
    getDepartmentStockRecords(user.role !== "ADMIN" ? user.departmentId : null, 30),
    getDepartmentStockItems(user.role !== "ADMIN" ? user.departmentId : null),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <Boxes className="h-7 w-7 text-indigo-600" /> Food & Beverage Stock Management
          </h1>
          <p className="text-muted-foreground text-sm">
            Control food supplies, kitchen usage, damaged inventory, and calculate closing stock daily
          </p>
        </div>
      </div>

      <DailyStockForm
        departments={departments || []}
        currentUser={user}
        latestRecord={latestRecord}
        history={history || []}
      />
      <StockItemsPanel
        departmentId={user.role !== "ADMIN" ? user.departmentId : departments?.[0]?.id}
        items={items || []}
      />
    </div>
  );
}
