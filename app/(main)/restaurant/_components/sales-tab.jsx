"use client";

import { useState } from "react";
import { recordItemizedSale } from "@/actions/restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Utensils,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Building,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";

export function SalesTab({ menuItems = [], accounts = [], departmentId, onSaleComplete }) {
  const [selectedLines, setSelectedLines] = useState([]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Add a dish to current order
  const handleAddDish = (dish) => {
    const existing = selectedLines.find((l) => l.menuItemId === dish.id);
    const currentQty = existing ? existing.quantity : 0;

    if (currentQty + 1 > dish.availableQuantity) {
      toast.error(`Cannot add more than available plates (${dish.availableQuantity}) for ${dish.name}`);
      return;
    }

    if (existing) {
      setSelectedLines(
        selectedLines.map((l) =>
          l.menuItemId === dish.id ? { ...l, quantity: l.quantity + 1 } : l
        )
      );
    } else {
      setSelectedLines([
        ...selectedLines,
        {
          menuItemId: dish.id,
          name: dish.name,
          unitPrice: dish.sellingPrice,
          availableQuantity: dish.availableQuantity,
          quantity: 1,
        },
      ]);
    }
  };

  const handleUpdateQty = (menuItemId, newQty) => {
    const dish = menuItems.find((d) => d.id === menuItemId);
    if (!dish) return;

    if (newQty <= 0) {
      setSelectedLines(selectedLines.filter((l) => l.menuItemId !== menuItemId));
      return;
    }

    if (newQty > dish.availableQuantity) {
      toast.error(`Only ${dish.availableQuantity} plates available for ${dish.name}`);
      return;
    }

    setSelectedLines(
      selectedLines.map((l) =>
        l.menuItemId === menuItemId ? { ...l, quantity: newQty } : l
      )
    );
  };

  const handleRemoveLine = (menuItemId) => {
    setSelectedLines(selectedLines.filter((l) => l.menuItemId !== menuItemId));
  };

  // Calculations
  const grossTotal = selectedLines.reduce(
    (sum, l) => sum + l.quantity * Number(l.unitPrice || 0),
    0
  );
  const discountVal = Math.min(grossTotal, Math.max(0, Number(discountAmount) || 0));
  const netTotal = Math.max(0, grossTotal - discountVal);

  const handleSubmitSale = async (e) => {
    e.preventDefault();
    if (selectedLines.length === 0) {
      toast.error("Add at least one dish to the order");
      return;
    }

    if (paymentMethod === "CREDIT" && !customerName.trim()) {
      toast.error("Debtor / Customer name is mandatory for credit sales");
      return;
    }

    setSubmitting(true);
    try {
      const res = await recordItemizedSale({
        departmentId,
        lines: selectedLines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
        })),
        discountAmount: discountVal,
        paymentMethod,
        customerName,
        customerContact,
        accountId: paymentMethod !== "CREDIT" ? accountId : null,
        description: notes || "Restaurant food order",
      });

      if (res.success) {
        toast.success(`Sale recorded! Total: ${netTotal.toLocaleString()} FCFA`);
        setSelectedLines([]);
        setDiscountAmount("");
        setCustomerName("");
        setCustomerContact("");
        setNotes("");
        onSaleComplete();
      } else {
        toast.error(res.error || "Failed to record sale");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Menu Dish Selector (Left side) */}
      <div className="lg:col-span-7 space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Food Ordering & POS</h2>
          <p className="text-xs text-muted-foreground">
            Select dishes to assemble the customer order. Inventory deductions are executed atomically.
          </p>
        </div>

        {menuItems.length === 0 ? (
          <Card className="py-10 text-center text-xs text-muted-foreground">
            No dishes available. Please add dishes in the &quot;Dishes & Menu&quot; tab first.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
            {menuItems.map((dish) => {
              const isOutOfStock = dish.availableQuantity <= 0;
              const inCart = selectedLines.find((l) => l.menuItemId === dish.id);

              return (
                <div
                  key={dish.id}
                  onClick={() => !isOutOfStock && handleAddDish(dish)}
                  className={`p-3.5 rounded-xl border transition-all text-left relative flex flex-col justify-between ${
                    isOutOfStock
                      ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                      : inCart
                      ? "border-emerald-500 bg-emerald-50/30 shadow-xs cursor-pointer hover:border-emerald-600"
                      : "border-slate-200 bg-white shadow-2xs hover:border-slate-300 hover:shadow-xs cursor-pointer"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-bold text-sm text-slate-900 leading-snug">{dish.name}</span>
                      {inCart && (
                        <Badge className="bg-emerald-600 text-white text-[10px] h-5 px-1.5 shrink-0">
                          {inCart.quantity} in order
                        </Badge>
                      )}
                    </div>
                    {dish.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{dish.description}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100 text-xs">
                    <span className="font-extrabold text-slate-900">
                      {dish.sellingPrice?.toLocaleString()} FCFA
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        isOutOfStock ? "text-rose-600" : "text-slate-600"
                      }`}
                    >
                      {isOutOfStock ? "Out of stock" : `${dish.availableQuantity} plates left`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Current Order Summary (Right side) */}
      <div className="lg:col-span-5">
        <Card className="border-slate-200 shadow-md sticky top-20">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <span>Current Order Ticket</span>
              <span className="text-xs font-normal text-muted-foreground">
                {selectedLines.length} item{selectedLines.length !== 1 ? "s" : ""}
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            {/* Order lines list */}
            {selectedLines.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Click on any dish to add it to this order ticket.
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto divide-y divide-slate-100 pr-1">
                {selectedLines.map((line) => (
                  <div key={line.menuItemId} className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs">
                    <div className="flex-1">
                      <span className="font-bold text-slate-900 block truncate">{line.name}</span>
                      <span className="text-muted-foreground text-[11px]">
                        {line.unitPrice?.toLocaleString()} FCFA × {line.quantity} ={" "}
                        <span className="font-semibold text-slate-800">
                          {(line.quantity * line.unitPrice).toLocaleString()} FCFA
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 rounded"
                        onClick={() => handleUpdateQty(line.menuItemId, line.quantity - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-bold text-xs w-5 text-center">{line.quantity}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 rounded"
                        onClick={() => handleUpdateQty(line.menuItemId, line.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-rose-600 hover:text-rose-700"
                        onClick={() => handleRemoveLine(line.menuItemId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Price Calculations */}
            <div className="space-y-2 pt-3 border-t border-slate-100 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (Gross)</span>
                <span className="font-bold font-mono">{grossTotal.toLocaleString()} FCFA</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">Discount (FCFA)</span>
                <Input
                  type="number"
                  min="0"
                  max={grossTotal}
                  placeholder="0"
                  className="w-28 h-7 text-xs text-right font-mono"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                />
              </div>

              <div className="flex justify-between text-base font-extrabold text-slate-900 pt-1 border-t border-slate-200">
                <span>Net Total to Pay</span>
                <span className="text-emerald-700 font-mono">{netTotal.toLocaleString()} FCFA</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold uppercase text-slate-400 block">Payment Method</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: "CASH", label: "Cash", icon: Banknote },
                  { id: "MOMO", label: "Mobile Money", icon: Smartphone },
                  { id: "BANK_TRANSFER", label: "Bank Transfer", icon: Building },
                  { id: "CREDIT", label: "Credit / Debt", icon: CreditCard },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPaymentMethod(id)}
                    className={`flex items-center gap-1.5 p-2 rounded-lg border text-left transition-colors ${
                      paymentMethod === id
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-bold"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* If Credit, prompt Debtor Details */}
            {paymentMethod === "CREDIT" && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                  <AlertCircle className="h-4 w-4 text-amber-700" />
                  <span>Customer Debt Recording</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Debtor Name *</label>
                  <Input
                    required
                    placeholder="e.g. Chief Dr. Traore"
                    className="h-8 text-xs bg-white"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Phone / Reference</label>
                  <Input
                    placeholder="e.g. +237 670 123 456"
                    className="h-8 text-xs bg-white"
                    value={customerContact}
                    onChange={(e) => setCustomerContact(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Account Selector for Cash/Bank */}
            {paymentMethod !== "CREDIT" && accounts.length > 0 && (
              <div className="space-y-1 text-xs">
                <label className="text-[11px] font-semibold text-slate-600">Deposit Into Drawer / Account</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-slate-200 bg-white text-xs"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({Number(acc.balance || 0).toLocaleString()} FCFA)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Confirm Button */}
            <Button
              type="button"
              onClick={handleSubmitSale}
              disabled={submitting || selectedLines.length === 0}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Recording Sale & Deducting Stock...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Complete Sale ({netTotal.toLocaleString()} FCFA)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
