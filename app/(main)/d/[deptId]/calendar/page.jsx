import { departmentPage } from "@/lib/page-guards";
import { VenueCalendarPage } from "@/components/venue/pages/venue-calendar-page";
import { RentalCalendarPage } from "@/components/rental/pages/rental-calendar-page";
import { PropertyCalendarPage } from "@/components/property/pages/property-calendar-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar" };

/** Calendar, by department type (lib/domains). */
const PAGES = { EVENT_VENUE: VenueCalendarPage, MATERIAL_RENTAL: RentalCalendarPage, PROPERTY_RENTAL: PropertyCalendarPage };

export default async function Page({ params, searchParams }) {
  const p = await params;
  const page = await departmentPage(p.deptId, { module: "calendar" });
  const Body = PAGES[page.department.domain];
  return <Body page={page} params={p} searchParams={(await searchParams) || {}} />;
}
