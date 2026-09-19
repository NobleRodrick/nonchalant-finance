"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { recordDailySale } from "@/actions/transaction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import {
  Banknote,
  Percent,
  CreditCard,
  Building2,
  Calendar,
  Clock,
  User,
  PlusCircle,
  Loader2,
  CheckCircle2,
  Receipt,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";

export function SalesEntryForm({ departments = [], accounts = [], currentUser }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [departmentId, setDepartmentId] = useState(
    currentUser?.role !== "ADMIN" && currentUser?.departmentId
      ? currentUser.departmentId
      : departments[0]?.id || ""
  );
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [category, setCategory] = useState("sale-food");

  const [grossSales, setGrossSales] = useState("");
  const [discounts, setDiscounts] = useState("");
  const [cashSales, setCashSales] = useState("");
  const [creditSales, setCreditSales] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [otherIncome, setOtherIncome] = useState("");
  const [otherIncomeDescription, setOtherIncomeDescription] = useState("");
  const [description, setDescription] = useState("");

  const numGross = parseFloat(grossSales) || 0;
  const numDiscounts = parseFloat(discounts) || 0;
  const netSales = Math.max(0, numGross - numDiscounts);
  const numCash = parseFloat(cashSales) || 0;
  const numCredit = parseFloat(creditSales) || 0;
  const numOther = parseFloat(otherIncome) || 0;

  // Auto-distribute helpers
  const handleSetAllCash = () => {
    setCashSales(String(netSales));
    setCreditSales("0");
  };

  const handleSetSplitHalf = () => {
    const half = Math.round(netSales / 2);
    setCashSales(String(half));
    setCreditSales(String(netSales - half));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (numGross <= 0 && numOther <= 0) {
      toast.error("Please enter a valid sales amount or other income");
      return;
    }

    if (numDiscounts > numGross) {
      toast.error("Discounts cannot exceed total gross sales");
      return;
    }

    if (numCredit > 0 && !customerName.trim()) {
      toast.error("Please provide the customer or debtor name for credit sales");
      return;
    }

    setLoading(true);

    try {
      const res = await recordDailySale({
        departmentId,
        accountId: accountId || null,
        date: new Date(date).toISOString(),
        category,
        grossSales: numGross,
        discounts: numDiscounts,
        cashSales: numCash > 0 ? numCash : netSales - numCredit,
        creditSales: numCredit,
        customerName: customerName.trim(),
        otherIncome: numOther,
        otherIncomeDescription: otherIncomeDescription.trim(),
        description: description.trim() || `Daily Sales - ${format(new Date(date), "PPP")}`,
      });

      if (res.success) {
        toast.success(
          `Sales successfully recorded! Net: ${formatCurrency(netSales)} (${formatCurrency(
            numCash > 0 ? numCash : netSales - numCredit
          )} Cash, ${formatCurrency(numCredit)} Credit)`
        );
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to record sales");
      }
    } catch (err) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 1. Live Calculation Summary Banner */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 sm:p-6 rounded-2xl shadow-lg border border-slate-700">
        <div className="flex items-center justify-between pb-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-400" />
            <span className="text-xs uppercase tracking-wider font-bold text-slate-300">
              Live Sales Reconciliation
            </span>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
            {currentUser?.department?.name || "All Departments"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-center sm:text-left">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="text-xs text-slate-400 font-medium">1. Gross Sales</span>
            <div className="text-xl sm:text-2xl font-bold text-white mt-0.5">
              {formatCurrency(numGross)}
            </div>
            <span className="text-[11px] text-slate-400">Total billings before discounts</span>
          </div>

          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <span className="text-xs text-rose-300 font-medium">2. Discounts Offered</span>
            <div className="text-xl sm:text-2xl font-bold text-rose-400 mt-0.5">
              - {formatCurrency(numDiscounts)}
            </div>
            <span className="text-[11px] text-rose-300/80">Promotions, VIP & customer cuts</span>
          </div>

          <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
            <span className="text-xs text-emerald-300 font-medium">3. Actual Net Sales</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-0.5">
              {formatCurrency(netSales)}
            </div>
            <span className="text-[11px] text-emerald-300/80">True revenue generated</span>
          </div>
        </div>

        {(numCash > 0 || numCredit > 0 || numOther > 0) && (
          <div className="mt-4 pt-3 border-t border-slate-700/80 flex flex-wrap items-center justify-between text-xs text-slate-300 gap-2">
            <div>
              <span className="text-slate-400">Cash Received:</span>{" "}
              <strong className="text-emerald-300">{formatCurrency(numCash || netSales - numCredit)}</strong>
            </div>
            <div>
              <span className="text-slate-400">Credit / Debts:</span>{" "}
              <strong className="text-amber-300">{formatCurrency(numCredit)}</strong>
            </div>
            {numOther > 0 && (
              <div>
                <span className="text-slate-400">Other Income:</span>{" "}
                <strong className="text-blue-300">+{formatCurrency(numOther)}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Step 1: Gross Sales & Discounts */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" /> Step 1: Total Sales & Discounts
          </CardTitle>
          <CardDescription>
            Enter total sales registered on the till/pos, and specify any discounts given to customers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900 flex items-center justify-between">
                <span>Total Gross Sales (FCFA) *</span>
                <span className="text-xs text-muted-foreground">Before any discount</span>
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="e.g. 150000"
                value={grossSales}
                onChange={(e) => {
                  const val = e.target.value;
                  setGrossSales(val);
                  // Default cash sales to net
                  const g = parseFloat(val) || 0;
                  const d = parseFloat(discounts) || 0;
                  setCashSales(String(Math.max(0, g - d)));
                }}
                className="text-lg font-semibold h-11"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900 flex items-center justify-between">
                <span>Discounts Offered (FCFA)</span>
                <span className="text-xs text-rose-600 font-medium">Subtracted from gross</span>
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="e.g. 10000 (leave 0 if none)"
                value={discounts}
                onChange={(e) => {
                  const disc = e.target.value;
                  setDiscounts(disc);
                  const g = parseFloat(grossSales) || 0;
                  const d = parseFloat(disc) || 0;
                  setCashSales(String(Math.max(0, g - d - numCredit)));
                }}
                className="text-lg font-semibold h-11 border-rose-200 focus:border-rose-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Sales Stream</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale-food">Food & Kitchen Sales</SelectItem>
                  <SelectItem value="sale-drinks">Bar & Beverage Sales</SelectItem>
                  <SelectItem value="sale-catering">Events & Catering</SelectItem>
                  <SelectItem value="sale-other">Other Sales & Service</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currentUser?.role === "ADMIN" && departments.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Department</label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Step 2: Cash vs. Credit Breakdown */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" /> Step 2: Payment Distribution (Cash vs. Debts)
              </CardTitle>
              <CardDescription>
                Separate cash received in hand from customers who bought on credit/debt
              </CardDescription>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSetAllCash}
                className="text-xs h-8"
              >
                100% Cash
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSetSplitHalf}
                className="text-xs h-8"
              >
                50/50 Split
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
              <label className="text-sm font-semibold text-emerald-900 flex items-center justify-between">
                <span>Cash Sales Received (FCFA)</span>
                <span className="text-xs text-emerald-700">Goes to till / cash handover</span>
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="Cash collected"
                value={cashSales}
                onChange={(e) => setCashSales(e.target.value)}
                className="text-lg font-bold h-11 bg-white"
              />
            </div>

            <div className="space-y-2 p-3 bg-amber-50/60 rounded-xl border border-amber-100">
              <label className="text-sm font-semibold text-amber-900 flex items-center justify-between">
                <span>Credit / Debt Sales (FCFA)</span>
                <span className="text-xs text-amber-700">Customers paying later</span>
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="Amount on credit"
                value={creditSales}
                onChange={(e) => {
                  const cVal = e.target.value;
                  setCreditSales(cVal);
                  const c = parseFloat(cVal) || 0;
                  if (netSales >= c) {
                    setCashSales(String(netSales - c));
                  }
                }}
                className="text-lg font-bold h-11 bg-white border-amber-300"
              />
            </div>
          </div>

          {numCredit > 0 && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-2 animate-in fade-in-50">
              <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                <User className="h-4 w-4" /> Debtor Details
              </div>
              <p className="text-xs text-amber-700">
                Specify who owes this credit so management can track and collect it later.
              </p>
              <Input
                type="text"
                placeholder="Customer Name / Room / Phone / Company (e.g. 'Mr. Jean - Regular Client')"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="bg-white border-amber-300"
                required={numCredit > 0}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Step 3: Other Income & Transaction Metadata */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-indigo-600" /> Step 3: Other Income & Shift Details
          </CardTitle>
          <CardDescription>
            Optional tips, delivery fees, or date/time adjustments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Other Income (FCFA)</label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="e.g. 5000 (corkage, empty bottles, tips)"
                value={otherIncome}
                onChange={(e) => setOtherIncome(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Other Income Description</label>
              <Input
                type="text"
                placeholder="e.g. Sold empty crates / corkage fee"
                value={otherIncomeDescription}
                onChange={(e) => setOtherIncomeDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" /> Date and Time of Shift *
              </label>
              <Input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {accounts.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Banknote className="h-4 w-4 text-muted-foreground" /> Deposit to Cash Drawer / Account
                </label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Shift Notes / Comments</label>
            <Input
              type="text"
              placeholder="e.g. 'Busy evening shift, rainy weather, happy hour promotional discounts applied'"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 5. Submit Button */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 h-12 text-base shadow-md"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Saving Sales Entry...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5 mr-2" /> Record Sales Entry ({formatCurrency(netSales)})
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
