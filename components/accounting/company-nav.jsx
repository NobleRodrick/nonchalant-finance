"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The sections of a company's books (Full accounting: all; Simple: settings only). A head limited to
 * his departments has no company-wide sections (reconciliation, closing); heads have no settings.
 */
export function CompanyNav({ companyId, full, features = {}, pending = 0, access = { companyWide: true, settings: true } }) {
  const pathname = usePathname();
  const base = `/accounting/${companyId}`;
  const tabs = full
    ? [
        ["", "Overview"],
        ["/entries", "Entries", pending],
        ["/ledger", "General ledger"],
        ["/trial-balance", "Trial balance"],
        ["/statements", "Statements"],
        ["/partners", "Customers & suppliers"],
        features.vat ? ["/vat", "VAT"] : null,
        features.payables ? ["/bills", "Supplier bills"] : null,
        features.reconciliation && access.companyWide ? ["/reconciliation", "Reconciliation"] : null,
        access.companyWide ? ["/closing", "Closing"] : null,
        access.settings ? ["/settings", "Settings"] : null,
      ].filter(Boolean)
    : [["/settings", "Settings"]];
  return (
    <nav aria-label="Books" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-1 print:hidden">
      {tabs.map(([path, label, badge]) => {
        const href = `${base}${path}`;
        const active = path === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link key={path} href={href} aria-current={active ? "page" : undefined} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm", active ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {label}
            {badge ? <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
