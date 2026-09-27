import { db } from "@/lib/prisma";
import { requirePageUser } from "@/lib/page-guards";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { SettingsClient } from "@/components/boss/settings-client";
import { PeriodsClient } from "@/components/boss/periods-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageUser({ admin: true });
  const periods = await db.accountingPeriod.findMany({ where: { organizationId: user.organizationId }, orderBy: { startDate: "desc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your organisation and its accounting periods." />
      <SettingsClient organization={serialize(user.organization)} />
      <PeriodsClient periods={serialize(periods)} />
    </div>
  );
}
