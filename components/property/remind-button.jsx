"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runWithToast } from "@/components/kit/client";
import { remindTenants } from "@/actions/property";

/** E-mails a payment reminder to the tenants listed (those with an e-mail address). Needs internet. */
export function RemindAllButton({ departmentId, leaseIds, label = "E-mail reminders" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    await runWithToast(remindTenants({ departmentId, leaseIds }), { success: (r) => `${r.sent} reminder(s) sent${r.skipped ? `, ${r.skipped} skipped (no e-mail, already reminded today, or e-mail not set up)` : ""}.` });
    setBusy(false);
    router.refresh();
  };
  return <Button variant="outline" disabled={busy} onClick={run}><Mail className="h-4 w-4" /> {label} ({leaseIds.length})</Button>;
}
