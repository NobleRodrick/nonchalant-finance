"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Loader2, X, FileText } from "lucide-react";
import { uploadAttachment } from "@/actions/attachments";

/**
 * Uploads proof files (receipts, slips) and reports their ids via onChange(ids).
 * Files are validated on the server (type by content, 4 MB max).
 */
export function ProofUpload({ departmentId, value = [], onChange, label = "Attach proof (photo or PDF)" }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const handle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("File is larger than 4 MB. Take a smaller photo.");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    if (departmentId) fd.append("departmentId", departmentId);
    const res = await uploadAttachment(fd);
    setBusy(false);
    if (!res?.success) {
      toast.error(res?.error || "Upload failed.");
      return;
    }
    const next = [...files, res.data];
    setFiles(next);
    onChange?.([...value, res.data.id]);
  };

  const remove = (id) => {
    setFiles(files.filter((f) => f.id !== id));
    onChange?.(value.filter((v) => v !== id));
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        {label}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handle} />
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
              <span className="flex items-center gap-1.5 truncate">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                {f.fileName}
              </span>
              <button type="button" onClick={() => remove(f.id)} aria-label="Remove file">
                <X className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
