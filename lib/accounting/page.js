/**
 * Opening an Accounting page: the Boss, an accountant of the company or a head who keeps its books; the books are brought up
 * to date first (departments changed since the last update). A company still in Simple accounting
 * opens its settings, where the Boss can switch it to Full.
 */
import { notFound, redirect } from "next/navigation";
import { pageDate, requirePageUser } from "@/lib/page-guards";
import { accountingAccess } from "./access";
import { syncIfDirty } from "./sync";

export async function accountingPage(companyId, { full = true } = {}) {
  const user = await requirePageUser();
  if (!["ADMIN", "ACCOUNTANT", "HEAD"].includes(user.role)) redirect("/home");
  let access;
  try {
    access = await accountingAccess(user, companyId, { full: false });
  } catch {
    if (user.role === "HEAD") redirect("/home");
    notFound();
  }
  if (full && access.company.accountingLevel !== "FULL") redirect(`/accounting/${companyId}/settings`);
  // Settings are the Boss's and the accountants' (a head keeps the books, he does not set them up).
  if (!full && access.isHead) redirect(`/accounting/${companyId}`);
  if (access.company.accountingLevel === "FULL") await syncIfDirty(companyId);
  const { todayKey, timeZone } = pageDate(user, null);
  return { user, access, company: access.company, todayKey, timeZone };
}
