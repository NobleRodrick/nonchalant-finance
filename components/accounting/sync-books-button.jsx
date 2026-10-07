"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runWithToast } from "@/components/kit/client";
import { syncBooksAction } from "@/actions/accounting";

/** Rebuilds the open months of the books from the records (normally automatic). */
export function SyncBooksButton({ companyId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const r = await runWithToast(syncBooksAction({ companyId, full: true }), { success: (d) => (d.posted || d.reversed ? `Books updated: ${d.posted} entr${d.posted === 1 ? "y" : "ies"} posted, ${d.reversed} reversed.` : "The books were already up to date.") });
    setBusy(false);
    if (r) router.refresh();
  };
  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy}>
      <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Check the books against the records
    </Button>
  );
}
