"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { createOrganization } from "@/actions/organization";
import { generateTempPassword } from "@/lib/password-utils";
import { getDomain } from "@/lib/domains/registry";
import { TITLE_SUGGESTIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Field, Pill, inputClass, selectClass } from "@/components/kit/primitives";
import { DepartmentTypePicker } from "@/components/boss/department-type-picker";
import { cn } from "@/lib/utils";

const STEPS = ["Company", "Departments", "People", "Done"];
const ZONES = ["Africa/Douala", "Africa/Lagos", "Africa/Abidjan", "Africa/Kinshasa", "Africa/Libreville", "Africa/Ndjamena", "Africa/Dakar", "Europe/Paris", "UTC"];

const newPerson = (departments) => ({ name: "", email: "", title: "", departmentNames: departments.length === 1 ? [departments[0].name] : [], tempPassword: generateTempPassword() });

/** First-time setup for the Boss: company, departments (with their type) and people. */
export function OnboardingWizard({ ownerName }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState({ name: "", timezone: "Africa/Douala" });
  const [departments, setDepartments] = useState([]);
  const [draft, setDraft] = useState({ name: "", domain: "RESTAURANT" });
  const [people, setPeople] = useState([]);
  const [created, setCreated] = useState(null);

  const addDepartment = () => {
    const name = draft.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) return toast.error("Enter the department name.");
    if (departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) return toast.error("You already added this department.");
    setDepartments([...departments, { name, domain: draft.domain }]);
    setDraft({ name: "", domain: "RESTAURANT" });
  };
  const setPerson = (i, patch) => setPeople(people.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const validPeople = people.filter((p) => p.name.trim() && p.email.trim());
  const incomplete = people.filter((p) => (p.name.trim() || p.email.trim()) && (!p.name.trim() || !p.email.trim() || !p.departmentNames.length));

  const finish = async () => {
    setBusy(true);
    const res = await createOrganization({
      name: company.name,
      timezone: company.timezone,
      departments,
      initialEmployees: validPeople.map((p) => ({ ...p, departmentName: p.departmentNames[0] })),
    });
    setBusy(false);
    if (!res?.success) {
      toast.error(res?.error || "The setup could not be saved.");
      return;
    }
    setCreated({ people: validPeople });
    setStep(3);
  };

  const next = () => {
    if (step === 0 && company.name.trim().length < 2) return toast.error("Enter your company name.");
    if (step === 1 && !departments.length) return toast.error("Add at least one department.");
    if (step === 2) {
      if (incomplete.length) return toast.error("Complete each person (name, e-mail and at least one department) or remove the row.");
      return finish();
    }
    setStep(step + 1);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Image src="/logo.jpg" alt="Springer Finance" width={40} height={40} className="rounded-lg" />
        <div>
          <div className="text-lg font-bold text-slate-900">Set up your business</div>
          <div className="text-sm text-slate-500">Welcome{ownerName ? `, ${ownerName}` : ""}. Three short steps.</div>
        </div>
      </div>
      <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-col gap-1.5">
            <span className={cn("h-1.5 rounded-full", i <= step ? "bg-slate-900" : "bg-slate-200")} />
            <span className={cn("text-xs font-medium", i === step ? "text-slate-900" : "text-slate-400")}>{i + 1}. {s}</span>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {step === 0 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Your business</h2>
              <p className="text-sm text-slate-500">The name appears on every report and statement.</p>
            </div>
            <Field label="Company name" required htmlFor="org-name">
              <input id="org-name" autoComplete="off" className={inputClass} placeholder="Enter your company name" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Time zone" htmlFor="org-tz" hint="When a business day starts and ends.">
                <select id="org-tz" className={selectClass} value={company.timezone} onChange={(e) => setCompany({ ...company, timezone: e.target.value })}>
                  {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </Field>
              <Field label="Currency" htmlFor="org-currency">
                <input id="org-currency" className={inputClass} value="FCFA" disabled />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Your departments</h2>
              <p className="text-sm text-slate-500">Name each department and choose its type. The type decides its screens and reports.</p>
            </div>
            {departments.length ? (
              <ul className="space-y-2">
                {departments.map((d, i) => (
                  <li key={d.name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="flex items-center gap-2 font-medium">{d.name} <Pill tone={getDomain(d.domain).color}>{getDomain(d.domain).label}</Pill></span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${d.name}`} onClick={() => setDepartments(departments.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
              <Field label="Department name" htmlFor="dept-name">
                <input
                  id="dept-name"
                  autoComplete="off"
                  className={inputClass}
                  placeholder="Enter the department name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDepartment();
                    }
                  }}
                />
              </Field>
              <Field label="Department type">
                <DepartmentTypePicker value={draft.domain} onChange={(domain) => setDraft({ ...draft, domain })} compact />
              </Field>
              <Button type="button" variant="outline" onClick={addDepartment}><Plus className="h-4 w-4" /> Add department</Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Your department heads</h2>
              <p className="text-sm text-slate-500">Your department heads. Everyone you add heads the departments you tick, and one person can head several. Optional: a department without a head is run by you — you record its day yourself — until you assign one later from “People”.</p>
              <datalist id="onb-titles">{TITLE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            {people.map((p, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Full name" htmlFor={`p-name-${i}`}>
                    <input id={`p-name-${i}`} autoComplete="off" className={inputClass} placeholder="Full name" value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} />
                  </Field>
                  <Field label="E-mail (to sign in)" htmlFor={`p-email-${i}`}>
                    <input id={`p-email-${i}`} type="email" autoComplete="off" className={inputClass} placeholder="name@example.com" value={p.email} onChange={(e) => setPerson(i, { email: e.target.value })} />
                  </Field>
                  <Field label="Title" htmlFor={`p-title-${i}`} hint="Any title (Accountant, Manager …). The role is Department head.">
                    <input id={`p-title-${i}`} list="onb-titles" autoComplete="off" className={inputClass} placeholder="e.g. Accountant" value={p.title} onChange={(e) => setPerson(i, { title: e.target.value })} maxLength={60} />
                  </Field>
                </div>
                <Field label="Departments this person heads" hint="One or several.">
                  <div className="flex flex-wrap gap-2">
                    {departments.map((d) => {
                      const on = p.departmentNames.includes(d.name);
                      return (
                        <label key={d.name} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm", on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200")}>
                          <input type="checkbox" className="sr-only" checked={on} onChange={() => setPerson(i, { departmentNames: on ? p.departmentNames.filter((n) => n !== d.name) : [...p.departmentNames, d.name] })} />
                          {on ? <Check className="h-3.5 w-3.5" /> : null} {d.name}
                        </label>
                      );
                    })}
                  </div>
                </Field>

                <div className="flex flex-wrap items-end justify-between gap-2">
                  <Field label="Temporary password" htmlFor={`p-pass-${i}`} hint="Give it to the person; they must replace it with their own at the first sign-in.">
                    <div className="flex gap-2">
                      <input id={`p-pass-${i}`} className={cn(inputClass, "w-48 font-mono")} value={p.tempPassword} onChange={(e) => setPerson(i, { tempPassword: e.target.value })} />
                      <Button type="button" variant="outline" size="icon" aria-label="Copy password" onClick={() => { navigator.clipboard?.writeText(p.tempPassword); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
                    </div>
                  </Field>
                  <Button type="button" variant="ghost" onClick={() => setPeople(people.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /> Remove</Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setPeople([...people, newPerson(departments)])}><Plus className="h-4 w-4" /> Add a department head</Button>
          </div>
        ) : null}

        {step === 3 && created ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-5 w-5" /></span>
              <div>
                <h2 className="text-xl font-semibold">{company.name} is ready</h2>
                <p className="text-sm text-slate-500">{departments.length} department(s) created, each with its cash drawer.</p>
              </div>
            </div>
            {created.people.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <div className="mb-2 font-semibold text-amber-900">Sign-in details (shown only now)</div>
                <table className="w-full">
                  <tbody>
                    {created.people.map((p) => (
                      <tr key={p.email} className="border-t border-amber-200">
                        <td className="py-1.5">{p.name}</td>
                        <td className="py-1.5">{p.email}</td>
                        <td className="py-1.5 font-mono">{p.tempPassword}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <ul className="space-y-2 text-sm text-slate-700">
              <li>1. {created.people.length ? "Share the sign-in details with your people. " : ""}Each department&apos;s first job: its dishes and plates on <strong>Menu & Stock</strong> (restaurants), the hall and prices (venues), the apartments (guest houses).</li>
              {departments.some((d) => !created.people.some((p) => p.departmentNames.includes(d.name))) ? (
                <li data-testid="you-run">2. You run {departments.filter((d) => !created.people.some((p) => p.departmentNames.includes(d.name))).map((d) => d.name).join(", ")} yourself: you record the day there. When you assign a head in <strong>People</strong>, they take over and you go back to overseeing.</li>
              ) : (
                <li>2. Each department has a head: they run the day and send you the daily report. Their temporary password must be replaced at the first sign-in.</li>
              )}
              <li>3. Set the cash each drawer starts with in <strong>Departments</strong>.</li>
              <li>4. Follow everything from your <strong>Overview</strong>: results, reports, cash and statements.</li>
            </ul>
          </div>
        ) : null}

        <div className="mt-8 flex justify-between border-t border-slate-100 pt-5">
          {step > 0 && step < 3 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
          ) : <span />}
          {step < 3 ? (
            <Button onClick={next} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {step === 2 ? "Finish setup" : "Continue"} {step < 2 ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          ) : (
            <Button onClick={() => { router.push("/home"); router.refresh(); }}>Open the app <ArrowRight className="h-4 w-4" /></Button>
          )}
        </div>
      </div>
    </div>
  );
}
