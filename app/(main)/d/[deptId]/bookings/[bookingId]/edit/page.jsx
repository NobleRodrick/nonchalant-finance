import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { rentalFormData } from "@/lib/rental/page-data";
import { orderDetail } from "@/lib/rental/order-queries";
import { EDITABLE_STATUSES } from "@/lib/rental/booking-math";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { BookingForm } from "@/components/rental/bookings/booking-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Change booking" };

/** Event rental: changing a booking that has not left yet. */
export default async function EditBookingPage({ params }) {
  const { deptId, bookingId } = await params;
  const page = await departmentPage(deptId, { module: "bookings" });
  const { user, department, domain, perms } = page;
  if (department.domain !== "MATERIAL_RENTAL" || !perms.rentalBook) notFound();
  const { todayKey } = pageDate(user, null);
  const [detail, data] = await Promise.all([orderDetail({ departmentId: department.id, orderId: bookingId, todayKey }), rentalFormData(page)]);
  if (!detail || !EDITABLE_STATUSES.includes(detail.order.status)) notFound();
  const { order } = detail;
  return (
    <div className="space-y-5">
      <Link href={`/d/${department.id}/bookings/${order.id}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft className="h-4 w-4" /> {order.referenceNo}</Link>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title={`Change ${order.referenceNo}`} description={`${order.client.name} · ${order.eventType}`} />
      <BookingForm departmentId={department.id} order={serialize(order)} clients={data.clients} items={serialize(data.items)} heads={data.heads} canChangePrices={perms.prices} todayKey={todayKey} currentUserId={user.id} />
    </div>
  );
}
