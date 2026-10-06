import { db } from "@/lib/prisma";
import { departmentPage } from "@/lib/page-guards";
import { ComingSoon } from "@/components/domains/coming-soon";
import { RestaurantHome } from "@/components/restaurant/restaurant-home";
import { VenueHome } from "@/components/venue/venue-home";
import { RoomsHome } from "@/components/rooms/rooms-home";
import { RentalHome } from "@/components/rental/rental-home";
import { PropertyHome } from "@/components/property/property-home";

export const dynamic = "force-dynamic";

/** The home page of each department type (lib/domains). */
const HOMES = { RESTAURANT: RestaurantHome, EVENT_VENUE: VenueHome, ROOM_RENTAL: RoomsHome, MATERIAL_RENTAL: RentalHome, PROPERTY_RENTAL: PropertyHome };

export default async function DepartmentHome({ params, searchParams }) {
  const { deptId } = await params;
  const page = await departmentPage(deptId);
  const Home = page.domain.enabled ? HOMES[page.department.domain] : null;
  if (!Home) {
    const people = await db.user.findMany({ where: { memberships: { some: { departmentId: page.department.id, isActive: true } } }, select: { name: true } });
    return <ComingSoon department={page.department} domain={page.domain} people={people.map((p) => p.name)} />;
  }
  return <Home page={page} searchParams={await searchParams} />;
}
