import { Sparkles } from "lucide-react";
import { Pill } from "@/components/kit/primitives";

/** Workspace of a department whose type is not built yet. */
export function ComingSoon({ department, domain, people = [] }) {
  return (
    <div className="mx-auto max-w-2xl py-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
        <Sparkles className="h-7 w-7" />
      </div>
      <div className="mt-4"><Pill tone={domain.color}>{domain.label}</Pill></div>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">{department.name}</h1>
      <p className="mt-2 text-slate-600">The {domain.label.toLowerCase()} department type is coming soon.</p>
      <p className="mt-1 text-sm text-slate-500">It will offer: {domain.description}</p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-left text-sm">
        <div className="font-semibold text-slate-900">People assigned</div>
        <p className="mt-1 text-slate-600">{people.length ? people.join(", ") : "Nobody yet."}</p>
      </div>
    </div>
  );
}
