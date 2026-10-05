"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfflineProvider } from "@/components/offline/offline-provider";
import { OfflineBanner, SyncStatus } from "@/components/offline/sync-status";
import { NavigationProgress } from "./navigation-progress";
import { NavItem, NavSection } from "./nav-item";
import { DepartmentTree, isActiveHref } from "./department-tree";
import { NotificationsMenu } from "./notifications-menu";
import { AccountMenu } from "./account-menu";

export function Sidebar(props) {
  return (
    <OfflineProvider userId={props.user.id} userName={props.user.name} timeZone={props.timeZone} warmUrls={props.warmUrls}>
      <Shell {...props} />
    </OfflineProvider>
  );
}

/**
 * The navigation: the business (the Boss's own tools, or a head's overview of several
 * departments), then every department, each opening to its own sections, then the account.
 */
function Navigation({ user, organizationName, departments, currentId, business, pathname, onNavigate }) {
  return (
    <nav className="flex h-full flex-col bg-slate-950 text-slate-300" aria-label="Main navigation">
      <div className="flex items-center gap-3 px-4 pb-4 pt-5">
        <Image src="/logo.jpg" alt="Springer Finance" width={32} height={32} className="rounded-md" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{organizationName}</div>
          <div className="text-[11px] text-slate-500">Springer Finance</div>
        </div>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {business.length ? (
          <NavSection title="Business">
            {business.map((n) => (
              <NavItem key={n.href} {...n} active={isActiveHref(pathname, n.href, { exact: n.exact })} onNavigate={onNavigate} />
            ))}
          </NavSection>
        ) : null}
        <NavSection title={departments.length > 1 ? `Departments (${departments.length})` : "Department"}>
          <DepartmentTree departments={departments} currentId={currentId} pathname={pathname} onNavigate={onNavigate} />
        </NavSection>
      </div>
      <div className="border-t border-white/10 p-3">
        <AccountMenu user={user} />
      </div>
    </nav>
  );
}

function Shell({ user, organizationName, departments, lastDepartmentId, business, notifications, businessDate, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const pathDeptId = pathname.startsWith("/d/") ? pathname.split("/")[2] : null;
  const current = departments.find((d) => d.id === pathDeptId) || null;
  const close = () => setOpen(false);

  const navigation = (
    <Navigation
      user={user}
      organizationName={organizationName}
      departments={departments}
      currentId={current?.id || (departments.length === 1 ? departments[0].id : pathDeptId || lastDepartmentId)}
      business={business}
      pathname={pathname}
      onNavigate={close}
    />
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <NavigationProgress />
      {/* Fixed sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block print:hidden">{navigation}</aside>

      {/* Drawer (phones and tablets) */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-slate-950/50" onClick={close} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <button type="button" aria-label="Close navigation" onClick={close} className="absolute right-2 top-4 z-10 rounded-md p-1 text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            {navigation}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur print:hidden sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 truncate text-sm text-slate-500 lg:hidden">{current?.name || organizationName}</div>
          <div className="ml-auto flex items-center gap-2">
            <SyncStatus />
            <span className="hidden text-sm text-slate-500 sm:inline">{businessDate}</span>
            <NotificationsMenu data={notifications} />
          </div>
        </header>
        <OfflineBanner />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
