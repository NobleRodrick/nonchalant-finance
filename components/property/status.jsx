import { Pill } from "@/components/kit/primitives";
import { LEASE_STATUS_LABELS, LEASE_STATUS_TONES, UNIT_STATUS } from "@/lib/property/unit-math";
import { ACCOUNT_STATUS_LABELS, ACCOUNT_STATUS_TONES, DEPOSIT_STATUS_LABELS } from "@/lib/property/account";

/** 🟢 Available · 🔴 Occupied · 🟡 Reserved · 🔵 Under maintenance · ⚫ Unavailable · ⏳ Awaiting handover (word + colour). */
export function UnitStatusBadge({ status, className }) {
  const s = UNIT_STATUS[status] || UNIT_STATUS.AVAILABLE;
  return <Pill tone={s.tone} className={className}><span aria-hidden className="mr-1">{s.dot}</span>{s.label}</Pill>;
}

export function LeaseStatusBadge({ status }) {
  return <Pill tone={LEASE_STATUS_TONES[status] || "slate"}>{LEASE_STATUS_LABELS[status] || status}</Pill>;
}

/** Paid · Partially paid · Unpaid · Overdue · Paid ahead. */
export function AccountBadge({ status }) {
  if (!status || status === "NONE") return null;
  return <Pill tone={ACCOUNT_STATUS_TONES[status]}>{ACCOUNT_STATUS_LABELS[status]}</Pill>;
}

export function DepositBadge({ status }) {
  if (!status || status === "NONE") return null;
  return <Pill tone={status === "NOT_PAID" ? "amber" : status === "PENDING" ? "sky" : "slate"}>{DEPOSIT_STATUS_LABELS[status]}</Pill>;
}
