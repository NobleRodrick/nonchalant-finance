import { notFound } from "next/navigation";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { unitBoard } from "@/lib/property/unit-queries";
import { db } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { ContractForm } from "@/components/property/contracts/contract-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New contract" };

/** Property rental: a tenant on a free office (?unit= preselects the office). */
export default async function NewContractPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "contracts" });
  if (!perms.propertyLease) notFound();
  const { todayKey } = pageDate(user, null);
  const [units, tenants] = await Promise.all([
    unitBoard({ departmentId: department.id, todayKey }),
    db.venueClient.findMany({ where: { departmentId: department.id }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="New contract" description="The office, the tenant, the rent and the terms. An office can never be let twice: it must be free." />
      <ContractForm departmentId={department.id} units={serialize(units)} tenants={tenants} unitId={sp.unit || ""} todayKey={todayKey} canChangePrices={perms.prices} />
    </div>
  );
}
