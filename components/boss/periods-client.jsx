"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { closeAccountingPeriod, createAccountingPeriod, reopenAccountingPeriod } from "@/actions/periods";
import { runWithToast } from "@/components/kit/client";
import { DataTable, Section, StatusBadge } from "@/components/kit/primitives";

export function PeriodsClient({ periods = [] }) {
  const router = useRouter();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const create = async (e) => {
    e.preventDefault();
    if (await runWithToast(createAccountingPeriod({ month }), { success: "Period created." })) router.refresh();
  };
  const close = async (p) => {
    if (!confirm(`Close ${p.name}? No transaction dated in this month can then be recorded or voided until it is reopened.`)) return;
    if (await runWithToast(closeAccountingPeriod(p.id), { success: `${p.name} closed.` })) router.refresh();
  };
  const reopen = async (p) => {
    if (await runWithToast(reopenAccountingPeriod(p.id), { success: `${p.name} reopened.` })) router.refresh();
  };
  return (
    <div className="space-y-5">
      <Section title="Accounting periods" description="Close a month once its daily reports are approved. Nothing dated in a closed month can then be recorded or voided.">
        <form className="flex flex-wrap items-end gap-2" onSubmit={create}>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" aria-label="Month" />
          <Button type="submit" size="sm"><Plus className="h-4 w-4" /> Create period</Button>
        </form>
        <div className="mt-4" />
        <DataTable
          columns={[
            { key: "n", label: "Period", render: (p) => p.name },
            { key: "r", label: "Range", render: (p) => <span className="text-xs">{new Date(p.startDate).toLocaleDateString("en-GB")} – {new Date(p.endDate).toLocaleDateString("en-GB")}</span> },
            { key: "s", label: "Status", render: (p) => <StatusBadge status={p.status} /> },
            { key: "c", label: "Closed", render: (p) => <span className="text-xs">{p.closedAt ? new Date(p.closedAt).toLocaleString("en-GB") : "—"}</span> },
            { key: "a", label: "", align: "right", render: (p) => (p.status === "OPEN"
              ? <Button size="sm" variant="outline" onClick={() => close(p)}><Lock className="h-3.5 w-3.5" /> Close</Button>
              : <Button size="sm" variant="ghost" onClick={() => reopen(p)}><LockOpen className="h-3.5 w-3.5" /> Reopen</Button>) },
          ]}
          rows={periods}
          empty="No periods yet. Without periods, days are protected only by their sent daily reports."
        />
      </Section>
    </div>
  );
}
