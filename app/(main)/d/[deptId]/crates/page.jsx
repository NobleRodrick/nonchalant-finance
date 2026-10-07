import { departmentPage, pageDate } from "@/lib/page-guards";
import { crateBoard } from "@/lib/trade/queries";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { CratesBoard } from "@/components/trade/crates-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crates & empties" };

/** Bar: returnable crates and bottles with their deposits (emballages / consignes). */
export default async function CratesPage({ params }) {
  const { deptId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "crates" });
  const { timeZone } = pageDate(user, null);
  const b = await crateBoard({ departmentId: department.id, timeZone });
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Crates & empties" description="Full crates come in with each purchase and their deposit is paid with the drinks. Give the empties back to get the deposit refunded; customers who take bottles away leave a deposit." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Crates owed back to suppliers" value={b.totals.owedToSuppliers} hint={`deposits ${formatMoney(b.totals.depositsWithSuppliers)}`} />
        <StatCard label="Crates here" value={b.totals.onHand} />
        <StatCard label="Bottles out with customers" value={b.totals.bottlesWithCustomers} hint={`held ${formatMoney(b.totals.depositsHeldForCustomers)}`} />
        <StatCard tone={b.totals.depositLost ? "out" : "default"} label="Deposits lost (breakage)" value={formatMoney(b.totals.depositLost)} />
      </div>
      <CratesBoard departmentId={department.id} crates={serialize(b.crates)} movements={serialize(b.movements)} perms={perms} />
    </div>
  );
}
