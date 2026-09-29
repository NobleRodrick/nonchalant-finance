"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeftRight, Bell, BookUser, Building2, Check, ChevronsUpDown, FileCheck2, FileText, Gauge, HandCoins, History,
  LayoutDashboard, LineChart, LogOut, Menu, Settings, ShoppingCart, User, Users, UtensilsCrossed, X, Wine, Shirt, Car,
  BedDouble, Tent, Store, Circle, LayoutGrid,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { logoutUser } from "@/actions/auth";
import { markNotificationsRead } from "@/actions/notifications";
import { cn } from "@/lib/utils";
import { navigateTo } from "@/lib/navigation";
import { NavigationProgress, startNavigationProgress } from "./navigation-progress";
import { OfflineProvider, postToServiceWorker } from "@/components/offline/offline-provider";
import { OfflineBanner, SyncStatus } from "@/components/offline/sync-status";
import { useOutboxCounts } from "@/lib/offline/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ICONS = {
  ArrowLeftRight, Bell, BookUser, Building2, FileCheck2, FileText, Gauge, HandCoins, History, LayoutDashboard, LineChart,
  Settings, ShoppingCart, Users, UtensilsCrossed, Wine, Shirt, Car, BedDouble, Tent, Store, LayoutGrid,
};
const TYPE_ICON = { RESTAURANT: UtensilsCrossed, BAR: Wine, PRESSING: Shirt, CAR_WASH: Car, ROOM_RENTAL: BedDouble, MATERIAL_RENTAL: Tent, SHOP: Store, OTHER: Building2 };
const TYPE_TONE = {
  emerald: "bg-emerald-500/15 text-emerald-300", amber: "bg-amber-500/15 text-amber-300", sky: "bg-sky-500/15 text-sky-300",
  cyan: "bg-cyan-500/15 text-cyan-300", violet: "bg-violet-500/15 text-violet-300", orange: "bg-orange-500/15 text-orange-300",
  pink: "bg-pink-500/15 text-pink-300", slate: "bg-slate-500/20 text-slate-300",
};

function NavItem({ href, label, icon, active, badge, onNavigate }) {
  const Icon = ICONS[icon] || Circle;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300")} />
      <span className="flex-1 truncate">{label}</span>
      {badge ? <span className="rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-slate-950">{badge}</span> : null}
    </Link>
  );
}

