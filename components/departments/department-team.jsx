import Link from "next/link";
import { AlertTriangle, Users } from "lucide-react";
import { Section } from "@/components/kit/primitives";

/** The heads of a department, for the Boss (any department type). `team`: [{ id, name, title }]. */
export function DepartmentTeam({ departmentId, team, description }) {
  return (
    <Section
      title={team.length === 1 ? "Department head" : "Department heads"}
      description={description}
      actions={<Link className="text-sm font-medium underline" href={`/boss/people?dept=${departmentId}`}>Manage</Link>}
    >
      {!team.length ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900" data-testid="no-head-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No department head. Nobody runs this department&apos;s day. Add one in People or Departments.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {team.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-slate-400" /> {m.name}</span>
              <span className="text-right text-xs">
                {m.title ? <span className="mr-2 text-slate-500">{m.title}</span> : null}
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">Department head</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
