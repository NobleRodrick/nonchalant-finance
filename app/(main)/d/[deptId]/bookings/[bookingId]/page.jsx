import { departmentPage } from "@/lib/page-guards";
import { VenueBookingPage } from "@/components/venue/pages/venue-booking-page";
import { RentalBookingPage } from "@/components/rental/pages/rental-booking-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking" };

/** One booking, by department type (lib/domains). */
const PAGES = { EVENT_VENUE: VenueBookingPage, MATERIAL_RENTAL: RentalBookingPage };

export default async function Page({ params, searchParams }) {
  const p = await params;
  const page = await departmentPage(p.deptId, { module: "bookings" });
  const Body = PAGES[page.department.domain];
  return <Body page={page} params={p} searchParams={(await searchParams) || {}} />;
}
