"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/kit/primitives";

/** Choosing an account (or a class / group) by number, with the chart as suggestions. */
export function AccountPicker({ accounts, value }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [v, setV] = useState(value);
  const go = (e) => {
    e?.preventDefault();
    const q = new URLSearchParams(params.toString());
    const n = String(v).split(/\s/)[0];
    if (n) q.set("account", n);
    else q.delete("account");
    q.delete("partner");
    router.push(`${pathname}?${q}`);
  };
  return (
    <form onSubmit={go} className="flex max-w-xl items-end gap-2 print:hidden">
      <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
        Account
        <input list="ledger-accounts" className={inputClass} value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. 5711, 411, 6" aria-label="Account" />
        <datalist id="ledger-accounts">
          {accounts.map((a) => <option key={a.number} value={`${a.number} ${a.label}`} />)}
        </datalist>
      </label>
      <Button type="submit">Show</Button>
    </form>
  );
}
