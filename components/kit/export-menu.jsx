"use client";

import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toCsv, toXlsx } from "@/lib/export/table-export";

function download(data, fileName, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export of what a page shows: Excel (every sheet), CSV (the first sheet) and PDF (the page
 * printed: choose "Save as PDF"). `sheets`: [{ name, columns: [{ label, value }], rows }] — see
 * lib/export/table-export. Shown only to people with the right to export.
 */
export function ExportMenu({ fileName, sheets, label = "Export", pdf = true }) {
  const list = Array.isArray(sheets) ? sheets : [sheets];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="print:hidden"><Download className="h-4 w-4" /> {label}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => download(toXlsx(list), `${fileName}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>
          <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download(toCsv(list[0]), `${fileName}.csv`, "text/csv;charset=utf-8")}>
          <Download className="h-4 w-4" /> CSV
        </DropdownMenuItem>
        {pdf ? (
          <DropdownMenuItem onSelect={() => setTimeout(() => window.print(), 50)}>
            <Printer className="h-4 w-4" /> PDF (print → Save as PDF)
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
