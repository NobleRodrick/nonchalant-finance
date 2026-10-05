"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/kit/primitives";
import { logoutUser, updatePassword } from "@/actions/auth";

export const PASSWORD_HINT = "At least 8 characters with letters and numbers; not a common password, not your name or e-mail.";

/** The forced first change of a temporary password. */
export function ChangePasswordForm({ next = "/home" }) {
  const router = useRouter();
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast.error("The two new passwords are different.");
    setBusy(true);
    const res = await updatePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
    setBusy(false);
    if (!res?.success) return toast.error(res?.error || "The password could not be changed.");
    toast.success("Your password is set.");
    router.replace(next);
    router.refresh();
  };
  const signOut = async () => {
    await logoutUser();
    router.replace("/login");
    router.refresh();
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <Field label="Temporary password" required htmlFor="cp-current">
        <input id="cp-current" type="password" autoComplete="current-password" className={inputClass} value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
      </Field>
      <Field label="New password" required htmlFor="cp-new" hint={PASSWORD_HINT}>
        <input id="cp-new" type="password" autoComplete="new-password" className={inputClass} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
      </Field>
      <Field label="New password again" required htmlFor="cp-confirm">
        <input id="cp-confirm" type="password" autoComplete="new-password" className={inputClass} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
      </Field>
      <div className="flex items-center justify-between gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={signOut}>Sign out</Button>
        <Button type="submit" disabled={busy || !pw.currentPassword || !pw.newPassword}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save my password
        </Button>
      </div>
    </form>
  );
}
