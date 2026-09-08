import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationOverview } from "@/actions/organization";
import { getDashboardData, getUserAccounts, getExecutiveKpis } from "@/actions/dashboard";
import { ExecutiveDashboard } from "./_components/executive-dashboard";
import { DepartmentDashboard } from "./_components/department-dashboard";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // If Boss hasn't created an Organization yet, direct them to Onboarding
  if (user.role === "ADMIN" && !user.organizationId) {
    redirect("/onboarding");
  }

  // 1. If Boss (ADMIN): Render the Executive Global Dashboard
  if (user.role === "ADMIN") {
    const [orgOverview, kpis, transactions, accounts] = await Promise.all([
      getOrganizationOverview(),
      getExecutiveKpis(),
      getDashboardData("all"),
      getUserAccounts(),
    ]);

    return (
      <div className="container mx-auto px-4 py-6">
        <ExecutiveDashboard
          user={user}
          organization={orgOverview}
          departments={orgOverview?.departments || []}
          transactions={transactions || []}
          accounts={accounts || []}
          kpis={kpis}
        />
      </div>
    );
  }

  // 2. If Employee (Accountant / Manager / Staff): Render Department-Scoped Portal
  if (!user.departmentId) {
    redirect("/profile?notice=no-department");
  }

  const [transactions, accounts] = await Promise.all([
    getDashboardData(user.departmentId),
    getUserAccounts(),
  ]);

  return (
    <div className="container mx-auto px-4 py-6">
      <DepartmentDashboard
        user={user}
        department={user.department}
        organization={user.organization}
        transactions={transactions || []}
        accounts={accounts || []}
      />
    </div>
  );
}
