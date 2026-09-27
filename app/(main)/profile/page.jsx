import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ROLE_LABELS } from "@/lib/permissions";
import { getDomain } from "@/lib/domains/registry";
import { Banner, PageHeader, Pill, Section } from "@/components/kit/primitives";
import { ProfileForms } from "@/components/profile-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Your profile" description="Your details, your password and the departments you head." />
      {sp?.notice === "no-department" || sp?.notice === "no-organization" ? (
        <Banner tone="warn">You are not assigned to a department yet. Ask the Boss to assign you from “People”.</Banner>
      ) : null}
      <ProfileForms user={{ name: user.name, email: user.email, phone: user.phone || "" }} />
      <Section title={user.role === "ADMIN" ? "Your business" : "Departments you head"}>
        <div className="mb-3 text-sm text-slate-600">
          {user.title ? <>Title: <strong>{user.title}</strong> · </> : null}Role: <strong>{ROLE_LABELS[user.role]}</strong>{user.organization ? ` · ${user.organization.name}` : ""}
          {user.role !== "ADMIN" ? <span className="block text-xs text-slate-500">Your title and departments are set by the Boss.</span> : null}
        </div>
        {user.role === "ADMIN" ? (
          <p className="text-sm text-slate-600">As the Boss you have access to every department.</p>
        ) : user.memberships?.length ? (
          <ul className="space-y-2">
            {user.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">{m.isPrimary ? "★" : ""} {m.department?.name} <Pill tone={getDomain(m.department?.domain).color}>{getDomain(m.department?.domain).label}</Pill></span>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">Department head</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No department yet.</p>
        )}
      </Section>
    </div>
  );
}
