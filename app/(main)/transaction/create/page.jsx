import { getUserAccounts } from "@/actions/dashboard";
import { defaultCategories } from "@/data/categories";
import { AddTransactionForm } from "../_components/transaction-form";
import { getTransaction } from "@/actions/transaction";
import { getDepartments } from "@/actions/organization";
import { getSessionUser } from "@/actions/auth";

export default async function AddTransactionPage({ searchParams }) {
  const [accounts, departments, currentUser] = await Promise.all([
    getUserAccounts(),
    getDepartments(),
    getSessionUser(),
  ]);

  const { edit: editId } = await searchParams;

  let initialData = null;
  if (editId) {
    const transaction = await getTransaction(editId);
    initialData = transaction;
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-6">
      <div className="flex justify-center md:justify-normal mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Record Operation Entry</h1>
          <p className="text-muted-foreground text-sm">
            Log revenue, customer sales, or operational expenses for your department
          </p>
        </div>
      </div>
      <AddTransactionForm
        accounts={accounts || []}
        departments={departments || []}
        currentUser={currentUser}
        categories={defaultCategories}
        editMode={!!editId}
        initialData={initialData}
      />
    </div>
  );
}
