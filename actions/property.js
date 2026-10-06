"use server";

import { runAction } from "@/lib/action";
import { operation } from "@/lib/action-context";
import { invalid } from "@/lib/errors";
import { PROPERTY_OPERATIONS } from "@/lib/operations/property";
import { orgTimezone, requireOrgUser, resolveDepartment } from "@/lib/access";
import { PERMISSIONS } from "@/lib/permissions";
import { toDateKey } from "@/lib/timezone";
import { emailTenantReminders } from "@/lib/property/reminders";

/**
 * Office & property rental: runs one of its operations (lib/operations/property.js) online, with
 * the same checks as when the offline outbox sends it (access, department type, rights, once per
 * idempotency key). The forms record through the outbox; this is for direct calls and tests.
 */
export async function propertyOperation(kind, input) {
  return runAction(`property:${kind}`, () => {
    if (!PROPERTY_OPERATIONS[kind]) throw invalid("Unknown operation.");
    return operation(kind, input);
  });
}

/**
 * E-mails a payment reminder to the tenants of `leaseIds` who have an address and owe something
 * (or have rent due within 5 days). Needs internet; at most once a day per contract.
 */
export async function remindTenants({ departmentId, leaseIds }) {
  return runAction("remindTenants", async () => {
    const user = await requireOrgUser();
    const { department } = await resolveDepartment(user, departmentId, { domain: "PROPERTY_RENTAL", permission: PERMISSIONS.PROPERTY_LEASE, write: true });
    const ids = (Array.isArray(leaseIds) ? leaseIds : []).filter((x) => typeof x === "string").slice(0, 500);
    if (!ids.length) throw invalid("Choose the tenants to remind.");
    const timeZone = orgTimezone(user);
    return emailTenantReminders({ user, department, leaseIds: ids, todayKey: toDateKey(new Date(), timeZone), timeZone });
  });
}
