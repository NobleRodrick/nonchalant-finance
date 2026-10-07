import { departmentPage } from "@/lib/page-guards";
import { VenueReportsPage } from "@/components/venue/reports/venue-reports-page";
import { StayReportsPage } from "@/components/rooms/reports/stay-reports-page";
import { RentalReportsPage } from "@/components/rental/reports/rental-reports-page";
import { PropertyReportsPage } from "@/components/property/reports/property-reports-page";
import { TradeReportsPage } from "@/components/trade/pages/trade-reports-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

/** Reports for any period, by department type (lib/domains). */
const PAGES = { EVENT_VENUE: VenueReportsPage, ROOM_RENTAL: StayReportsPage, MATERIAL_RENTAL: RentalReportsPage, PROPERTY_RENTAL: PropertyReportsPage, SHOP: TradeReportsPage, BAR: TradeReportsPage, PRESSING: TradeReportsPage, CAR_WASH: TradeReportsPage, OTHER: TradeReportsPage, PRODUCTION: TradeReportsPage, FARM: TradeReportsPage, SALON: TradeReportsPage };

export default async function ReportsPage({ params, searchParams }) {
  const { deptId } = await params;
  const page = await departmentPage(deptId, { module: "reports" });
  const Page = PAGES[page.department.domain];
  return <Page page={page} searchParams={await searchParams} />;
}
