"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icons";

/** One link of the sidebar. */
export function NavItem({ href, label, icon, active, badge, onNavigate, nested = false }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        nested ? "py-1.5" : "py-2",
        active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
      )}
    >
      <NavIcon name={icon} className={cn("h-4 w-4 shrink-0", active ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300")} aria-hidden="true" />
      <span className="flex-1 truncate">{label}</span>
      {badge ? <span className="rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-slate-950">{badge}</span> : null}
    </Link>
  );
}

/** A titled group of the sidebar. */
export function NavSection({ title, children, action = null }) {
  return (
    <div>
      <div className="flex items-center justify-between px-3 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</span>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
