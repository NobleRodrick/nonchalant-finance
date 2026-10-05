"use client";

import { useMemo } from "react";
import { useOutboxOps } from "@/lib/offline/react";
import { opsInEffect } from "@/lib/offline/overlay";
import { applyPendingBookings, venueOps } from "@/lib/venue/overlay";

/**
 * The server's bookings (rendered at `renderedAt`) with this computer's venue records that they do
 * not include yet (new bookings, status changes, moves …), as every venue page shows them.
 */
export function usePendingBookings(departmentId, renderedAt, bookings) {
  const ops = useOutboxOps();
  return useMemo(() => applyPendingBookings(bookings, venueOps(opsInEffect(ops, { departmentId, renderedAt }))), [ops, departmentId, renderedAt, bookings]);
}
