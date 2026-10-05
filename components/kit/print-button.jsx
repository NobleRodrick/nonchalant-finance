"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prints the page (the sidebar, top bar and buttons are hidden when printing). */
export function PrintButton({ label = "Print", variant = "outline", size = "sm" }) {
  return (
    <Button type="button" variant={variant} size={size} onClick={() => window.print()} className="print:hidden">
      <Printer className="h-4 w-4" /> {label}
    </Button>
  );
}
