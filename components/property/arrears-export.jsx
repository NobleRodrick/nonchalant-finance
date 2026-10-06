"use client";

import { ExportMenu } from "@/components/kit/export-menu";
import { exportFileName } from "@/lib/export/table-export";

/** The rent arrears list as Excel / CSV / PDF. */
export function ArrearsExport({ rows, todayKey }) {
  return (
    <ExportMenu
      fileName={exportFileName("arrears", todayKey)}
      sheets={{
        name: "Arrears",
        columns: [
          { label: "Tenant", value: (r) => r.tenant.name },
          { label: "Phone", value: (r) => r.tenant.phone },
          { label: "Building", value: (r) => r.unit.building.name },
          { label: "Office", value: (r) => r.unit.name },
          { label: "Contract", value: "referenceNo" },
          { label: "Rent / month", value: "rentNow" },
          { label: "Due so far", value: "due" },
          { label: "Paid", value: "paid" },
          { label: "Balance", value: "balance" },
          { label: "Rent owed", value: "rent" },
          { label: "Utilities & other owed", value: "utilities" },
          { label: "Months owed", value: "monthsOwed" },
          { label: "Days overdue", value: "daysOverdue" },
          { label: "Oldest due date", value: "oldestDueKey" },
          { label: "Deposit held", value: (r) => r.deposit?.held || 0 },
        ],
        rows,
      }}
    />
  );
}
