"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { Paperclip, X, FileText } from "lucide-react";

export const MAX_PROOF_BYTES = 4 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/**
 * Proof files (receipts, slips) chosen for a record. They are kept with the record on this
 * computer and uploaded when it is sent (so they work offline too); the server checks the
 * content (type, 4 MB max). `value` / `onChange`: the chosen File objects.
 */
export function ProofUpload({ value = [], onChange, label = "Attach proof (photo or PDF)" }) {
  const inputRef = useRef(null);

  const handle = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_PROOF_BYTES) {
      toast.error("File is larger than 4 MB. Take a smaller photo.");
      return;
    }
    if (file.type && !ACCEPT.includes(file.type)) {
      toast.error("Only photos (JPEG, PNG, WebP) and PDF files can be attached.");
      return;
    }
    if (value.length >= 5) {
      toast.error("At most 5 files per record.");
      return;
    }
    onChange?.([...value, file]);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Paperclip className="h-3.5 w-3.5" />
        {label}
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="hidden" onChange={handle} data-testid="proof-input" />
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
              <span className="flex items-center gap-1.5 truncate">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                {f.name}
              </span>
              <button type="button" onClick={() => onChange?.(value.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
