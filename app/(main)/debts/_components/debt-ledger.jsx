"use client";

import { useState } from "react";
import { recordDebtPayment } from "@/actions/restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";

export function DebtLedger({ debts = [] }) {
  const [paymentDebtId, setPaymentDebtId] = useState(null);
  const [amount, setAmount] = useState("");
  async function pay(event) {
    event.preventDefault();
    const result = await recordDebtPayment({ debtId: paymentDebtId, amount });
    if (!result.success) return toast.error(result.error);
    toast.success("Debt payment recorded");
    window.location.reload();
  }
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-amber-600" /> Debts</CardTitle><CardDescription>Track unpaid and partially paid customer food purchases.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase"><tr><th className="p-3">Customer</th><th className="p-3">Food purchased</th><th className="p-3 text-right">Owed</th><th className="p-3 text-right">Paid</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y">{debts.map((debt) => <tr key={debt.id}><td className="p-3 font-semibold">{debt.debtorName}</td><td className="p-3">{debt.foodDescription || "-"}</td><td className="p-3 text-right">{Number(debt.amountOwed).toLocaleString()}</td><td className="p-3 text-right">{Number(debt.amountPaid).toLocaleString()}</td><td className="p-3">{debt.status}</td><td className="p-3">{debt.status !== "PAID" && <Button size="sm" variant="outline" onClick={() => setPaymentDebtId(debt.id)}>Record payment</Button>}</td></tr>)}</tbody></table></div>{debts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No debts recorded.</p>}{paymentDebtId && <form onSubmit={pay} className="mt-5 flex gap-2 border-t pt-4"><Input type="number" min="0.01" step="any" placeholder="Payment amount" value={amount} onChange={(e) => setAmount(e.target.value)} required /><Button>Save payment</Button><Button type="button" variant="outline" onClick={() => setPaymentDebtId(null)}>Cancel</Button></form>}</CardContent></Card>;
}
