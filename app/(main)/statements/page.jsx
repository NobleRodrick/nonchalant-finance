import { redirect } from "next/navigation";
import { db } from "@/lib/prisma";
import { requirePageUser, pageDate } from "@/lib/page-guards";
import { readableDepartmentIds, effectiveRole } from "@/lib/access";
import { roleHasPermission, PERMISSIONS } from "@/lib/permissions";
import { buildStatements } from "@/lib/finance/statements";
import { vatIncludedIn } from "@/lib/accounting/vat-included";
import { formatDateKey } from "@/lib/timezone";
import { resolvePeriod } from "@/lib/reports/periods";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { StatementsView } from "@/components/reports/statements";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statements" };

export default async function StatementsPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requirePageUser();
  const { todayKey, timeZone } = pageDate(user, null);
  const readable = await readableDepartmentIds(user);
  const departments = (await db.department.findMany({ where: { id: { in: readable } }, orderBy: { createdAt: "asc" } })).filter(
    (d) => user.role === "ADMIN" || roleHasPermission(effectiveRole(user, d.id), PERMISSIONS.STATEMENTS_READ)
  );
  if (!departments.length) redirect("/home");
  const wanted = String(sp?.dept || "all");
  const scope = wanted === "all" ? departments : departments.filter((d) => wanted.split(",").includes(d.id));
  const range = resolvePeriod(sp, todayKey);
  const shown = scope.length ? scope : departments;
  const [statement, vat] = await Promise.all([
    buildStatements({ organizationId: user.organizationId, departments: shown, fromKey: range.fromKey, toKey: range.toKey, timeZone }),
    vatIncludedIn({ departments: shown, fromKey: range.fromKey, toKey: range.toKey }),
  ]);
  return (
    <div>
      <PageHeader title="Statements" description="Income, cash, stock and debts for any period, from the recorded figures. Print them or export them for your accountant." />
      <StatementsView
        organizationName={user.organization?.name}
        departments={departments.map((d) => ({ id: d.id, name: d.name, domain: d.domain }))}
        scopeIds={(scope.length ? scope : departments).map((d) => d.id)}
        scopeAll={wanted === "all" || !scope.length}
        range={{ ...range, label: range.fromKey === range.toKey ? formatDateKey(range.fromKey) : `${formatDateKey(range.fromKey)} – ${formatDateKey(range.toKey)}` }}
        previousLabel={statement.previous ? `${formatDateKey(statement.previous.fromKey)} – ${formatDateKey(statement.previous.toKey)}` : null}
        todayKey={todayKey}
        statement={serialize(statement)}
        vat={vat}
        tab={["income", "cash", "stock", "debts"].includes(sp?.tab) ? sp.tab : "income"}
      />
    </div>
  );
}
