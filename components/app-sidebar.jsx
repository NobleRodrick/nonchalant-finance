"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "./ui/button";
import {
  Boxes,
  CalendarCheck,
  ChefHat,
  ChevronLeft,
  CreditCard,
  FileCheck,
  FileText,
  HandCoins,
  Layers,
  LayoutDashboard,
  Menu,
  Users,
  Utensils,
  X,
} from "lucide-react";

const operationsLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "text-blue-600" },
  { href: "/restaurant", label: "Restaurant Hub", icon: ChefHat, color: "text-emerald-600" },
  { href: "/menu", label: "Menu & Dishes", icon: Utensils, color: "text-amber-600" },
  { href: "/stock", label: "Stock Control", icon: Boxes, color: "text-indigo-600" },
  { href: "/debts", label: "Debts & Receivables", icon: CreditCard, color: "text-rose-600" },
  { href: "/cash-handover", label: "Cash Handover", icon: HandCoins, color: "text-blue-600" },
  { href: "/daily-close", label: "Daily Close", icon: CalendarCheck, color: "text-purple-600" },
  { href: "/reports", label: "Reports & Statements", icon: FileText, color: "text-slate-700" },
];

const managementLinks = [
  { href: "/reports/inbox", label: "Boss Report Inbox", icon: FileCheck, color: "text-emerald-600" },
  { href: "/organization/employees", label: "Staff & Roles", icon: Users, color: "text-indigo-600" },
  { href: "/organization/departments", label: "Departments", icon: Layers, color: "text-purple-600" },
];

export function AppSidebar({ user }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const isAdmin = user?.role === "ADMIN";

  const closeOnMobile = () => {
    if (window.innerWidth < 1024) setOpen(false);
  };

  const linkClassName = (href, color) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
      pathname === href || (href !== "/reports" && pathname.startsWith(`${href}/`))
        ? "bg-slate-900 text-white shadow-sm"
        : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
    }`;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={open ? "Close navigation" : "Open navigation"}
        title={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen((value) => !value)}
        className="border-slate-300 bg-white shadow-sm"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {open && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 top-16 z-40 bg-slate-950/25 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed bottom-0 left-0 top-16 z-50 flex h-[calc(100vh-4rem)] w-[min(18rem,calc(100vw-1rem))] flex-col overflow-hidden border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</p>
            <p className="mt-0.5 truncate text-sm font-bold text-slate-900">
              {user?.organization?.name || "Business Operations"}
            </p>
            {user?.department && (
              <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                {user.department.name}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close navigation"
            title="Close navigation"
            onClick={() => setOpen(false)}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 [scrollbar-color:#cbd5e1_transparent]" aria-label="Main navigation">
          <div>
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Operations</p>
            <div className="space-y-1">
              {operationsLinks.map(({ href, label, icon: Icon, color }) => (
                <Link key={href} href={href} onClick={closeOnMobile} className={linkClassName(href, color)}>
                  <Icon className={`h-4 w-4 ${pathname === href ? "text-white" : color}`} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="pt-2 border-t border-slate-100">
              <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Executive & Admin</p>
              <div className="space-y-1">
                {managementLinks.map(({ href, label, icon: Icon, color }) => (
                  <Link key={href} href={href} onClick={closeOnMobile} className={linkClassName(href, color)}>
                    <Icon className={`h-4 w-4 ${pathname === href ? "text-white" : color}`} />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
