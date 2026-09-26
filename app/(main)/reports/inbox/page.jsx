import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDepartments } from "@/actions/organization";
import { getBossReportInbox } from "@/actions/daily-report";
import { ReportInboxClient } from "./_components/report-inbox-client";

export const dynamic = "force-dynamic";

export default async function ReportInboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.organizationId) redirect("/onboarding");
  if (user.role !== "ADMIN") redirect("/reports");

  const [reports, departments] = await Promise.all([
    getBossReportInbox(),
    getDepartments(),
  ]);

  return (
    <div className="container mx-auto px-4 py-8">
      <ReportInboxClient initialReports={reports} departments={departments} />
    </div>
  );
}
