"use client";

import { useState } from "react";
import { createStockItem, recordStockMovement } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Boxes, Plus, ArrowDown, ArrowUp, Loader2 } from "lucide-react";

export function StockItemsPanel({ departmentId, items = [] }) {
  const [creating, setCreating] = useState(false);
  const [movingItem, setMovingItem] = useState(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("unit");
  const [trackingPeriod, setTrackingPeriod] = useState("DAILY");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [openingQuantity, setOpeningQuantity] = useState("");
  const [movementType, setMovementType] = useState("PURCHASE");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");

  const submitItem = async (event) => {
    event.preventDefault();
    setCreating(true);
    const result = await createStockItem({
      departmentId,
      name,
      category,
      unit,
      trackingPeriod,
      periodStart: trackingPeriod === "CUSTOM" ? periodStart : null,
      periodEnd: trackingPeriod === "CUSTOM" ? periodEnd : null,
      openingQuantity,
    });
    setCreating(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`${name} added to department stock`);
    setName("");
    setCategory("");
    setOpeningQuantity("");
    setPeriodStart("");
    setPeriodEnd("");
    window.location.reload();
  };

  const submitMovement = async (event) => {
    event.preventDefault();
    const result = await recordStockMovement({ departmentId, stockItemId: movingItem.id, type: movementType, quantity, unitCost });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`${movingItem.name} stock updated`);
    setMovingItem(null);
    setQuantity("");
    setUnitCost("");
    window.location.reload();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Boxes className="h-5 w-5 text-indigo-600" /> Named Department Stock</CardTitle>
          <CardDescription>Define the dishes, drinks, products, or materials this department actually carries.</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No named stock items yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-600">
                  <tr><th className="p-3">Item</th><th className="p-3">Period</th><th className="p-3">Dates</th><th className="p-3 text-right">Current</th><th className="p-3 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3"><div className="font-semibold">{item.name}</div><div className="text-xs text-muted-foreground">{item.category || "General"} · {item.unit}</div></td>
                      <td className="p-3 text-xs">{item.trackingPeriod}</td>
                      <td className="p-3 text-xs whitespace-nowrap">
                        {item.periodStart && item.periodEnd
                          ? `${new Date(item.periodStart).toLocaleDateString()} - ${new Date(item.periodEnd).toLocaleDateString()}`
                          : "Ongoing"}
                      </td>
                      <td className={`p-3 text-right font-bold ${item.currentQuantity <= item.reorderLevel ? "text-rose-600" : "text-emerald-700"}`}>{item.currentQuantity}</td>
                      <td className="p-3 text-right"><Button type="button" size="sm" variant="outline" onClick={() => setMovingItem(item)}>Movement</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="text-lg">{movingItem ? `Update ${movingItem.name}` : "Add Stock Item"}</CardTitle><CardDescription>{movingItem ? "Record a purchase, usage, damage, or adjustment." : "The default tracking period is daily."}</CardDescription></CardHeader>
        <CardContent>
          {movingItem ? (
            <form onSubmit={submitMovement} className="space-y-4">
              <Select value={movementType} onValueChange={setMovementType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PURCHASE"><ArrowUp className="mr-2 inline h-4 w-4" /> Purchase received</SelectItem><SelectItem value="USAGE"><ArrowDown className="mr-2 inline h-4 w-4" /> Used / sold</SelectItem><SelectItem value="DAMAGE"><ArrowDown className="mr-2 inline h-4 w-4" /> Damaged / wasted</SelectItem><SelectItem value="ADJUSTMENT">Adjustment</SelectItem></SelectContent></Select>
              <Input type="number" min="0.01" step="any" placeholder="Quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
              {movementType === "PURCHASE" && <Input type="number" min="0" step="any" placeholder="Unit cost (optional)" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />}
              <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setMovingItem(null)}>Cancel</Button><Button type="submit">Save Movement</Button></div>
            </form>
          ) : (
            <form onSubmit={submitItem} className="space-y-4">
              <Input placeholder="Item name (e.g. Chicken, Coke 50cl, Room 1)" value={name} onChange={(event) => setName(event.target.value)} required />
              <Input placeholder="Category (optional)" value={category} onChange={(event) => setCategory(event.target.value)} />
              <div className="grid grid-cols-2 gap-3"><Input placeholder="Unit" value={unit} onChange={(event) => setUnit(event.target.value)} required /><Input type="number" min="0" step="any" placeholder="Opening quantity" value={openingQuantity} onChange={(event) => setOpeningQuantity(event.target.value)} /></div>
              <Select value={trackingPeriod} onValueChange={setTrackingPeriod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DAILY">Daily</SelectItem><SelectItem value="WEEKLY">Weekly</SelectItem><SelectItem value="MONTHLY">Monthly</SelectItem><SelectItem value="CUSTOM">Custom period</SelectItem></SelectContent></Select>
              {trackingPeriod === "CUSTOM" && <div className="grid grid-cols-2 gap-3"><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required /><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required /></div>}
              <Button type="submit" disabled={creating} className="w-full">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add item</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
