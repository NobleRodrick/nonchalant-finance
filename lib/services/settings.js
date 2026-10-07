/**
 * Job-ticket options of a department (stored in `departments.profile.services`): the variants of
 * its price list (garments, vehicle types), the express surcharge, loyalty (every Nth wash free),
 * after how many days ready items count as unclaimed. Pure readers + the operation that saves.
 */
import { recordAudit } from "@/lib/audit";
import { invalid } from "@/lib/errors";
import { getDomain } from "@/lib/domains/registry";

export function serviceSettings(department) {
  const raw = department?.profile?.services || {};
  const domain = getDomain(department?.domain);
  return {
    variants: Array.isArray(raw.variants) && raw.variants.length ? raw.variants : domain.defaultVariants || [],
    expressPct: Number.isInteger(raw.expressPct) ? raw.expressPct : 50,
    loyaltyEvery: Number.isInteger(raw.loyaltyEvery) ? raw.loyaltyEvery : 0,
    unclaimedDays: Number.isInteger(raw.unclaimedDays) ? raw.unclaimedDays : 30,
    defaultHours: Number.isInteger(raw.defaultHours) ? raw.defaultHours : department?.domain === "CAR_WASH" ? 1 : 48,
  };
}

export async function saveServiceSettings(tx, ctx, input) {
  const before = serviceSettings(ctx.department);
  const variants = Array.isArray(input.variants) ? [...new Set(input.variants.map((v) => String(v || "").trim().slice(0, 40)).filter(Boolean))] : before.variants;
  if (variants.length > 60) throw invalid("At most 60 variants.");
  const n = (v, label, max, fallback) => {
    if (v === undefined || v === null || v === "") return fallback;
    const x = Number(v);
    if (!Number.isInteger(x) || x < 0 || x > max) throw invalid(`${label} must be a whole number from 0 to ${max}.`);
    return x;
  };
  const next = {
    variants,
    expressPct: n(input.expressPct, "The express surcharge (%)", 300, before.expressPct),
    loyaltyEvery: n(input.loyaltyEvery, "Loyalty (every Nth free)", 100, before.loyaltyEvery),
    unclaimedDays: n(input.unclaimedDays, "Days before items count as unclaimed", 365, before.unclaimedDays),
    defaultHours: n(input.defaultHours, "Usual time to be ready (hours)", 24 * 60, before.defaultHours),
  };
  if (next.loyaltyEvery === 1) throw invalid("Loyalty: every 2nd wash or more (0 to switch it off).");
  const raw = ctx.department.profile && typeof ctx.department.profile === "object" ? ctx.department.profile : {};
  await tx.department.update({ where: { id: ctx.department.id }, data: { profile: { ...raw, services: next } } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "SERVICE_SETTINGS_SAVED", entityType: "Department", entityId: ctx.department.id, before, after: next });
  return next;
}
