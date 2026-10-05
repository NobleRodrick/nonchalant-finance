import { notFound } from "next/navigation";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { venueFormData } from "@/lib/venue/page-data";
import { bookingDetail, heldDates } from "@/lib/venue/booking-queries";
import { packageStays, roomsDepartments } from "@/lib/rooms/room-queries";
import { bookingChecks, venueAssets } from "@/lib/venue/asset-queries";
import { serialize } from "@/lib/serialize";
import { BookingDetail } from "@/components/venue/bookings/booking-detail";

export const dynamic = "force-dynamic";

/** Event venue: one booking with everything about it. */
export default async function BookingPage({ params }) {
  const { deptId, bookingId } = await params;
  const { user, department, domain, perms, renderedAt } = await departmentPage(deptId, { module: "bookings" });
  const { todayKey } = pageDate(user, null);
  const [booking, form, taken, stays, roomsDepts, assets, checks] = await Promise.all([
    bookingDetail({ departmentId: department.id, bookingId, todayKey }),
    venueFormData(department.id),
    heldDates({ departmentId: department.id, fromKey: todayKey }),
    packageStays(bookingId),
    roomsDepartments(user.organizationId),
    venueAssets(department.id),
    bookingChecks(department.id, bookingId),
  ]);
  if (!booking) notFound();
  return (
    <BookingDetail
      departmentId={department.id}
      renderedAt={renderedAt}
      booking={serialize(booking)}
      hall={serialize(form.hall)}
      heads={form.heads}
      takenDates={taken}
      todayKey={todayKey}
      canBook={perms.venueBook}
      domainLabel={domain.label}
      departmentName={department.name}
      packageStays={serialize(stays.filter((x) => x.sourceVenueBooking?.departmentId === department.id))}
      roomsDepartments={roomsDepts}
      assets={serialize(assets)}
      checks={serialize(checks)}
    />
  );
}
