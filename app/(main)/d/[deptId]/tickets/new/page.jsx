import { db } from "@/lib/prisma";
import { departmentPage } from "@/lib/page-guards";
import { serviceCatalog } from "@/lib/services/queries";
import { serviceSettings } from "@/lib/services/settings";
import { PageHeader } from "@/components/kit/primitives";
import { TicketForm } from "@/components/services/ticket-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New ticket" };

export default async function NewTicketPage({ params }) {
  const { deptId } = await params;
  const { department, domain, perms } = await departmentPage(deptId, { module: "tickets" });
  const settings = serviceSettings(department);
  const [items, workers] = await Promise.all([
    serviceCatalog({ departmentId: department.id }),
    domain.workers ? db.serviceWorker.findMany({ where: { departmentId: department.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  return (
    <div>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title={`New ${domain.words.ticket.toLowerCase()}`} description={department.domain === "CAR_WASH" ? "The plate, the vehicle type, the services: the price comes from the price list." : "The customer, each item with its service: the price comes from the price list. Give the customer the printed slip."} />
      <TicketForm
        departmentId={department.id}
        domain={department.domain}
        items={items}
        variants={settings.variants}
        variantsLabel={domain.variantsLabel || "Option"}
        workers={workers}
        settings={settings}
        canPrice={perms.prices}
        canDiscount={perms.discount && perms.prices}
        discountLimit={perms.discountLimited ? Number(department.cashierDiscountLimit || 0) : 0}
        words={domain.words}
      />
    </div>
  );
}
