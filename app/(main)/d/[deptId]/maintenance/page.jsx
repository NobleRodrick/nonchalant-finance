import { departmentPage } from "@/lib/page-guards";
import { StayMaintenancePage } from "@/components/rooms/pages/stay-maintenance-page";
import { PropertyMaintenancePage } from "@/components/property/pages/property-maintenance-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Maintenance" };

/** Maintenance, by department type (guest house: repairs of apartments; property rental: requests on offices). */
const PAGES = { ROOM_RENTAL: StayMaintenancePage, PROPERTY_RENTAL: PropertyMaintenancePage };

export default async function MaintenancePage({ params, searchParams }) {
  const { deptId } = await params;
  const page = await departmentPage(deptId, { module: "maintenance" });
  const Page = PAGES[page.department.domain];
  return <Page page={page} searchParams={(await searchParams) || {}} />;
}
