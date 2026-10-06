/**
 * Business details printed on a department's documents (quotations, invoices, receipts,
 * contracts): stored as `departments.profile` (JSON). Pure helpers + the operation that saves it.
 */
import { recordAudit } from "@/lib/audit";
import { invalid } from "@/lib/errors";

const FIELDS = {
  legalName: 120,
  tagline: 160,
  address: 300,
  phone: 60,
  email: 160,
  website: 160,
  taxId: 60, // NIU
  registration: 60, // RCCM
  bankDetails: 300,
  momoNumber: 60,
  paymentTerms: 1500,
  contractTerms: 6000,
  footer: 300,
};

const text = (v, max) => String(v ?? "").trim().slice(0, max) || null;

/** The profile with every field (null when not set) and the logo id. */
export function readProfile(department) {
  const p = department?.profile && typeof department.profile === "object" ? department.profile : {};
  return { ...Object.fromEntries(Object.keys(FIELDS).map((k) => [k, p[k] || null])), logoId: p.logoId || null };
}

/** Saves the business details of the department (and its logo: the first image sent). */
export async function saveProfile(tx, ctx, input) {
  const before = readProfile(ctx.department);
  const next = { ...before };
  for (const [k, max] of Object.entries(FIELDS)) if (input?.[k] !== undefined) next[k] = text(input[k], max);
  if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) throw invalid("The e-mail address does not look right.");
  const logoId = Array.isArray(input?.attachmentIds) ? input.attachmentIds[0] : null;
  if (logoId) {
    const file = await tx.attachment.findFirst({ where: { id: logoId, organizationId: ctx.user.organizationId }, select: { mimeType: true } });
    if (!file?.mimeType.startsWith("image/")) throw invalid("The logo must be an image (JPEG, PNG or WebP).");
    await tx.attachment.update({ where: { id: logoId }, data: { entityType: "DepartmentLogo", entityId: ctx.department.id, departmentId: ctx.department.id } });
    next.logoId = logoId;
  }
  if (input?.removeLogo) next.logoId = null;
  await tx.department.update({ where: { id: ctx.department.id }, data: { profile: next } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "BUSINESS_PROFILE_SAVED", entityType: "Department", entityId: ctx.department.id, before, after: next });
  return { departmentId: ctx.department.id };
}
