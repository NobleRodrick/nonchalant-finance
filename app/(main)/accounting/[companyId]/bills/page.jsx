import { notFound } from "next/navigation";
import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { listBills } from "@/lib/accounting/bills";
import { categoriesFor } from "@/data/categories";
import { BillsClient } from "@/components/accounting/bills-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Supplier bills" };

/** Bills paid later: what each supplier is owed, when it is due, the payments. */
export default async function BillsPage({ params, searchParams }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { company, todayKey } = await accountingPage(companyId);
  if (!company.payablesEnabled) notFound();
  const status = sp?.status === "all" ? null : "open";
  const [bills, suppliers, departments] = await Promise.all([
    listBills({ company, status }),
    db.supplier.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.department.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, domain: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const categories = Object.fromEntries(departments.map((d) => [d.id, ["PURCHASE", "EXPENSE", "OTHER_EXPENSE"].flatMap((t) => categoriesFor(t, d.domain).filter((c) => !c.internal).map((c) => ({ id: c.id, label: c.label })))]));
  return (
    <BillsClient
      companyId={companyId}
      vat={company.vatEnabled}
      todayKey={todayKey}
      showAll={!status}
      suppliers={suppliers}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      categories={categories}
      bills={bills.map((b) => ({ id: b.id, referenceNo: b.referenceNo, supplierRef: b.supplierRef, supplier: b.supplier.name, departmentId: b.departmentId, dateKey: b.date.toISOString().slice(0, 10), dueKey: b.dueDate ? b.dueDate.toISOString().slice(0, 10) : null, total: b.total, taxAmount: b.taxAmount, paid: b.paid, left: b.left, status: b.status, payments: b.records.map((r) => ({ id: r.id, referenceNo: r.referenceNo, amount: Math.round(Number(r.amount)), dateKey: r.date.toISOString().slice(0, 10), method: r.paymentMethod })) }))}
    />
  );
}
