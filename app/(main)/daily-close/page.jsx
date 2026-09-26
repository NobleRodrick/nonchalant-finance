import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { getUserAccounts } from "@/actions/dashboard";
import { getDailyCloseData } from "@/actions/daily-report";
import { DailyCloseTab } from "../restaurant/_components/daily-close-tab";

export const dynamic = "force-dynamic";

export default async function DailyClosePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.organizationId) redirect("/onboarding");

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

  const [accounts, dailyCloseData] = await Promise.all([
    getUserAccounts(),
    getDailyCloseData({ departmentId }),
  ]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <DailyCloseTab
        dailyCloseData={dailyCloseData}
        accounts={accounts}
        departmentId={departmentId}
      />
    </div>
  );
}
