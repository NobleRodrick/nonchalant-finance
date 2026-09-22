import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCashHandovers } from "@/actions/restaurant";
import { CashHandoverLedger } from "./_components/cash-handover-ledger";

export default async function CashHandoverPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const handovers = await getCashHandovers(user.role === "ADMIN" ? null : user.departmentId);
  return <div className="mx-auto max-w-5xl px-4 py-8"><CashHandoverLedger handovers={handovers} departmentId={user.role === "ADMIN" ? null : user.departmentId} /></div>;
}
