"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { DomainTile } from "@/components/domains/domain-icon";
import { cn } from "@/lib/utils";
import { NavItem } from "./nav-item";

const STORAGE_KEY = "sf-sidebar-open";
/** With more departments than this, a filter box appears above the list. */
const FILTER_FROM = 7;

function readOpen() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveOpen(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable: the choice lasts while the page is open
  }
}

/** Is `href` the page shown (a department's home only on its own path)? */
export function isActiveHref(pathname, href, { exact = false } = {}) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One department: its name (a button that opens and closes it) and, when open, its sections.
 * The department of the page shown is marked even when closed.
 */
function DepartmentGroup({ department, open, current, pathname, onToggle, onNavigate }) {
  const panelId = useId();
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={`dept-toggle-${department.name}`}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
          current ? "text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
        )}
      >
        <DomainTile domain={department.domain} color={department.domainColor} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{department.name}</span>
          <span className="block truncate text-[11px] font-normal text-slate-500">
            {department.domainLabel}
            {department.role === "ADMIN" ? " · view only" : department.role === "OWNER" ? " · you run it" : ""}
          </span>
        </span>
        {current && !open ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-label="Current department" /> : null}
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform duration-150", open && "rotate-90")} aria-hidden="true" />
      </button>
      {open ? (
        <ul id={panelId} className="mb-1 ml-[1.375rem] space-y-0.5 border-l border-white/10 pl-2" data-testid={`dept-nav-${department.name}`}>
          {department.nav.map((n) => (
            <li key={n.href}>
              <NavItem {...n} nested active={isActiveHref(pathname, n.href, { exact: n.id === "home" })} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Every department the person may open, each one expanding to its own sections (from its type,
 * lib/domains). The department of the page shown opens by itself; which ones are open is
 * remembered on this computer. A single department is always open.
 */
export function DepartmentTree({ departments, currentId, pathname, onNavigate }) {
  const single = departments.length === 1;
  const [openIds, setOpenIds] = useState(() => (currentId ? [currentId] : []));
  const [filter, setFilter] = useState("");

  // What was open last time on this computer (after the first render, which the server shares).
  useEffect(() => {
    const saved = readOpen();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a choice stored in the browser
    if (saved.length) setOpenIds((ids) => [...new Set([...ids, ...saved])]);
  }, []);

  // Moving to another department opens it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the page shown
    if (currentId) setOpenIds((ids) => (ids.includes(currentId) ? ids : [...ids, currentId]));
  }, [currentId]);

  const toggle = (id) => {
    setOpenIds((ids) => {
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      saveOpen(next);
      return next;
    });
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => d.name.toLowerCase().includes(q) || d.domainLabel.toLowerCase().includes(q));
  }, [departments, filter]);

  if (!departments.length) {
    return <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-400">No department yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      {departments.length >= FILTER_FROM ? (
        <label className="relative block px-1">
          <span className="sr-only">Find a department</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a department"
            className="h-8 w-full rounded-md border border-white/10 bg-white/5 pl-8 pr-2 text-xs text-white placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
          />
        </label>
      ) : null}
      <ul className="space-y-0.5" aria-label="Departments">
        {shown.map((d) => (
          <DepartmentGroup
            key={d.id}
            department={d}
            open={single || openIds.includes(d.id) || Boolean(filter)}
            current={d.id === currentId}
            pathname={pathname}
            onToggle={() => toggle(d.id)}
            onNavigate={onNavigate}
          />
        ))}
        {!shown.length ? <li className="px-3 py-2 text-xs text-slate-500">No department matches.</li> : null}
      </ul>
    </div>
  );
}
