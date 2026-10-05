"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Pill, inputClass, selectClass } from "@/components/kit/primitives";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { removePriceRule, savePriceRule } from "@/actions/venue";
import { WEEKDAYS, monthBounds } from "@/lib/venue/dates";
import { describeRule, priceForDate } from "@/lib/venue/pricing";
import { addDaysToKey, listDateKeys } from "@/lib/timezone";

const KIND_LABELS = { WEEKDAY: "Day of the week", SEASON: "Season", SPECIAL_DATE: "Special date" };
const SOURCE_TONE = { SPECIAL_DATE: "violet", SEASON: "amber", WEEKDAY: "sky", BASE: "slate" };
const EMPTY = { kind: "WEEKDAY", weekday: 6, startKey: "", endKey: "", price: "", label: "" };

function RuleDialog({ open, onOpenChange, departmentId, venueId, rule }) {
  const [f, setF] = useState(() => (rule ? { ...EMPTY, ...rule, startKey: rule.startKey || "", endKey: rule.endKey || "", label: rule.label || "" } : EMPTY));
  const [busy, setBusy] = useState(false);
  const set = (k, numeric = false) => (e) => setF({ ...f, [k]: numeric ? wholeNumber(e.target.value) : e.target.value });
  const valid =
    f.price !== "" &&
    (f.kind === "WEEKDAY" || f.startKey) &&
    (f.kind !== "SEASON" || (f.endKey && f.endKey >= f.startKey && f.label.trim()));
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(
      savePriceRule({ departmentId, venueId, id: rule?.id, kind: f.kind, weekday: Number(f.weekday), startKey: f.startKey, endKey: f.kind === "SEASON" ? f.endKey : null, price: f.price, label: f.label.trim() }),
      { success: rule ? "Price changed." : "Price added." }
    );
    setBusy(false);
    if (ok) onOpenChange(false);
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={rule ? "Change a price" : "Add a price"}
      description="A special date wins over a season, a season over a day of the week, a day of the week over the base price."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <SubmitButton busy={busy} disabled={!valid} onClick={submit}>{rule ? "Save" : "Add the price"}</SubmitButton>
        </>
      }
    >
      <Field label="Kind of price" htmlFor="rule-kind">
        <select id="rule-kind" className={selectClass} value={f.kind} onChange={set("kind")} disabled={Boolean(rule)}>
          {Object.entries(KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Field>
      {f.kind === "WEEKDAY" ? (
        <Field label="Day of the week" htmlFor="rule-weekday">
          <select id="rule-weekday" className={selectClass} value={f.weekday} onChange={set("weekday")}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f.kind === "SEASON" ? "First day" : "Date"} required htmlFor="rule-start">
            <input id="rule-start" type="date" className={inputClass} value={f.startKey} onChange={set("startKey")} />
          </Field>
          {f.kind === "SEASON" ? (
            <Field label="Last day" required htmlFor="rule-end">
              <input id="rule-end" type="date" className={inputClass} value={f.endKey} min={f.startKey || undefined} onChange={set("endKey")} />
            </Field>
          ) : null}
        </div>
      )}
      <Field label="Price of the date (FCFA)" required htmlFor="rule-price">
        <input id="rule-price" className={inputClass} inputMode="numeric" value={f.price} onChange={set("price", true)} />
      </Field>
      <Field label={f.kind === "SEASON" ? "Name of the season" : "Label (optional)"} required={f.kind === "SEASON"} htmlFor="rule-label">
        <input id="rule-label" className={inputClass} value={f.label} onChange={set("label")} placeholder={f.kind === "SEASON" ? "e.g. December holidays" : "e.g. New Year's Eve"} />
      </Field>
    </FormDialog>
  );
}

/** The next weeks with the price of each date, so the rules can be checked at a glance. */
function PricePreview({ hall, todayKey }) {
  const [from, setFrom] = useState(todayKey);
  const days = useMemo(() => listDateKeys(from, addDaysToKey(from, 13)).map((k) => ({ key: k, ...priceForDate(k, { basePrice: hall.basePrice, rules: hall.rules }) })), [from, hall]);
  return (
    <div className="space-y-3" data-testid="price-preview">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From" htmlFor="preview-from">
          <input id="preview-from" type="date" className={inputClass} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </Field>
        <Button variant="outline" size="sm" onClick={() => setFrom(monthBounds(addDaysToKey(monthBounds(from)[1], 1))[0])}>Next month</Button>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d) => (
          <li key={d.key} className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="text-xs text-slate-500">
              {new Date(`${d.key}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
            </div>
            <Money value={d.price} className="block text-sm font-semibold" />
            <Pill tone={SOURCE_TONE[d.source]} className="mt-1">{d.label}</Pill>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The hall's prices: by day of the week, seasons and special dates, with a preview. */
export function PriceRules({ departmentId, hall, canEdit, todayKey }) {
  const [editing, setEditing] = useState(null); // null | "new" | rule
  const [busyId, setBusyId] = useState(null);
  const remove = async (rule) => {
    setBusyId(rule.id);
    await runWithToast(removePriceRule({ departmentId, ruleId: rule.id }), { success: "Price removed." });
    setBusyId(null);
  };
  const groups = [
    { kind: "WEEKDAY", title: "Days of the week", icon: CalendarRange, rows: hall.rules.filter((r) => r.kind === "WEEKDAY") },
    { kind: "SEASON", title: "Seasons", icon: CalendarRange, rows: hall.rules.filter((r) => r.kind === "SEASON") },
    { kind: "SPECIAL_DATE", title: "Special dates", icon: Star, rows: hall.rules.filter((r) => r.kind === "SPECIAL_DATE") },
  ];
  const columns = [
    { key: "when", label: "When", render: (r) => <span className="font-medium">{describeRule(r)}</span> },
    { key: "label", label: "Label", render: (r) => r.label || <span className="text-slate-400">—</span> },
    { key: "price", label: "Price", align: "right", render: (r) => <Money value={r.price} /> },
    canEdit
      ? {
          key: "actions",
          label: "",
          align: "right",
          render: (r) => (
            <span className="inline-flex gap-1">
              <Button size="icon-sm" variant="ghost" aria-label={`Change the price of ${describeRule(r)}`} onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove the price of ${describeRule(r)}`} disabled={busyId === r.id} onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-rose-700" /></Button>
            </span>
          ),
        }
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Base price: <Money value={hall.basePrice} className="font-semibold" />. A special date wins over a season, a season over a day of the week. A booking keeps
        the price it was made at; the agreed price can always be changed on the booking.
      </p>
      {canEdit ? (
        <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add a price</Button>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.kind} className="rounded-xl border border-slate-200 bg-white" data-testid={`rules-${g.kind}`}>
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">{g.title}</div>
            <DataTable dense columns={columns} rows={g.rows} empty={g.kind === "WEEKDAY" ? "Every day at the base price." : "None."} />
          </div>
        ))}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Prices of the next two weeks</h3>
        <PricePreview hall={hall} todayKey={todayKey} />
      </div>
      {editing ? (
        <RuleDialog key={editing === "new" ? "new" : editing.id} open onOpenChange={(v) => !v && setEditing(null)} departmentId={departmentId} venueId={hall.id} rule={editing === "new" ? null : editing} />
      ) : null}
    </div>
  );
}