function DepartmentCard({ department, departments }) {
  const router = useRouter();
  if (!department) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
        No department yet.
      </div>
    );
  }
  const TypeIcon = TYPE_ICON[department.domain] || Building2;
  const card = (
    <div className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TYPE_TONE[department.domainColor] || TYPE_TONE.slate)}>
        <TypeIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white" data-testid="active-department">{department.name}</span>
        <span className="block truncate text-[11px] text-slate-400">
          {department.domainLabel} · {department.roleLabel}
        </span>
      </span>
      {departments.length > 1 ? <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-500" /> : null}
    </div>
  );
  if (departments.length <= 1) return card;
  const groups = departments.reduce((acc, d) => {
    (acc[d.domainLabel] ||= []).push(d);
    return acc;
  }, {});
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="w-full" aria-label="Switch department" data-testid="department-switcher">
          {card}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {Object.entries(groups).map(([label, list], i) => (
          <div key={label}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-xs text-slate-500">{label}</DropdownMenuLabel>
            {list.map((d) => (
              <DropdownMenuItem key={d.id} onClick={() => { startNavigationProgress(); navigateTo(router, `/d/${d.id}`); }} className="flex items-center justify-between">
                <span className="truncate">{d.name}</span>
                {d.id === department.id ? <Check className="h-4 w-4" /> : null}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Notifications({ data: server }) {
  const router = useRouter();
  // Read on this screen at once (the server is told in the background).
  const [readIds, setReadIds] = useState(() => new Set());
  const [allRead, setAllRead] = useState(false);
  const items = server.items.map((n) => ({ ...n, read: n.read || allRead || readIds.has(n.id) }));
  const data = { items, unread: allRead ? 0 : Math.max(0, server.unread - server.items.filter((n) => !n.read && readIds.has(n.id)).length) };
  const open = (n) => {
    startNavigationProgress();
    navigateTo(router, n.href);
    if (!n.read) {
      setReadIds((s) => new Set([...s, n.id]));
      markNotificationsRead({ id: n.id }).catch(() => {});
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-5 w-5 text-slate-600" />
          {data.unread ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{data.unread}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold">Notifications</span>
          {data.unread ? (
            <button type="button" className="text-xs text-slate-500 hover:text-slate-900" onClick={() => { setAllRead(true); markNotificationsRead({}).catch(() => {}); }}>
              Mark all as read
            </button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {data.items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-slate-500">You are all caught up.</div>
        ) : (
          data.items.map((n) => (
            <DropdownMenuItem key={n.id} onClick={() => open(n)} className="flex items-start gap-2 py-2">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-slate-200" : "bg-emerald-500")} />
              <span className="min-w-0">
                <span className={cn("block text-sm", !n.read && "font-semibold")}>{n.title}</span>
                {n.body ? <span className="block truncate text-xs text-slate-500">{n.body}</span> : null}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar(props) {
  return (
    <OfflineProvider userId={props.user.id} userName={props.user.name} timeZone={props.timeZone} warmUrls={props.warmUrls}>
      <Shell {...props} />
    </OfflineProvider>
  );
}

function Shell({ user, organizationName, departments, lastDepartmentId, boss, canStatements, notifications, businessDate, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const pathDeptId = pathname.startsWith("/d/") ? pathname.split("/")[2] : null;
  const active = useMemo(
    () => departments.find((d) => d.id === pathDeptId) || departments.find((d) => d.id === lastDepartmentId) || departments[0] || null,
    [departments, pathDeptId, lastDepartmentId]
  );

  const isActive = (href) => {
    if (href === `/d/${active?.id}`) return pathname === href;
    if (href === "/boss") return pathname === "/boss";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const counts = useOutboxCounts();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const logout = async (force = false) => {
    // Records not sent yet stay on this computer (sent at the next sign-in): say so first.
    if (!force && counts.waiting + counts.attention > 0) {
      setConfirmLogout(true);
      return;
    }
    setConfirmLogout(false);
    await postToServiceWorker({ type: "purge-pages" }).catch(() => {});
    await logoutUser();
    router.push("/login");
    router.refresh();
  };

  const nav = (
    <nav className="flex h-full flex-col bg-slate-950 text-slate-300" aria-label="Main navigation">
      <div className="flex items-center gap-3 px-4 pb-4 pt-5">
        <Image src="/logo.jpg" alt="Springer Finance" width={32} height={32} className="rounded-md" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{organizationName}</div>
          <div className="text-[11px] text-slate-500">Springer Finance</div>
        </div>
      </div>
      {boss.length ? (
        <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
          <div>
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Business</div>
            <div className="space-y-0.5">
              {boss.map((n) => (
                <NavItem key={n.href} {...n} active={isActive(n.href)} onNavigate={() => setOpen(false)} />
              ))}
            </div>
          </div>
          {active ? (
            <div>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Look into a department</div>
              <DepartmentCard department={active} departments={departments} />
              <div className="mt-2 space-y-0.5">
                {active.nav.map((n) => (
                  <NavItem key={n.href} {...n} active={isActive(n.href)} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="px-3">
            {departments.length > 1 ? (
              <div className="mb-2">
                <NavItem href="/my-departments" label={`All my departments (${departments.length})`} icon="LayoutGrid" active={isActive("/my-departments")} onNavigate={() => setOpen(false)} />
              </div>
            ) : null}
            <DepartmentCard department={active} departments={departments} />
          </div>
          <div className="mt-4 flex-1 space-y-6 overflow-y-auto px-3 pb-4">
            {active ? (
              <div>
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Department</div>
                <div className="space-y-0.5">
                  {active.nav.map((n) => (
                    <NavItem key={n.href} {...n} active={isActive(n.href)} onNavigate={() => setOpen(false)} />
                  ))}
                </div>
              </div>
            ) : null}
            {canStatements ? (
              <div>
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Business</div>
                <NavItem href="/statements" label="Statements" icon="LineChart" active={isActive("/statements")} onNavigate={() => setOpen(false)} />
              </div>
            ) : null}
          </div>
        </>
      )}
      <div className="border-t border-white/10 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/5" aria-label="Account menu">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-slate-950">
                {user.name?.charAt(0)?.toUpperCase() || "U"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{user.name}</span>
                <span className="block truncate text-[11px] text-slate-500">{user.roleLabel}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-slate-500">{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <User className="h-4 w-4" /> Profile & password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => logout(false)} className="text-rose-700">
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <NavigationProgress />
      {/* Fixed sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block print:hidden">{nav}</aside>

      {/* Drawer (phones and tablets) */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute right-2 top-4 z-10 rounded-md p-1 text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur print:hidden sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 truncate text-sm text-slate-500 lg:hidden">{active?.name || organizationName}</div>
          <div className="ml-auto flex items-center gap-2">
            <SyncStatus />
            <span className="hidden text-sm text-slate-500 sm:inline">{businessDate}</span>
            <Notifications data={notifications} />
          </div>
        </header>
        <OfflineBanner />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">{children}</main>
      </div>
      <Dialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Records not sent yet</DialogTitle>
            <DialogDescription>
              {counts.waiting + counts.attention} record(s) made on this computer are not on the server yet. They stay on this computer and are sent the next time you sign in here.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmLogout(false)}>Stay signed in</Button>
            <Button variant="destructive" onClick={() => logout(true)}>Sign out</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
