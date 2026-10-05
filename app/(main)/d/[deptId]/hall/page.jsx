import { departmentPage, pageDate } from "@/lib/page-guards";
import { hallOf } from "@/lib/venue/hall-service";
import { serialize } from "@/lib/serialize";
import { Banner, PageHeader, Section } from "@/components/kit/primitives";
import { HallForm } from "@/components/venue/hall/hall-form";
import { PriceRules } from "@/components/venue/hall/price-rules";

export const dynamic = "force-dynamic";

/** Event venue: the hall's details and its prices (by day of the week, season, special date). */
export default async function HallPage({ params }) {
  const { deptId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "venue-settings" });
  const { todayKey } = pageDate(user, null);
  const hall = await hallOf(department.id);
  const canEdit = perms.venueManage;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Hall & prices" description="The hall's details and the price of each date: by day of the week, season or special date." />
      {!hall && !canEdit ? <Banner tone="warn">The hall is not set up yet. Its department head sets it up here.</Banner> : null}
      <Section title="The hall">
        <HallForm key={hall?.updatedAt?.toISOString?.() || "new"} departmentId={department.id} hall={serialize(hall)} canEdit={canEdit} />
      </Section>
      {hall ? (
        <Section title="Prices">
          <PriceRules departmentId={department.id} hall={serialize(hall)} canEdit={canEdit} todayKey={todayKey} />
        </Section>
      ) : null}
    </div>
  );
}
