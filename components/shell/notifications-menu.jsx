"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { markNotificationsRead } from "@/actions/notifications";
import { navigateTo } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { startNavigationProgress } from "./navigation-progress";

/** The bell of the top bar: the person's notifications, read on this screen at once. */
export function NotificationsMenu({ data: server }) {
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
