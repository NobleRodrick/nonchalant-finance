"use client";

import { useMemo } from "react";
import { AlertTriangle, CloudOff } from "lucide-react";
import { useOutboxOps } from "@/lib/offline/react";
import { STATUS } from "@/lib/offline/status";
import { cn } from "@/lib/utils";

/** Records of this department made on this computer that are not on the server yet. */
export function PendingRecords({ departmentId }) {
  const ops = useOutboxOps();
  const list = useMemo(() => ops.filter((op) => op.departmentId === departmentId && op.status !== STATUS.APPLIED), [ops, departmentId]);
  if (!list.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 shadow-xs" data-testid="pending-records">
      <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-3 text-sm font-semibold text-amber-950">
        <CloudOff className="h-4 w-4" /> Recorded on this computer, not on the server yet ({list.length})
      </div>
      <ul className="divide-y divide-amber-100">
        {list.map((op) => (
          <li key={op.key} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2 text-sm">
            <div className="min-w-0">
              <span className="font-medium text-slate-900">{op.label}</span>
              {op.meta?.summary ? <span className="text-slate-600"> · {op.meta.summary}</span> : null}
              {op.status === STATUS.REJECTED ? (
                <div className="flex items-center gap-1 text-xs text-rose-700"><AlertTriangle className="h-3.5 w-3.5" /> Needs attention: {op.error}</div>
              ) : null}
            </div>
            <span className={cn("shrink-0 text-xs", op.status === STATUS.REJECTED ? "text-rose-700" : "text-amber-800")}>
              {op.dateKey} {op.meta?.time || ""} · {op.status === STATUS.REJECTED ? "refused" : op.status === STATUS.SENDING ? "sending…" : "waiting"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
