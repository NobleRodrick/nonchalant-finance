import Image from "next/image";

/** Pieces of printed documents (receipts, statements) shared by every department type. */
export const METHOD = { CASH: "Cash", MOMO: "Mobile Money", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

export function DocumentRow({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between gap-4 py-1 ${strong ? "font-semibold text-slate-900" : ""}`}>
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

/** The document's head: business, department, document title and number. */
export function DocumentHead({ organization, department, title, number, when }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
      <div className="flex items-center gap-3">
        <Image src="/logo.jpg" alt="" width={40} height={40} className="rounded-md" />
        <div>
          <div className="text-base font-bold text-slate-900">{organization}</div>
          <div className="text-sm text-slate-600">{department}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold uppercase tracking-wide text-slate-900">{title}</div>
        <div className="font-mono text-sm text-slate-700">{number}</div>
        <div className="text-xs text-slate-500">{when}</div>
      </div>
    </header>
  );
}

