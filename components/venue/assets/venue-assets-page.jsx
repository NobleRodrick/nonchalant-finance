import { departmentIncidents, venueAssets } from "@/lib/venue/asset-queries";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { AssetsBoard } from "./assets-board";

/** Event venue: the hall's assets and what events cost them. */
export async function VenueAssetsPage({ page }) {
  const { department, domain, perms } = page;
  const [assets, incidents] = await Promise.all([venueAssets(department.id, { includeInactive: true }), departmentIncidents({ departmentId: department.id, take: 200 })]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Assets" description="The hall's chairs, tables, decorations, sound and lighting, checked before and after every event (on each booking)." />
      <AssetsBoard departmentId={department.id} assets={serialize(assets)} incidents={serialize(incidents)} canManage={perms.venueManage} canBook={perms.venueBook} />
    </div>
  );
}
