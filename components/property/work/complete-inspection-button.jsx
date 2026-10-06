"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompleteInspectionDialog } from "./inspection";

export function CompleteInspectionButton({ departmentId, inspection, currentUserName }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><ClipboardCheck className="h-3.5 w-3.5" /> Record findings</Button>
      {open ? <CompleteInspectionDialog departmentId={departmentId} inspection={inspection} currentUserName={currentUserName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
