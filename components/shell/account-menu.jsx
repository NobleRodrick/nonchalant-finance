"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { logoutUser } from "@/actions/auth";
import { postToServiceWorker } from "@/components/offline/offline-provider";
import { useOutboxCounts } from "@/lib/offline/react";

/**
 * The signed-in person at the bottom of the sidebar: profile and sign out. Records not sent yet
 * stay on this computer (sent at the next sign-in): signing out says so first.
 */
export function AccountMenu({ user }) {
  const router = useRouter();
  const counts = useOutboxCounts();
  const [confirm, setConfirm] = useState(false);
  const waiting = counts.waiting + counts.attention;

  const logout = async (force = false) => {
    if (!force && waiting > 0) {
      setConfirm(true);
      return;
    }
    setConfirm(false);
    await postToServiceWorker({ type: "purge-pages" }).catch(() => {});
    await logoutUser();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
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
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Records not sent yet</DialogTitle>
            <DialogDescription>
              {waiting} record(s) made on this computer are not on the server yet. They stay on this computer and are sent the next time you sign in here.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>Stay signed in</Button>
            <Button variant="destructive" onClick={() => logout(true)}>Sign out</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
