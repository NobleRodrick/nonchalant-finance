"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** A dialog holding a form: title, optional description, body, footer buttons. */
export function FormDialog({ open, onOpenChange, title, description, children, footer, wide = false }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? "max-w-3xl" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-4">{children}</div>
        {footer ? <DialogFooter className="gap-2">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

/** The main button of a form: disabled while busy, with a spinner. */
export function SubmitButton({ busy, disabled, children, onClick, variant, type = "button" }) {
  return (
    <Button type={type} variant={variant} onClick={onClick} disabled={busy || disabled}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}
