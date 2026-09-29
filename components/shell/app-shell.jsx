import { db } from "@/lib/prisma";
import { accessibleDepartments, effectiveRole, orgTimezone } from "@/lib/access";
import { departmentNavigation, getDomain } from "@/lib/domains/registry";
import { ROLE_LABELS, personLabel, roleHasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatDateKey, toDateKey } from "@/lib/timezone";
import { unreadNotifications } from "@/lib/notifications";
import { Sidebar } from "./sidebar";

/**
 * Signed-in layout: a fixed sidebar on the left (a drawer on phones), a slim top bar with the
 * business date and notifications, and the page. The sidebar shows the active department's
 * modules (by department type and the user's role there) and, for the Boss, his own section.
 */
export async function AppShell({ user, children }) {
  const timeZone = orgTimezone(user);
  const hasOrg = Boolean(user.organizationId);
  const [departments, notifications, pending] = await Promise.all([
    hasOrg ? accessibleDepartments(user) : [],
    unreadNotifications(user.id),
    hasOrg && user.role === "ADMIN"
      ? Promise.all([
          db.dailyReport.count({ where: { organizationId: user.organizationId, status: { in: ["SUBMITTED", "REVIEWED"] } } }),
          db.cashHandover.count({ where: { organizationId: user.organizationId, status: "RECORDED" } }),
        ])
      : [0, 0],
  ]);

  const depts = departments.map((d) => {
    const role = effectiveRole(user, d.id);
    const domain = getDomain(d.domain);
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      domain: d.domain,
      domainLabel: domain.label,
      domainColor: domain.color,
      enabled: domain.enabled,
      role,
      roleLabel: role === "ADMIN" ? "View only" : ROLE_LABELS.HEAD,
      nav: departmentNavigation(d, role),
    };
  });
  const canStatements = user.role === "ADMIN" || departments.some((d) => roleHasPermission(effectiveRole(user, d.id), PERMISSIONS.STATEMENTS_READ));

  // The Boss runs the business, not a department: his own tools first, departments to look into.
  const boss =
    user.role === "ADMIN"
      ? [
          { href: "/boss", label: "Overview", icon: "Gauge" },
          { href: "/boss/departments", label: "Departments", icon: "Building2" },
          { href: "/boss/people", label: "People", icon: "Users" },
          { href: "/boss/daily-reports", label: "Daily reports", icon: "FileCheck2", badge: pending[0] },
          { href: "/boss/cash", label: "Cash received", icon: "HandCoins", badge: pending[1] },
          { href: "/statements", label: "Statements", icon: "LineChart" },
          { href: "/boss/settings", label: "Settings", icon: "Settings" },
        ]
      : [];

  // Pages kept on this computer for offline use (lib/offline, public/sw.js).
  const warmUrls =
    user.role === "ADMIN"
      ? ["/boss", "/boss/daily-reports", "/boss/cash", "/boss/departments", "/boss/people", "/profile"]
      : [
          ...depts.filter((d) => d.enabled).slice(0, 4).flatMap((d) => d.nav.map((n) => n.href)),
          depts.length > 1 ? "/my-departments" : null,
          "/profile",
        ].filter(Boolean);

  return (
    <Sidebar
      timeZone={timeZone}
      warmUrls={warmUrls}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleLabel: personLabel(user),
      }}
      organizationName={user.organization?.name || "Springer Finance"}
      departments={depts}
      lastDepartmentId={user.activeDepartmentId || null}
      boss={boss}
      canStatements={canStatements}
      notifications={{ items: notifications.items.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, read: Boolean(n.readAt), createdAt: n.createdAt.toISOString() })), unread: notifications.unread }}
      businessDate={formatDateKey(toDateKey(new Date(), timeZone))}
    >
      {children}
    </Sidebar>
  );
}
