"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StayDialog } from "./stay-dialog";

/** "New booking" opening the booking dialog (for server-rendered pages). */
export function NewStayButton({ departmentId, rooms, todayKey, initial, label = "New booking", variant }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {label}</Button>
      {open ? <StayDialog departmentId={departmentId} rooms={rooms} todayKey={todayKey} initial={initial} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
