"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "./ui/button";
import {
  Banknote,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  HandCoins,
  Layers,
  LayoutDashboard,
  Menu,
  PenBox,
  Users,
  Utensils,
  X,
} from "lucide-react";

const commonLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "text-blue-600" },
  { href: "/stock", label: "Stock Control", icon: Boxes, color: "text-indigo-600" },
  { href: "/menu", label: "Menu", icon: Utensils, color: "text-emerald-600" },
  { href: "/debts", label: "Debts", icon: CreditCard, color: "text-amber-600" },
  { href: "/cash-handover", label: "Cash Handover", icon: HandCoins, color: "text-blue-600" },
  { href: "/reports", label: "Reports", icon: FileText, color: "text-emerald-600" },
];

export function AppSidebar({ user }) {
  const [open, setOpen] = useState(false);
  const isAdmin = user?.role === "ADMIN";
  const links = isAdmin
    ? [
        ...commonLinks,
        { href: "/organization/employees", label: "Staff", icon: Users, color: "text-indigo-600" },
        { href: "/organization/departments", label: "Departments", icon: Layers, color: "text-purple-600" },
      ]
    : commonLinks;

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
        className={`fixed bottom-0 left-0 top-16 z-50 flex w-72 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 lg:w-72 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Workspace</p>
            <p className="mt-1 truncate text-sm font-bold text-slate-900">{user?.organization?.name || "Business Operations"}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close navigation" title="Close navigation" onClick={() => setOpen(false)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main navigation">
          <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Operations</p>
          {links.slice(0, commonLinks.length).map(({ href, label, icon: Icon, color }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950">
              <Icon className={`h-4 w-4 ${color}`} />
              <span>{label}</span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
          <Link href="/transaction/create?tab=sales" onClick={() => setOpen(false)} className="mt-3 flex items-center gap-3 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700">
            <Banknote className="h-4 w-4" />
            <span>Record Sales</span>
          </Link>
          <Link href="/transaction/create?tab=purchases" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg border border-blue-200 px-3 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50">
            <PenBox className="h-4 w-4" />
            <span>Purchases & Expenses</span>
          </Link>

          {isAdmin && (
            <>
              <p className="px-3 pb-2 pt-6 text-[11px] font-bold uppercase tracking-wider text-slate-400">Administration</p>
              {links.slice(commonLinks.length).map(({ href, label, icon: Icon, color }) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span>{label}</span>
                </Link>
              ))}
            </>
          )}
        </nav>

        <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
          <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-blue-600" /><span className="truncate">{user?.department?.name || (isAdmin ? "All departments" : "Assigned department")}</span></div>
        </div>
      </aside>
    </>
  );
}
