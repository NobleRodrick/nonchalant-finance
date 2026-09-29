/**
 * Runs one write operation (a sale, an expense, stock added …) exactly once.
 *
 * Every write of a department goes through here, whether it comes from a server action (tests,
 * forms) or from a device's offline outbox (app/api/sync). An operation is identified by a key
 * generated on the device; the key and the result are stored in `sync_operations` in the same
 * database transaction as the change itself, so a retried or replayed operation returns its first
 * result and never records anything twice (even when two copies race each other).
 *
 * Operations done offline carry `occurredAt` (when the head did it on the device): the record is
 * dated then, so a sale made at 14:00 and synced at 18:00 belongs to 14:00 of the right day.
 * An operation may refer to a record created by an earlier operation that has no id yet:
 * { $ref: "<key of that operation>", field: "dishId" } is replaced by the id from its result.
 */
import { db } from "@/lib/prisma";
import { ActionError, invalid } from "@/lib/errors";
import { normalizeIdempotencyKey, findIdempotentTransaction } from "@/lib/idempotency";
import { resolveDepartment, orgTimezone } from "@/lib/access";
import { instantForDateKey, isDateKey, toDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { getOperation } from "@/lib/operations/registry";

/** How far back an offline operation may be dated (a device offline for longer must be checked). */
export const MAX_OFFLINE_DAYS = 45;
const DEFAULT_TIMEOUT_MS = 20000;

/**
 * The instant stored on a record.
 * - `occurredAt` (device time) is used when it falls on the requested business day (or no day
 *   was chosen). A device clock ahead of the server is clamped to now.
 * - otherwise a chosen past `dateKey` gives 12:00 of that day, and no date gives now.
 */
export function operationInstant({ dateKey, occurredAt, timeZone, now = new Date() }) {
  const today = toDateKey(now, timeZone);
  if (dateKey !== undefined && dateKey !== null && dateKey !== "") {
    if (!isDateKey(dateKey)) throw invalid("Invalid date.");
    if (dateKey > today) throw invalid("You cannot record anything on a future date.");
  }
  if (occurredAt) {
    const at = new Date(occurredAt);
    if (Number.isNaN(at.getTime())) throw invalid("Invalid time of the record.");
    const when = at > now ? now : at;
    if (now.getTime() - when.getTime() > MAX_OFFLINE_DAYS * 86400000) {
      throw invalid(`This record was made more than ${MAX_OFFLINE_DAYS} days ago on this device. Enter it again with the right date.`);
    }
    if (!dateKey || toDateKey(when, timeZone) === dateKey) return when;
  }
  return dateKey ? instantForDateKey(dateKey, timeZone, now) : now;
}

/** Replaces { $ref, field } placeholders with ids from earlier operations' results. */
export async function resolveReferences(value, { organizationId, client = db, cache = new Map() }) {
  if (Array.isArray(value)) {
    const out = [];
    for (const v of value) out.push(await resolveReferences(v, { organizationId, client, cache }));
    return out;
  }
  if (!value || typeof value !== "object") return value;
  if (typeof value.$ref === "string") {
    const key = normalizeIdempotencyKey(value.$ref);
    if (!key) throw invalid("Invalid reference to an earlier record.");
    if (!cache.has(key)) {
      const row = await client.syncOperation.findUnique({ where: { organizationId_key: { organizationId, key } }, select: { result: true } });
      cache.set(key, row?.result || null);
    }
    const result = cache.get(key);
    const id = result?.[value.field];
    if (!id) {
      throw new ActionError("DEPENDENCY", "This record depends on another one that was not saved. Check the records that need attention.");
    }
    return id;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = await resolveReferences(v, { organizationId, client, cache });
  return out;
}

function isUniqueViolation(error, needle) {
  return error?.code === "P2002" && JSON.stringify(error?.meta || {}).includes(needle);
}

async function storedResult(organizationId, key) {
  const row = await db.syncOperation.findUnique({ where: { organizationId_key: { organizationId, key } } });
  return row ? { duplicate: true, result: row.result, appliedAt: row.appliedAt } : null;
}

/**
 * Executes `kind` for `user`. Returns { duplicate, result, appliedAt, departmentId }.
 * Throws ActionError for anything the user must fix (validation, permission, locked day …).
 */
export async function executeOperation({ user, kind, input = {}, key = null, occurredAt = null, now = new Date() }) {
  const def = getOperation(kind);
  if (!def) throw invalid("Unknown operation.");
  if (!user?.organizationId) throw new ActionError("FORBIDDEN", "Set up your organization first.");
  if (def.boss && user.role !== "ADMIN") throw new ActionError("FORBIDDEN", "Only the Boss (admin) can do this.");
  const opKey = normalizeIdempotencyKey(key);

  if (opKey) {
    const seen = await storedResult(user.organizationId, opKey);
    if (seen) return seen;
    // Written before operations were keyed (or by an older client): the money record is the proof.
    if (def.money) {
      const t = await findIdempotentTransaction(db, user.organizationId, opKey);
      if (t) return { duplicate: true, result: { referenceNo: t.referenceNo, transactionId: t.id }, appliedAt: t.createdAt };
    }
  }

  const resolved = await resolveReferences(input || {}, { organizationId: user.organizationId });
  const departmentId = def.departmentOf ? await def.departmentOf(resolved, user) : resolved.departmentId;
  if (def.scope !== "organization" && !departmentId) throw invalid("Select a department first.");
  const rules = typeof def.access === "function" ? def.access(resolved) : def.access || {};
  const access = def.scope === "organization" ? null : await resolveDepartment(user, departmentId, rules);
  const timeZone = orgTimezone(user);
  const ctx = {
    user,
    role: access?.role || null,
    department: access?.department || null,
    timeZone,
    now,
    key: opKey,
    date: def.dated ? operationInstant({ dateKey: resolved.dateKey, occurredAt, timeZone, now }) : now,
  };
  if (def.validate) await def.validate(resolved, ctx);

  let result;
  try {
    result = await db.$transaction(
      async (tx) => {
        const out = serialize(await def.run(tx, ctx, resolved));
        if (opKey) {
          await tx.syncOperation.create({
            data: {
              organizationId: user.organizationId,
              departmentId: ctx.department?.id || null,
              userId: user.id,
              key: opKey,
              kind,
              result: out ?? {},
              occurredAt: occurredAt ? ctx.date : now,
            },
          });
        }
        return out;
      },
      { timeout: def.timeout || DEFAULT_TIMEOUT_MS, maxWait: 10000 }
    );
  } catch (error) {
    // Two copies of the same operation at the same moment: the first one wins, the other returns it.
    if (opKey && (isUniqueViolation(error, "key") || isUniqueViolation(error, "idempotencyKey"))) {
      const winner = await storedResult(user.organizationId, opKey);
      if (winner) return winner;
      const t = await findIdempotentTransaction(db, user.organizationId, opKey);
      if (t) return { duplicate: true, result: { referenceNo: t.referenceNo, transactionId: t.id }, appliedAt: t.createdAt };
    }
    throw error;
  }
  if (def.after) await def.after(ctx, result, resolved).catch(() => {});
  return { duplicate: false, result, appliedAt: new Date(), departmentId: ctx.department?.id || null };
}
