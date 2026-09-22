"use client";

import { useState } from "react";
import { recordCashHandover } from "@/actions/restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";

export function CashHandoverLedger({ handovers = [], departmentId }) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  async function submit(event) {
    event.preventDefault();
    const result = await recordCashHandover({ departmentId, amount, reference });
    if (!result.success) return toast.error(result.error);
    toast.success("Cash handover recorded");
    window.location.reload();
  }
  return <div className="space-y-6"><Card><CardHeader><CardTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-blue-600" /> Cash handed over to CEO</CardTitle><CardDescription>Record actual handovers separately from the calculated cash position.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Input type="number" min="0.01" step="any" placeholder="Amount handed over" value={amount} onChange={(e) => setAmount(e.target.value)} required /><Input placeholder="Reference or description" value={reference} onChange={(e) => setReference(e.target.value)} /><Button>Record handover</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Handover history</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase"><tr><th className="p-3">Date</th><th className="p-3">Department</th><th className="p-3">Receiver</th><th className="p-3">Reference</th><th className="p-3 text-right">Amount</th></tr></thead><tbody className="divide-y">{handovers.map((handover) => <tr key={handover.id}><td className="p-3">{new Date(handover.date).toLocaleString()}</td><td className="p-3">{handover.department?.name || "-"}</td><td className="p-3">{handover.recipientName}</td><td className="p-3">{handover.reference || "-"}</td><td className="p-3 text-right font-semibold">{Number(handover.amount).toLocaleString()} FCFA</td></tr>)}</tbody></table></div>{handovers.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No handovers recorded.</p>}</CardContent></Card></div>;
}
