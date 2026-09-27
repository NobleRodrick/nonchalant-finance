"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateOrganizationSettings } from "@/actions/organization";
import { runWithToast } from "@/components/kit/client";
import { Field, Section, selectClass } from "@/components/kit/primitives";

const ZONES = ["Africa/Douala", "Africa/Lagos", "Africa/Abidjan", "Africa/Kinshasa", "Africa/Libreville", "Africa/Ndjamena", "Africa/Bangui", "Africa/Brazzaville", "Africa/Dakar", "Europe/Paris", "UTC"];

export function SettingsClient({ organization }) {
  const router = useRouter();
  const [name, setName] = useState(organization.name);
  const [timezone, setTimezone] = useState(organization.timezone);
  const save = async (e) => {
    e.preventDefault();
    if (await runWithToast(updateOrganizationSettings({ name, timezone }), { success: "Settings saved." })) router.refresh();
  };
  return (
    <div className="space-y-5">
      <Section title="Organisation">
        <form className="max-w-lg space-y-3" onSubmit={save}>
          <Field label="Organisation name" required htmlFor="org-name"><Input id="org-name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Business time zone" htmlFor="org-tz" hint="When a business day starts and ends for daily reports.">
            <select id="org-tz" className={selectClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {(ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES]).map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
          <Field label="Currency" htmlFor="org-cur" hint="All amounts are recorded in this currency."><Input id="org-cur" value={organization.currency} disabled /></Field>
          <Button type="submit">Save</Button>
        </form>
      </Section>
    </div>
  );
}
