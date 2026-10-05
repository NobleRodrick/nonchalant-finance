"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Section, inputClass } from "@/components/kit/primitives";
import { runWithToast } from "@/components/kit/client";
import { signOutEverywhere, updatePassword, updateProfile } from "@/actions/auth";
import { PASSWORD_HINT } from "@/components/auth/change-password-form";

export function ProfileForms({ user }) {
  const router = useRouter();
  const [p, setP] = useState({ name: user.name, phone: user.phone });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(null);
  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy("profile");
    if (await runWithToast(updateProfile(p), { success: "Profile saved." })) router.refresh();
    setBusy(null);
  };
  const savePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return runWithToast(Promise.resolve({ success: false, error: "The two new passwords are different." }));
    setBusy("password");
    if (await runWithToast(updatePassword(pw), { success: (d) => d.message })) setPw({ currentPassword: "", newPassword: "", confirm: "" });
    setBusy(null);
  };
  const signOutAll = async () => {
    setBusy("everywhere");
    await runWithToast(signOutEverywhere(), { success: (d) => d.message });
    setBusy(null);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Your details">
        <form className="space-y-4" onSubmit={saveProfile}>
          <Field label="Full name" required htmlFor="pf-name"><input id="pf-name" className={inputClass} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <Field label="E-mail" htmlFor="pf-email" hint="Used to sign in; ask the Boss to change it."><input id="pf-email" className={inputClass} value={user.email} disabled /></Field>
          <Field label="Phone" htmlFor="pf-phone"><input id="pf-phone" className={inputClass} value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
          <Button type="submit" disabled={busy === "profile"}>{busy === "profile" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save</Button>
        </form>
      </Section>
      <Section title="Password">
        <form className="space-y-4" onSubmit={savePassword}>
          <Field label="Current password" required htmlFor="pf-cur"><input id="pf-cur" type="password" autoComplete="current-password" className={inputClass} value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password" required htmlFor="pf-new" hint={PASSWORD_HINT}><input id="pf-new" type="password" autoComplete="new-password" className={inputClass} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Field label="New password again" required htmlFor="pf-confirm"><input id="pf-confirm" type="password" autoComplete="new-password" className={inputClass} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          <Button type="submit" disabled={busy === "password" || !pw.currentPassword || !pw.newPassword}>{busy === "password" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Change password</Button>
        </form>
        <div className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-600">
          <p className="mb-2">Lost a phone, or signed in on a shared computer? Sign out every other device.</p>
          <Button type="button" variant="outline" disabled={busy === "everywhere"} onClick={signOutAll}>{busy === "everywhere" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Sign out everywhere else</Button>
        </div>
      </Section>
    </div>
  );
}
