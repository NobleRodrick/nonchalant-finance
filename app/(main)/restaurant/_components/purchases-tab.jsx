"use client";

import { useState } from "react";
import { createPurchaseRecord } from "@/actions/purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ShoppingBag,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  Building2,
  FileText,
  Calculator,
} from "lucide-react";
import { calculateWeightedAverageCost } from "@/lib/ledger-service";

export function PurchasesTab({
  stockItems = [],
  menuItems = [],
  accounts = [],
  recentPurchases = [],
  departmentId,
  onPurchaseComplete,
}) {
  const [supplierName, setSupplierName] = useState("");
  const [reference, setReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  // Purchase lines: [{ type: "STOCK", stockItemId, quantity, unitCost }]
  const [lines, setLines] = useState([
    {
      type: "STOCK",
      stockItemId: stockItems[0]?.id || "",
      menuItemId: "",
      quantity: "10",
      unitCost: "2000",
    },
  ]);

  const [submitting, setSubmitting] = useState(false);

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        type: "STOCK",
        stockItemId: stockItems[0]?.id || "",
        menuItemId: "",
        quantity: "5",
        unitCost: "1000",
      },
    ]);
  };

  const handleRemoveLine = (index) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, idx) => idx !== index));
  };

  const handleLineChange = (index, field, value) => {
    const updated = [...lines];
    updated[index][field] = value;
    setLines(updated);
  };

  const grandTotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lines.length === 0 || grandTotal <= 0) {
      toast.error("Please add at least one item with valid quantity and cost");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createPurchaseRecord({
        departmentId,
        supplierName,
        reference,
        paymentMethod,
        date,
        accountId: paymentMethod !== "CREDIT" ? accountId : null,
        notes,
        lines: lines.map((l) => ({
          stockItemId: l.type === "STOCK" ? l.stockItemId : null,
          menuItemId: l.type === "DISH" ? l.menuItemId : null,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
        })),
      });

      if (res.success) {
        toast.success(`Purchase recorded! Total: ${grandTotal.toLocaleString()} FCFA`);
        setSupplierName("");
        setReference("");
        setNotes("");
        setLines([
          {
            type: "STOCK",
            stockItemId: stockItems[0]?.id || "",
            menuItemId: "",
            quantity: "10",
            unitCost: "2000",
          },
        ]);
        onPurchaseComplete();
      } else {
        toast.error(res.error || "Failed to record purchase");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Inward Stock Purchases & Valuation
          </h2>
          <p className="text-xs text-muted-foreground">
            Record supplier deliveries. New quantities automatically recalculate the weighted-average inventory cost.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Purchase Entry Form */}
        <div className="lg:col-span-8">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-indigo-600" />
                Record Supplier Delivery & Purchase
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5 pt-4">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Header Information */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Supplier Name</label>
                    <Input
                      placeholder="e.g. Agro-Market Wholesale"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Invoice / Slip Ref</label>
                    <Input
                      placeholder="e.g. INV-8942"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Delivery Date</label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Purchase Line Items
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddLine}
                      className="h-7 text-xs gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Line
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {lines.map((line, idx) => {
                      const stockItem = stockItems.find((s) => s.id === line.stockItemId);
                      const unit = line.type === "STOCK" ? stockItem?.unit || "unit" : "plates";
                      const qty = Number(line.quantity) || 0;
                      const cost = Number(line.unitCost) || 0;
                      const lineTotal = qty * cost;

                      // Live preview of weighted average cost
                      let previewWeightedCost = cost;
                      if (line.type === "STOCK" && stockItem) {
                        previewWeightedCost = calculateWeightedAverageCost({
                          currentQuantity: stockItem.currentQuantity,
                          currentValuationCost: stockItem.valuationUnitCost,
                          purchaseQuantity: qty,
                          purchaseUnitCost: cost,
                        });
                      }

                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2 text-xs"
                        >
                          <div className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-12 sm:col-span-3 space-y-1">
                              <label className="text-[11px] font-semibold text-slate-600">Category Type</label>
                              <select
                                value={line.type}
                                onChange={(e) => handleLineChange(idx, "type", e.target.value)}
                                className="w-full h-8 px-2 rounded-md border border-slate-200 bg-white text-xs"
                              >
                                <option value="STOCK">Raw Stock Item</option>
                                <option value="DISH">Prepared Food / Dish</option>
                              </select>
                            </div>

                            <div className="col-span-12 sm:col-span-4 space-y-1">
                              <label className="text-[11px] font-semibold text-slate-600">Item</label>
                              {line.type === "STOCK" ? (
                                <select
                                  value={line.stockItemId}
                                  onChange={(e) => handleLineChange(idx, "stockItemId", e.target.value)}
                                  className="w-full h-8 px-2 rounded-md border border-slate-200 bg-white text-xs"
                                >
                                  {stockItems.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name} ({item.unit})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <select
                                  value={line.menuItemId}
                                  onChange={(e) => handleLineChange(idx, "menuItemId", e.target.value)}
                                  className="w-full h-8 px-2 rounded-md border border-slate-200 bg-white text-xs"
                                >
                                  <option value="">Select Dish</option>
                                  {menuItems.map((dish) => (
                                    <option key={dish.id} value={dish.id}>
                                      {dish.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>

                            <div className="col-span-6 sm:col-span-2 space-y-1">
                              <label className="text-[11px] font-semibold text-slate-600">Qty ({unit})</label>
                              <Input
                                type="number"
                                step="0.01"
                                required
                                min="0.01"
                                value={line.quantity}
                                onChange={(e) => handleLineChange(idx, "quantity", e.target.value)}
                                className="h-8 text-xs bg-white"
                              />
                            </div>

                            <div className="col-span-5 sm:col-span-2 space-y-1">
                              <label className="text-[11px] font-semibold text-slate-600">Unit Cost (FCFA)</label>
                              <Input
                                type="number"
                                required
                                min="0"
                                value={line.unitCost}
                                onChange={(e) => handleLineChange(idx, "unitCost", e.target.value)}
                                className="h-8 text-xs bg-white"
                              />
                            </div>

                            <div className="col-span-1 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveLine(idx)}
                                disabled={lines.length <= 1}
                                className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Line total & valuation preview */}
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-slate-200/60">
                            <span>
                              Line Total: <strong className="text-slate-800">{lineTotal.toLocaleString()} FCFA</strong>
                            </span>
                            {line.type === "STOCK" && stockItem && (
                              <span className="flex items-center gap-1 text-indigo-700 font-medium">
                                <Calculator className="h-3 w-3" />
                                New Weighted Cost: {previewWeightedCost.toLocaleString()} FCFA/{unit} (was{" "}
                                {Number(stockItem.valuationUnitCost || 0).toLocaleString()} FCFA)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Payment & Account */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-xs"
                    >
                      <option value="CASH">Cash Payment</option>
                      <option value="MOMO">Mobile Money</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CREDIT">Supplier Credit (Pay Later)</option>
                    </select>
                  </div>

                  {paymentMethod !== "CREDIT" && accounts.length > 0 && (
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Pay Out Of Account / Drawer</label>
                      <select
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        className="w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-xs"
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({Number(acc.balance || 0).toLocaleString()} FCFA)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <div>
                    <span className="text-xs text-muted-foreground block">Total Acquisition Outflow:</span>
                    <span className="text-xl font-extrabold text-slate-900 font-mono">
                      {grandTotal.toLocaleString()} FCFA
                    </span>
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting || grandTotal <= 0}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-5 shadow-sm"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving Purchase...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm Purchase & Update Stock
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Recent Purchases List */}
        <div className="lg:col-span-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold">Recent Stock Deliveries</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentPurchases.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No purchases recorded recently.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                  {recentPurchases.slice(0, 8).map((p) => (
                    <div key={p.id} className="p-3 text-xs space-y-1 hover:bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 truncate">
                          {p.supplierName || "Supplier Restock"}
                        </span>
                        <span className="font-extrabold font-mono text-indigo-700">
                          {Number(p.totalAmount || 0).toLocaleString()} FCFA
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{new Date(p.date).toLocaleDateString()}</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          {p.paymentMethod}
                        </Badge>
                      </div>
                      {p.lines && p.lines.length > 0 && (
                        <p className="text-[10px] text-slate-500 pt-0.5 truncate">
                          {p.lines.map((l) => `${l.quantity}x ${l.stockItem?.name || l.menuItem?.name}`).join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
