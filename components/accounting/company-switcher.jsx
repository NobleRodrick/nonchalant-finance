"use client";

import { useRouter } from "next/navigation";
import { selectClass } from "@/components/kit/primitives";
import { navigateTo } from "@/lib/navigation";

/** Another company's books (same section when it has one). */
export function CompanySwitcher({ companies, currentId }) {
  const router = useRouter();
  return (
    <select aria-label="Company" className={`${selectClass} h-8 w-auto py-0 text-sm`} value={currentId} onChange={(e) => navigateTo(router, `/accounting/${e.target.value}`)}>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>{c.name}{c.level === "FULL" ? "" : " (Simple)"}</option>
      ))}
    </select>
  );
}
