import { departmentPage } from "@/lib/page-guards";
import { RestaurantMoneyPage } from "@/components/restaurant/restaurant-money-page";
import { VenueMoneyPage } from "@/components/venue/money/venue-money-page";
import { StayMoneyPage } from "@/components/rooms/money/stay-money-page";
import { RentalMoneyPage } from "@/components/rental/money/rental-money-page";
import { PropertyMoneyPage } from "@/components/property/pages/property-money-page";
import { TradeMoneyPage } from "@/components/trade/pages/trade-money-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Money in / out" };

/** Money in / out, by department type (lib/domains). */
const PAGES = { RESTAURANT: RestaurantMoneyPage, EVENT_VENUE: VenueMoneyPage, ROOM_RENTAL: StayMoneyPage, MATERIAL_RENTAL: RentalMoneyPage, PROPERTY_RENTAL: PropertyMoneyPage, SHOP: TradeMoneyPage, BAR: TradeMoneyPage, PRESSING: TradeMoneyPage, CAR_WASH: TradeMoneyPage, OTHER: TradeMoneyPage, PRODUCTION: TradeMoneyPage, FARM: TradeMoneyPage, SALON: TradeMoneyPage };

export default async function MoneyPage({ params, searchParams }) {
  const { deptId } = await params;
  const page = await departmentPage(deptId, { module: "money" });
  const Page = PAGES[page.department.domain];
  return <Page page={page} searchParams={await searchParams} />;
}
