import { redirect } from "next/navigation";
import { db } from "@/lib/prisma";
import { requirePageUser, pageDate } from "@/lib/page-guards";
import { readableDepartmentIds, effectiveRole } from "@/lib/access";
import { roleHasPermission, PERMISSIONS } from "@/lib/permissions";
import { buildStatements } from "@/lib/finance/statements";
import { addDaysToKey, isDateKey, periodRange, formatDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { StatementsView } from "@/components/reports/statements";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statements" };

function resolveRange(sp, todayKey) {
  const preset = sp?.period || "month";
  if (preset === "custom" && isDateKey(sp?.from) && isDateKey(sp?.to)) return { preset, fromKey: sp.from <= sp.to ? sp.from : sp.to, toKey: sp.from <= sp.to ? sp.to : sp.from };
  if (preset === "today") return { preset, fromKey: todayKey, toKey: todayKey };
  if (preset === "yesterday") return { preset, fromKey: addDaysToKey(todayKey, -1), toKey: addDaysToKey(todayKey, -1) };
  if (preset === "week") return { preset, ...periodRange("week", todayKey) };
  if (preset === "last-month") return { preset, ...periodRange("month", addDaysToKey(periodRange("month", todayKey).fromKey, -1)) };
  if (preset === "year") return { preset, fromKey: `${todayKey.slice(0, 4)}-01-01`, toKey: `${todayKey.slice(0, 4)}-12-31` };
  return { preset: "month", ...periodRange("month", todayKey) };
}

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
  const range = resolveRange(sp, todayKey);
  const statement = await buildStatements({ organizationId: user.organizationId, departments: scope.length ? scope : departments, fromKey: range.fromKey, toKey: range.toKey, timeZone });
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
        tab={["income", "cash", "stock", "debts"].includes(sp?.tab) ? sp.tab : "income"}
      />
    </div>
  );
}
