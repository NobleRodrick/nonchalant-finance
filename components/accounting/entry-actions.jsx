"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Section, inputClass } from "@/components/kit/primitives";
import { runWithToast } from "@/components/kit/client";
import { navigateTo } from "@/lib/navigation";
import { decideManualEntryAction, deleteDraftEntryAction, reverseManualEntryAction } from "@/actions/accounting";

/** What can be done with a manual entry: edit a draft, approve / reject, reverse, delete a draft. */
export function EntryActions({ companyId, entry, canApprove }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!entry.isManual) return null;
  const run = async (promise, success, goList = false) => {
    setBusy(true);
    const ok = await runWithToast(promise, { success });
    setBusy(false);
    if (ok) {
      setReason("");
      if (goList) navigateTo(router, `/accounting/${companyId}/entries`);
      else router.refresh();
    }
  };
  const editable = ["DRAFT", "REJECTED", "PENDING"].includes(entry.status);
  return (
    <Section title="Actions">
      <div className="space-y-3">
        {editable ? <Button asChild variant="outline" size="sm"><Link href={`/accounting/${companyId}/entries/new?edit=${entry.id}`}>Edit</Link></Button> : null}
        {entry.status === "PENDING" && canApprove ? (
          <div className="space-y-2">
            <Button size="sm" disabled={busy} onClick={() => run(decideManualEntryAction({ companyId, entryId: entry.id, decision: "APPROVE" }), "Entry approved and posted.")}>Approve and post</Button>
            <Field label="Or reject, saying why" htmlFor="ea-reason"><input id="ea-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => run(decideManualEntryAction({ companyId, entryId: entry.id, decision: "REJECT", reason }), "Entry rejected.")}>Reject</Button>
          </div>
        ) : null}
        {entry.status === "POSTED" && !entry.reversed ? (
          <div className="space-y-2">
            <Field label="Reverse it (a mistake): why?" htmlFor="ea-rev"><input id="ea-rev" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => run(reverseManualEntryAction({ companyId, entryId: entry.id, reason }), "Entry reversed.")}>Reverse the entry</Button>
          </div>
        ) : null}
        {["DRAFT", "REJECTED"].includes(entry.status) ? <Button size="sm" variant="ghost" className="text-rose-700" disabled={busy} onClick={() => run(deleteDraftEntryAction({ companyId, entryId: entry.id }), "Draft deleted.", true)}>Delete the draft</Button> : null}
      </div>
    </Section>
  );
}
