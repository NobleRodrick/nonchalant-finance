import Link from "next/link";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { rentalSearch } from "@/lib/rental/search";
import { propertySearch } from "@/lib/property/search";
import { formatMoney } from "@/lib/format";
import { EmptyState, PageHeader, Section } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

/** What each department type searches, its groups and its example (lib/<type>/search). */
const SEARCHES = {
  MATERIAL_RENTAL: {
    run: rentalSearch,
    groups: [["bookings", "Bookings"], ["customers", "Customers"], ["items", "Items"], ["money", "Payments and expenses"], ["documents", "Documents and purchases"]],
    placeholder: "e.g. Ngono, 6770, B-0012, chairs, R-0031…",
    description: "Customers, bookings, items, payments, expenses, purchases and documents — by name, phone, reference number or description.",
  },
  PROPERTY_RENTAL: {
    run: propertySearch,
    groups: [["owing", "Tenants owing more than that"], ["tenants", "Tenants"], ["offices", "Offices"], ["contracts", "Contracts"], ["money", "Payments, receipts and expenses"], ["records", "Charges, maintenance, inspections"]],
    placeholder: "e.g. XYZ, 677…, A12, LC-0004, RC-0031, owing more than 100000",
    description: "Tenants, offices, buildings, contracts, payments, receipts, charges, maintenance — by name, phone, number or reference. “owing more than 100000” lists who owes more.",
  },
};

/** One search across the department (?q=): bookings, customers, items, money records, documents. */
export default async function SearchPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain } = await departmentPage(deptId, { module: "search" });
  const { timeZone, todayKey } = pageDate(user, null);
  const S = SEARCHES[department.domain] || SEARCHES.MATERIAL_RENTAL;
  const GROUPS = S.groups;
  const found = await S.run({ departmentId: department.id, q: sp.q, timeZone, todayKey });
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Search" description={S.description} />
      <FilterBar fields={[{ name: "q", label: "Search", type: "search", placeholder: S.placeholder }]} />
      {!found ? (
        <p className="text-sm text-slate-500">Type at least 2 characters.</p>
      ) : !found.total ? (
        <EmptyState title="Nothing found" description={`Nothing matches “${found.q}”.`} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2" data-testid="search-results">
          {GROUPS.filter(([k]) => found.groups[k]?.length).map(([k, title]) => (
            <Section key={k} title={title} description={`${found.groups[k].length}${found.groups[k].length >= 20 ? "+ (refine the search)" : ""}`} bodyClassName="p-0">
              <ul className="divide-y divide-slate-100">
                {found.groups[k].map((r) => (
                  <li key={r.id}>
                    <Link href={`${base}${r.href}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{r.title}</span>
                        <span className="block truncate text-xs text-slate-500">{r.detail}</span>
                      </span>
                      {r.amount !== undefined ? <span className="whitespace-nowrap text-sm tabular-nums text-slate-700">{formatMoney(r.amount)}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
