import { departmentPage } from "@/lib/page-guards";
import { RestaurantMoneyPage } from "@/components/restaurant/restaurant-money-page";
import { VenueMoneyPage } from "@/components/venue/money/venue-money-page";
import { StayMoneyPage } from "@/components/rooms/money/stay-money-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Money in / out" };

/** Money in / out, by department type (lib/domains). */
const PAGES = { RESTAURANT: RestaurantMoneyPage, EVENT_VENUE: VenueMoneyPage, ROOM_RENTAL: StayMoneyPage };

export default async function MoneyPage({ params, searchParams }) {
  const { deptId } = await params;
  const page = await departmentPage(deptId, { module: "money" });
  const Page = PAGES[page.department.domain];
  return <Page page={page} searchParams={await searchParams} />;
}
