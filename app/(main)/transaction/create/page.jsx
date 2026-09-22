import { getUserAccounts } from "@/actions/dashboard";
import { defaultCategories } from "@/data/categories";
import { AddTransactionForm } from "../_components/transaction-form";
import { SalesEntryForm } from "../_components/sales-entry-form";
import { ItemizedSaleForm } from "../_components/itemized-sale-form";
import { getTransaction } from "@/actions/transaction";
import { getDepartments } from "@/actions/organization";
import { getDepartmentStockItems } from "@/actions/stock";
import { getMenuItems } from "@/actions/restaurant";
import { getSessionUser } from "@/actions/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, ShoppingCart, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AddTransactionPage({ searchParams }) {
  const [accounts, departments, currentUser, stockItems, menuItems] = await Promise.all([
    getUserAccounts(),
    getDepartments(),
    getSessionUser(),
    getDepartmentStockItems(),
    getMenuItems(),
  ]);

  const params = await searchParams;
  const editId = params?.edit;
  const initialTab = params?.tab || "sales";

  let initialData = null;
  if (editId) {
    const transaction = await getTransaction(editId);
    initialData = transaction;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            {editId ? "Edit Transaction" : "Record Operations & Sales"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Log daily restaurant sales, food/drink purchases, or operating expenses
          </p>
        </div>
      </div>

      {editId ? (
        <AddTransactionForm
          accounts={accounts || []}
          departments={departments || []}
          currentUser={currentUser}
          categories={defaultCategories}
          editMode={true}
          initialData={initialData}
        />
      ) : (
        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 w-full max-w-md mx-auto h-12 p-1 bg-slate-100 rounded-xl">
            <TabsTrigger
              value="sales"
              className="flex items-center gap-2 font-bold data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg transition-all"
            >
              <Banknote className="h-4 w-4" /> Daily Sales Entry
            </TabsTrigger>
            <TabsTrigger
              value="purchases"
              className="flex items-center gap-2 font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-lg transition-all"
            >
              <ShoppingCart className="h-4 w-4" /> Purchases & Expenses
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="space-y-4">
            {menuItems.length > 0 && <ItemizedSaleForm departmentId={currentUser?.role === "ADMIN" ? departments?.[0]?.id : currentUser?.departmentId} menuItems={menuItems} accounts={accounts || []} />}
            <SalesEntryForm
              departments={departments || []}
              accounts={accounts || []}
              currentUser={currentUser}
              stockItems={stockItems || []}
            />
          </TabsContent>

          <TabsContent value="purchases" className="space-y-4">
            <AddTransactionForm
              accounts={accounts || []}
              departments={departments || []}
              currentUser={currentUser}
              categories={defaultCategories}
              editMode={false}
              initialData={null}
              stockItems={stockItems || []}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
