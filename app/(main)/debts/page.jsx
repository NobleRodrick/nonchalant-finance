import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDebts } from "@/actions/restaurant";
import { DebtLedger } from "./_components/debt-ledger";

export default async function DebtsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const debts = await getDebts(user.role === "ADMIN" ? null : user.departmentId);
  return <div className="mx-auto max-w-6xl px-4 py-8"><DebtLedger debts={debts} /></div>;
}
