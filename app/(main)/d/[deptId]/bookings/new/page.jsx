import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { rentalFormData } from "@/lib/rental/page-data";
import { isDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { BookingForm } from "@/components/rental/bookings/booking-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New booking" };

/** Event rental: a new booking (?date=YYYY-MM-DD from the calendar). */
export default async function NewBookingPage({ params, searchParams }) {
  const { deptId } = await params;
  const { date } = (await searchParams) || {};
  const page = await departmentPage(deptId, { module: "bookings" });
  const { user, department, domain, perms } = page;
  if (department.domain !== "MATERIAL_RENTAL" || !perms.rentalBook) notFound();
  const { todayKey } = pageDate(user, null);
  const data = await rentalFormData(page);
  return (
    <div className="space-y-5">
      <Link href={`/d/${department.id}/bookings`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Bookings</Link>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="New booking" description="The customer, the event and its days, the items and services. The total is computed for you; what is short for those days shows in red." />
      <BookingForm departmentId={department.id} clients={data.clients} items={serialize(data.items)} heads={data.heads} canChangePrices={perms.prices} todayKey={todayKey} currentUserId={user.id} initialDateKey={isDateKey(date) ? date : ""} />
    </div>
  );
}
