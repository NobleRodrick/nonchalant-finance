"use client";

import { useState } from "react";
import { recordItemizedSale } from "@/actions/restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Receipt } from "lucide-react";

export function ItemizedSaleForm({ departmentId, menuItems = [], accounts = [] }) {
  const [lines, setLines] = useState([]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [customerName, setCustomerName] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [saving, setSaving] = useState(false);

  const addLine = (menuItemId) => {
    const item = menuItems.find((candidate) => candidate.id === menuItemId);
    if (!item) return;
    setLines((current) => [...current, { menuItemId, name: item.name, quantity: 1, price: Number(item.sellingPrice) }]);
  };
  const gross = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
  const net = Math.max(0, gross - (Number(discountAmount) || 0));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    const result = await recordItemizedSale({ departmentId, lines, discountAmount, paymentMethod, customerName, accountId: accountId || null });
    setSaving(false);
    if (!result.success) return toast.error(result.error);
    toast.success("Itemized sale recorded and stock updated");
    window.location.href = "/dashboard";
  }

  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-emerald-600" /> Itemized food sale</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><Select onValueChange={addLine}><SelectTrigger><SelectValue placeholder="Add food/menu item" /></SelectTrigger><SelectContent>{menuItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {Number(item.sellingPrice).toLocaleString()} FCFA</SelectItem>)}</SelectContent></Select><div className="space-y-2">{lines.map((line, index) => <div key={`${line.menuItemId}-${index}`} className="flex items-center gap-2 rounded border p-2"><span className="flex-1 text-sm font-medium">{line.name}</span><Input className="w-24" type="number" min="1" value={line.quantity} onChange={(e) => setLines((current) => current.map((entry, position) => position === index ? { ...entry, quantity: Number(e.target.value) || 1 } : entry))} /><span className="w-28 text-right text-sm">{(line.quantity * line.price).toLocaleString()} FCFA</span><Button type="button" variant="ghost" size="icon-sm" onClick={() => setLines((current) => current.filter((_, position) => position !== index))}><Trash2 className="h-4 w-4 text-rose-600" /></Button></div>)}</div><div className="grid gap-3 sm:grid-cols-2"><Input type="number" min="0" step="any" placeholder="Discount (FCFA)" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} /><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CASH">Cash</SelectItem><SelectItem value="CREDIT">Credit / debt</SelectItem><SelectItem value="MOMO">Mobile money</SelectItem><SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem></SelectContent></Select></div>{paymentMethod === "CREDIT" && <Input placeholder="Customer/debtor name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />}{accounts.length > 0 && <Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Cash/account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select>}<div className="flex justify-between border-t pt-3 text-sm font-bold"><span>Gross: {gross.toLocaleString()} FCFA</span><span className="text-emerald-700">Net: {net.toLocaleString()} FCFA</span></div><Button type="submit" disabled={saving || lines.length === 0} className="w-full bg-emerald-600 hover:bg-emerald-700">{saving ? "Recording..." : "Record sale"}</Button></form></CardContent></Card>;
}
