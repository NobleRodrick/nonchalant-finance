"use server";

import { runAction } from "@/lib/action";
import { PERMISSIONS, roleHasPermission } from "@/lib/permissions";
import { effectiveRole, orgTimezone, requireOrgUser, readableDepartmentIds } from "@/lib/access";
import { db } from "@/lib/prisma";
import { buildStatements } from "@/lib/finance/statements";
import { insightsFromStatement } from "@/lib/ai/insights";
import { isDateKey } from "@/lib/timezone";
import { forbidden, invalid } from "@/lib/errors";

/**
 * AI insights (Gemini) for exactly the departments and period shown on the Statements page,
 * grounded in the recorded figures only — never invented numbers.
 */
export async function generateInsights({ departmentIds = [], fromKey, toKey } = {}) {
  return runAction("generateInsights", async () => {
    const user = await requireOrgUser();
    if (!isDateKey(fromKey) || !isDateKey(toKey) || fromKey > toKey) throw invalid("Choose a valid period.");
    const readable = new Set(await readableDepartmentIds(user));
    const wanted = departmentIds.length ? departmentIds.filter((id) => readable.has(id)) : [...readable];
    const departments = (await db.department.findMany({ where: { id: { in: wanted }, organizationId: user.organizationId } })).filter(
      (d) => user.role === "ADMIN" || roleHasPermission(effectiveRole(user, d.id), PERMISSIONS.STATEMENTS_READ)
    );
    if (!departments.length) throw forbidden("You cannot read the statements of these departments.");
    const statement = await buildStatements({ organizationId: user.organizationId, departments, fromKey, toKey, timeZone: orgTimezone(user) });
    return insightsFromStatement({ label: `${fromKey} to ${toKey}`, statement });
  });
}
