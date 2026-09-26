"use client";

import { useState } from "react";
import { createStockItem, recordStockMovement } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Boxes, Plus, AlertTriangle, Loader2, ArrowDownRight, ArrowUpRight } from "lucide-react";

export function StockTab({ stockItems = [], departmentId, onRefresh }) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);

  // New item form
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [openingQuantity, setOpeningQuantity] = useState("");
  const [reorderLevel, setReorderLevel] = useState("5");
  const [category, setCategory] = useState("Food Ingredients");

  // Movement form
  const [movementType, setMovementType] = useState("USAGE");
  const [movementQty, setMovementQty] = useState("");
  const [movementNotes, setMovementNotes] = useState("");

  const handleCreateStockItem = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Stock item name is required");
      return;
    }

    setLoading(true);
    try {
      const res = await createStockItem({
        name,
        unit,
        openingQuantity: Number(openingQuantity) || 0,
        reorderLevel: Number(reorderLevel) || 0,
        category,
        departmentId,
      });

      if (res.success) {
        toast.success(`Stock item "${name}" created!`);
        setAddModalOpen(false);
        setName("");
        setOpeningQuantity("");
        onRefresh();
      } else {
        toast.error(res.error || "Failed to create stock item");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const openMovementModal = (item) => {
    setSelectedItem(item);
    setMovementType("USAGE");
    setMovementQty("");
    setMovementNotes("");
    setMovementModalOpen(true);
  };

  const handleRecordMovement = async (e) => {
    e.preventDefault();
    if (!selectedItem || !movementQty || Number(movementQty) <= 0) {
      toast.error("Valid quantity is required");
      return;
    }

    setLoading(true);
    try {
      const res = await recordStockMovement({
        stockItemId: selectedItem.id,
        type: movementType,
        quantity: Number(movementQty),
        notes: movementNotes,
        departmentId,
      });

      if (res.success) {
        toast.success("Stock movement recorded");
        setMovementModalOpen(false);
        onRefresh();
      } else {
        toast.error(res.error || "Failed to record movement");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const totalStockValuation = stockItems.reduce((sum, item) => {
    return sum + (item.currentQuantity || 0) * (item.valuationUnitCost || 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Raw Food & Ingredient Stock</h2>
          <p className="text-xs text-muted-foreground">
            Inventory ledger with weighted-average valuation, reorder thresholds, and traceable usage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Inventory Value</span>
            <span className="text-base font-extrabold text-slate-900">
              {totalStockValuation.toLocaleString()} FCFA
            </span>
          </div>

          <Button onClick={() => setAddModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
            <Plus className="h-4 w-4 mr-1.5" /> Add Stock Item
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Item Name</th>
                <th className="py-3 px-4">Current Qty</th>
                <th className="py-3 px-4">Valuation Cost</th>
                <th className="py-3 px-4">Total Value</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    No stock items tracked yet. Click &quot;Add Stock Item&quot; to begin inventory tracking.
                  </td>
                </tr>
              ) : (
                stockItems.map((item) => {
                  const qty = Number(item.currentQuantity || 0);
                  const reorder = Number(item.reorderLevel || 0);
                  const unitCost = Number(item.valuationUnitCost || 0);
                  const totalValue = qty * unitCost;
                  const isLow = qty <= reorder;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900">{item.name}</span>
                        {item.category && (
                          <span className="text-[10px] text-muted-foreground block">{item.category}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-extrabold text-slate-900 text-sm">
                          {qty} {item.unit}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {unitCost > 0 ? `${unitCost.toLocaleString()} FCFA/${item.unit}` : "0 FCFA"}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {totalValue.toLocaleString()} FCFA
                      </td>
                      <td className="py-3 px-4">
                        {isLow ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1 text-[10px]">
                            <AlertTriangle className="h-3 w-3" /> Low ({qty}/{reorder})
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                            In Stock
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMovementModal(item)}
                          className="h-7 text-[11px] px-2"
                        >
                          Log Movement
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Stock Item Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Inventory Item</DialogTitle>
            <DialogDescription>
              Create an individually tracked food inventory or consumable record.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateStockItem} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Item Name *</label>
              <Input
                placeholder="e.g. Fresh Chicken (kg), Cooking Oil"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Unit of Measure *</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                >
                  <option value="kg">kg (Kilogram)</option>
                  <option value="gram">gram (g)</option>
                  <option value="litre">litre (L)</option>
                  <option value="piece">piece (pc)</option>
                  <option value="pack">pack</option>
                  <option value="bag">bag (25kg/50kg)</option>
                  <option value="plate">plate</option>
                  <option value="unit">unit</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Category</label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Opening Quantity</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 50"
                  min="0"
                  value={openingQuantity}
                  onChange={(e) => setOpeningQuantity(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Reorder Threshold</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 10"
                  min="0"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Stock Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Movement Modal */}
      <Dialog open={movementModalOpen} onOpenChange={setMovementModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Stock Movement: {selectedItem?.name}</DialogTitle>
            <DialogDescription>
              Record kitchen usage, kitchen spoilage/damage, or physical inventory adjustments.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordMovement} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Movement Type *</label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
              >
                <option value="USAGE">Usage (Preparation / Consumption)</option>
                <option value="DAMAGE">Spoilage / Damage / Waste</option>
                <option value="ADJUSTMENT">Stock Count Adjustment</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Quantity ({selectedItem?.unit}) *</label>
              <Input
                type="number"
                step="0.01"
                required
                min="0.01"
                placeholder="e.g. 2.5"
                value={movementQty}
                onChange={(e) => setMovementQty(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Reason / Notes</label>
              <Input
                placeholder="e.g. Marinated for evening banquet"
                value={movementNotes}
                onChange={(e) => setMovementNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setMovementModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Movement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
