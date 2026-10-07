/**
 * Printed documents of shops, bars, pressings, car washes and jobs (sale receipt, ticket / drop-off
 * slip, payment receipt, invoice): the letterhead of the department, completed by its company's
 * legal name, NIU and RCCM when the company keeps Full accounting or charges VAT (formal business),
 * and the VAT included in the total when VAT applies on that day. An informal business prints a
 * plain receipt with its own details only.
 */
import { db } from "@/lib/prisma";
import { readProfile } from "@/lib/business-profile";
import { attachmentUrl } from "@/lib/attachments";
import { vatIncluded, vatOn } from "@/lib/accounting/rules";

export async function documentBusiness(department, client = db) {
  const p = readProfile(department);
  const company = department.companyId ? await client.company.findUnique({ where: { id: department.companyId } }) : null;
  const formal = Boolean(company && (company.accountingLevel === "FULL" || company.vatEnabled));
  return {
    company,
    formal,
    business: {
      ...p,
      name: department.name,
      legalName: p.legalName || (formal ? company.legalName || company.name : null),
      taxId: p.taxId || (formal ? company.taxId : null),
      registration: p.registration || (formal ? company.tradeRegister : null),
      address: p.address || (formal ? company.address : null),
      phone: p.phone || (formal ? company.phone : null),
      logoUrl: p.logoId ? attachmentUrl(p.logoId) : null,
    },
  };
}

/** The "excl. VAT" and "VAT" rows of a total (VAT included in prices), or [] when VAT is off that day. */
export function vatRows(total, company, dateKey, categories = []) {
  const vat = vatOn(company, dateKey);
  if (!vat || !total) return [];
  if (categories.length && categories.every((c) => vat.exempt.has(c))) return [];
  const tax = vatIncluded(total, vat.rateBp);
  return [
    { label: "Total excl. VAT (HT)", value: total - tax },
    { label: `VAT ${(vat.rateBp / 100).toLocaleString("fr-FR")} % included`, value: tax },
  ];
}

export const METHOD_WORDS = { CASH: "Cash", MOMO: "Mobile Money", BANK_TRANSFER: "Bank transfer", OTHER: "Other", CREDIT: "On credit" };
