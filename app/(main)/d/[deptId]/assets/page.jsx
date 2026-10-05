import { departmentPage } from "@/lib/page-guards";
import { VenueAssetsPage } from "@/components/venue/assets/venue-assets-page";
import { StayAssetsPage } from "@/components/rooms/assets/stay-assets-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assets" };

/** Assets, by department type (lib/domains). */
const PAGES = { EVENT_VENUE: VenueAssetsPage, ROOM_RENTAL: StayAssetsPage };

export default async function AssetsPage({ params, searchParams }) {
  const { deptId } = await params;
  const page = await departmentPage(deptId, { module: "assets" });
  const Page = PAGES[page.department.domain];
  return <Page page={page} searchParams={await searchParams} />;
}
