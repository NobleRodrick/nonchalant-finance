import { departmentPage } from "@/lib/page-guards";
import { venuePackages } from "@/lib/venue/package-queries";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PackagesBoard } from "@/components/venue/packages/packages-board";

export const dynamic = "force-dynamic";

/** Event venue: packages (the hall with extra benefits). */
export default async function PackagesPage({ params }) {
  const { deptId } = await params;
  const { department, domain, perms } = await departmentPage(deptId, { module: "packages" });
  const packages = (await venuePackages(department.id, { includeInactive: true })).filter((p) => !p.archivedAt);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Packages" description="The hall offered with extra benefits: rooms at Executive Stay, decoration, services. Create, change, offer or withdraw them." />
      <PackagesBoard departmentId={department.id} packages={serialize(packages)} canManage={perms.venueManage} />
    </div>
  );
}
