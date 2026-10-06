import { departmentPage } from "@/lib/page-guards";
import { VenueBookingsPage } from "@/components/venue/pages/venue-bookings-page";
import { RentalBookingsPage } from "@/components/rental/pages/rental-bookings-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

/** Bookings, by department type (lib/domains). */
const PAGES = { EVENT_VENUE: VenueBookingsPage, MATERIAL_RENTAL: RentalBookingsPage };

export default async function Page({ params, searchParams }) {
  const p = await params;
  const page = await departmentPage(p.deptId, { module: "bookings" });
  const Body = PAGES[page.department.domain];
  return <Body page={page} params={p} searchParams={(await searchParams) || {}} />;
}
