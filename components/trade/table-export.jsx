"use client";

import { ExportMenu } from "@/components/kit/export-menu";

/** Export of tables built on the server: sheets [{ name, headers: [], rows: [[…]] }]. */
export function TableExport({ fileName, sheets, label }) {
  return <ExportMenu fileName={fileName} label={label} sheets={sheets.map((s) => ({ name: s.name, columns: s.headers.map((h, i) => ({ label: h, value: (r) => r[i] ?? "" })), rows: s.rows }))} />;
}
