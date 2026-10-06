"use client";

import { ExportMenu } from "@/components/kit/export-menu";
import { exportFileName } from "@/lib/export/table-export";

/** The customer list as Excel / CSV. */
export function CustomerExport({ rows, todayKey }) {
  return (
    <ExportMenu
      fileName={exportFileName("customers", todayKey)}
      sheets={{
        name: "Customers",
        columns: [
          { label: "Name", value: "name" },
          { label: "Company", value: "company" },
          { label: "Phone", value: "phone" },
          { label: "E-mail", value: "email" },
          { label: "Address", value: "address" },
          { label: "Bookings", value: "bookings" },
          { label: "Spent (FCFA)", value: "spent" },
          { label: "Paid (FCFA)", value: "paid" },
          { label: "Owes (FCFA)", value: "balance" },
          { label: "Overdue (FCFA)", value: "overdue" },
          { label: "Last event", value: "lastEventKey" },
          { label: "Notes", value: "notes" },
        ],
        rows,
      }}
    />
  );
}
