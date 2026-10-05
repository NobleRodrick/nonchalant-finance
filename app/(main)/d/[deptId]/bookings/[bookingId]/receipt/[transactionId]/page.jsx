import Link from "next/link";
import { notFound } from "next/navigation";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { bookingDetail } from "@/lib/venue/booking-queries";
import { hallOf } from "@/lib/venue/hall-service";
import { receiptOf } from "@/lib/venue/receipts";
import { serialize } from "@/lib/serialize";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/kit/print-button";
import { PaymentReceipt } from "@/components/venue/receipts/receipt-document";

export const dynamic = "force-dynamic";

/** Event venue: the receipt of one payment (or refund) of a booking, ready to print. */
export default async function ReceiptPage({ params }) {
  const { deptId, bookingId, transactionId } = await params;
  const { user, department } = await departmentPage(deptId, { module: "bookings" });
  const { todayKey } = pageDate(user, null);
  const [booking, hall] = await Promise.all([bookingDetail({ departmentId: department.id, bookingId, todayKey }), hallOf(department.id)]);
  const receipt = booking ? receiptOf(booking, transactionId) : null;
  if (!receipt) notFound();
  return (
    <div className="space-y-4">
      <div className="flex justify-between print:hidden">
        <Link href={`/d/${department.id}/bookings/${booking.id}`}><Button size="sm" variant="ghost">← {booking.referenceNo}</Button></Link>
        <PrintButton label="Print the receipt" />
      </div>
      <PaymentReceipt organization={user.organization?.name || ""} department={department.name} hall={serialize(hall)} booking={serialize(booking)} receipt={serialize(receipt)} />
    </div>
  );
}
