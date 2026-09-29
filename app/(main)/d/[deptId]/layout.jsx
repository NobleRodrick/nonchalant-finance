import Link from "next/link";
import { Eye } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { findOrgDepartment } from "@/lib/access";

/**
 * Department pages. The Boss sees them read-only (oversight): the department head and staff
 * record the day. A strip says so and links to the Boss's own tools.
 */
export default async function DepartmentLayout({ children, params }) {
  const { deptId } = await params;
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return children;
  const department = await findOrgDepartment(user.organizationId, deptId);
  if (!department) return children;
  return (
    <>
      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-xs sm:flex-row sm:items-center sm:justify-between print:hidden" data-testid="boss-view-only">
        <span className="flex items-center gap-2">
          <Eye className="h-4 w-4 shrink-0 text-slate-500" />
          <span>You are looking into <strong>{department.name}</strong> as the Boss (view only). Its head and staff record the day.</span>
        </span>
        <span className="flex shrink-0 gap-3 text-sm font-medium">
          <Link className="underline" href={`/boss/people?dept=${deptId}`}>Team</Link>
          <Link className="underline" href={`/boss/daily-reports?dept=${deptId}`}>Reports</Link>
          <Link className="underline" href={`/boss/cash?dept=${deptId}`}>Cash</Link>
        </span>
      </div>
      {children}
    </>
  );
}
