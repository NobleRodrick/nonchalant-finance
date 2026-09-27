import Link from "next/link";
import { Banner, StatusBadge } from "@/components/kit/primitives";
import { formatDateKey } from "@/lib/timezone";

/** Explains which day is shown and whether it can still change. */
export function DayBanner({ dateKey, isToday, status, departmentId }) {
  if (status.locked) {
    return (
      <Banner tone="info" action={<Link className="text-sm font-medium underline" href={`/d/${departmentId}/report${isToday ? "" : `?date=${dateKey}`}`}>Open the report</Link>}>
        <span className="mr-2"><StatusBadge status={status.status} /></span>
        The report of {formatDateKey(dateKey)} was sent to the Boss. Nothing on this day can change unless the Boss returns it.
      </Banner>
    );
  }
  if (status.status === "RETURNED") {
    return (
      <Banner tone="warn">
        <strong>The Boss returned the report of {formatDateKey(dateKey)}:</strong> “{status.report?.reviewNotes}”. Make the corrections, then send it again.
      </Banner>
    );
  }
  if (!isToday) {
    return <Banner tone="warn">You are looking at {formatDateKey(dateKey)} (a past day). Anything you record here is dated on that day.</Banner>;
  }
  return null;
}
