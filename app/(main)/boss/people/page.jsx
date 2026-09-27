import { db } from "@/lib/prisma";
import { requirePageUser } from "@/lib/page-guards";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PeopleClient } from "@/components/boss/people-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }) {
  const sp = await searchParams;
  const user = await requirePageUser({ admin: true });
  const [departments, users] = await Promise.all([
    db.department.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, email: true, phone: true, title: true, role: true, isActive: true, memberships: { include: { department: { select: { id: true, name: true, domain: true } } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);
  return (
    <div>
      <PageHeader title="People" description="Your department heads. Give each a title (Accountant, Manager …) and the departments they head: one person can head several departments, even of different types. Reset passwords or deactivate an account here." />
      <PeopleClient initialData={serialize({ departments, users })} currentUserId={user.id} focusDeptId={departments.some((d) => d.id === sp?.dept) ? sp.dept : null} />
    </div>
  );
}
