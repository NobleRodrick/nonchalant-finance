import { departmentPage, pageDate } from "@/lib/page-guards";
import { serviceCatalog } from "@/lib/services/queries";
import { serviceSettings } from "@/lib/services/settings";
import { PageHeader } from "@/components/kit/primitives";
import { PriceList } from "@/components/services/price-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Price list" };

/** Pressing, car wash, jobs: services with a price for each garment / vehicle type, and the options. */
export default async function PricesPage({ params }) {
  const { deptId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "prices" });
  const { todayKey } = pageDate(user, null);
  const items = await serviceCatalog({ departmentId: department.id, includeArchived: true });
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title={domain.navigation.find((n) => n.key === "prices")?.label || "Price list"} description="Tickets take their prices from here. A different price on a ticket needs the right to change prices; tickets keep the price they were made with." />
      <PriceList departmentId={department.id} domain={department.domain} items={items} settings={serviceSettings(department)} variantsLabel={domain.variantsLabel || "Option"} perms={perms} fileName={`${department.name} price list ${todayKey}`} />
    </div>
  );
}
