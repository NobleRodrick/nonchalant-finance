"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const DOCS = [
  ["quotation", "Quotation"],
  ["confirmation", "Booking confirmation"],
  ["invoice", "Invoice"],
  ["contract", "Rental agreement"],
];

/** The printable documents of a booking (each opens in a new tab: print or save as PDF). */
export function DocumentLinks({ departmentId, order }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline"><FileText className="h-4 w-4" /> Documents</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {DOCS.map(([kind, label]) => (
          <DropdownMenuItem key={kind} asChild>
            <Link href={`/d/${departmentId}/bookings/${order.id}/documents/${kind}`} target="_blank">{label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
