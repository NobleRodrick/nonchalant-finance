"use client";

import { ExportMenu } from "@/components/kit/export-menu";
import { exportFileName } from "@/lib/export/table-export";
import { LEASE_STATUS_LABELS } from "@/lib/property/unit-math";

/** The contracts list as Excel / CSV / PDF. */
export function ContractExport({ rows, todayKey }) {
  return (
    <ExportMenu
      fileName={exportFileName("contracts", todayKey)}
      sheets={{
        name: "Contracts",
        columns: [
          { label: "Contract", value: "referenceNo" },
          { label: "Tenant", value: (r) => r.client.name },
          { label: "Phone", value: (r) => r.client.phone },
          { label: "Building", value: (r) => r.unit.building.name },
          { label: "Office", value: (r) => r.unit.name },
          { label: "Status", value: (r) => LEASE_STATUS_LABELS[r.status] },
          { label: "Start", value: "startKey" },
          { label: "End", value: (r) => r.moveOutKey || r.endKey || "" },
          { label: "Rent (FCFA)", value: "rentNow" },
          { label: "Due day", value: "dueDay" },
          { label: "Months per bill", value: "monthsPerBill" },
          { label: "Deposit required", value: "depositRequired" },
          { label: "Deposit held", value: (r) => r.deposit?.held || 0 },
          { label: "Owed (FCFA)", value: (r) => r.account?.outstanding || 0 },
          { label: "Months owed", value: (r) => r.account?.monthsOwed || 0 },
          { label: "Days overdue", value: (r) => r.account?.daysOverdue || 0 },
        ],
        rows,
      }}
    />
  );
}
