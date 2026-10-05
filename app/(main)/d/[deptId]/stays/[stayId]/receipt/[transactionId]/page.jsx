import Link from "next/link";
import { notFound } from "next/navigation";
import { departmentPage } from "@/lib/page-guards";
import { stayDetail, stayReceiptOf } from "@/lib/rooms/room-queries";
import { serialize } from "@/lib/serialize";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/kit/print-button";
import { StayReceipt } from "@/components/rooms/stay-receipt";

export const dynamic = "force-dynamic";

/** Rooms department: the receipt of one payment (or refund) of a booking, ready to print. */
export default async function StayReceiptPage({ params }) {
  const { deptId, stayId, transactionId } = await params;
  const { user, department } = await departmentPage(deptId, { module: "stays" });
  const stay = await stayDetail({ departmentId: department.id, stayId });
  const receipt = stay ? stayReceiptOf(stay, transactionId) : null;
  if (!receipt) notFound();
  return (
    <div className="space-y-4">
      <div className="flex justify-between print:hidden">
        <Link href={`/d/${department.id}/stays/${stay.id}`}><Button size="sm" variant="ghost">← {stay.referenceNo}</Button></Link>
        <PrintButton label="Print the receipt" />
      </div>
      <StayReceipt organization={user.organization?.name || ""} department={department.name} stay={serialize(stay)} receipt={serialize(receipt)} />
    </div>
  );
}
