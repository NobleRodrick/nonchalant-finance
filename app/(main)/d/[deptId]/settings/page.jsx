import { departmentPage } from "@/lib/page-guards";
import { readProfile } from "@/lib/business-profile";
import { attachmentUrl } from "@/lib/attachments";
import { PageHeader } from "@/components/kit/primitives";
import { ProfileForm } from "@/components/rental/settings/profile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business details" };

/** The business details and terms printed on documents (event rental, property rental). */
const TRADE = ["trade.profile.save", "manageStock"];
const KINDS = { MATERIAL_RENTAL: ["rental.profile.save", "rentalManage"], PROPERTY_RENTAL: ["property.profile.save", "propertyManage"], SHOP: TRADE, BAR: TRADE, PRESSING: TRADE, CAR_WASH: TRADE, OTHER: TRADE };

export default async function SettingsPage({ params }) {
  const { deptId } = await params;
  const { department, domain, perms } = await departmentPage(deptId, { module: "settings" });
  const profile = readProfile(department);
  const [kind, right] = KINDS[department.domain] || KINDS.MATERIAL_RENTAL;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Business details" description={KINDS[department.domain] === TRADE ? "What receipts, invoices and tickets show: name, contacts, NIU and RCCM (a formal business also gets them from its company), logo, how to pay, terms printed on drop-off slips, footer." : department.domain === "PROPERTY_RENTAL" ? "What receipts, bills, statements and rental agreements show: name, contacts, tax numbers, logo, how to pay, terms." : "What quotations, invoices, receipts and rental agreements show: name, contacts, tax numbers, logo, how to pay, terms."} />
      <ProfileForm departmentId={department.id} profile={profile} logoUrl={profile.logoId ? attachmentUrl(profile.logoId) : null} canEdit={perms[right]} kind={kind} />
    </div>
  );
}
