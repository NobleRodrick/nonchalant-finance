"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { recordDailyStock } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import {
  Boxes,
  TrendingDown,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  Loader2,
  History,
  Info,
} from "lucide-react";
import { format } from "date-fns";

export function DailyStockForm({
  departments = [],
  currentUser,
  latestRecord = null,
  history = [],
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [departmentId, setDepartmentId] = useState(
    currentUser?.role !== "ADMIN" && currentUser?.departmentId
      ? currentUser.departmentId
      : departments[0]?.id || ""
  );

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  // Auto-fill opening stock from yesterday's closing stock if available!
  const [openingStock, setOpeningStock] = useState(
    latestRecord?.closingStock ? String(latestRecord.closingStock) : ""
  );
  const [newPurchases, setNewPurchases] = useState("");
  const [stockUsed, setStockUsed] = useState("");
  const [damagedStock, setDamagedStock] = useState("");
  const [notes, setNotes] = useState("");

  const numOpening = parseFloat(openingStock) || 0;
  const numPurchases = parseFloat(newPurchases) || 0;
  const numUsed = parseFloat(stockUsed) || 0;
  const numDamaged = parseFloat(damagedStock) || 0;

  // Real-time stock math
  const availableStock = numOpening + numPurchases;
  const closingStock = Math.max(0, availableStock - numUsed - numDamaged);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (numOpening === 0 && numPurchases === 0) {
      toast.error("Please provide an opening stock or new purchases value");
      return;
    }

    if (numUsed + numDamaged > availableStock) {
      toast.error(
        `Stock used + damaged (${formatCurrency(
          numUsed + numDamaged
        )}) cannot exceed available stock (${formatCurrency(availableStock)})`
      );
      return;
    }

    setLoading(true);

    try {
      const res = await recordDailyStock({
        departmentId,
        date: new Date(date).toISOString(),
        openingStock: numOpening,
        newPurchases: numPurchases,
        stockUsed: numUsed,
        damagedStock: numDamaged,
        notes: notes.trim(),
      });

      if (res.success) {
        toast.success(
          `Stock record saved! Closing Stock: ${formatCurrency(res.data.closingStock)}`
        );
        router.refresh();
        setNewPurchases("");
        setStockUsed("");
        setDamagedStock("");
        setNotes("");
        setOpeningStock(String(res.data.closingStock));
      } else {
        toast.error(res.error || "Failed to record stock");
      }
    } catch (err) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Real-time Inventory Calculation Strip */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-indigo-900/50">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-indigo-400" />
            <span className="text-xs uppercase tracking-wider font-bold text-indigo-300">
              Department Inventory Ledger
            </span>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold">
            {currentUser?.departmentName || departments.find((d) => d.id === departmentId)?.name || "Department Stock"}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 text-center sm:text-left">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[11px] text-slate-400 font-medium">1. Opening Stock</span>
            <div className="text-lg sm:text-xl font-bold text-white mt-0.5">
              {formatCurrency(numOpening)}
            </div>
            <span className="text-[10px] text-slate-400">Carried forward</span>
          </div>

          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <span className="text-[11px] text-blue-300 font-medium">+ Purchases</span>
            <div className="text-lg sm:text-xl font-bold text-blue-300 mt-0.5">
              + {formatCurrency(numPurchases)}
            </div>
            <span className="text-[10px] text-blue-300/80">Received today</span>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-[11px] text-amber-300 font-medium">= Available</span>
            <div className="text-lg sm:text-xl font-bold text-amber-300 mt-0.5">
              {formatCurrency(availableStock)}
            </div>
            <span className="text-[10px] text-amber-300/80">In store/kitchen</span>
          </div>

          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <span className="text-[11px] text-rose-300 font-medium">- Used / Consumed</span>
            <div className="text-lg sm:text-xl font-bold text-rose-300 mt-0.5">
              - {formatCurrency(numUsed + numDamaged)}
            </div>
            <span className="text-[10px] text-rose-300/80">
              {numDamaged > 0 ? `(${formatCurrency(numDamaged)} wasted)` : "Food cost / COGS"}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
            <span className="text-[11px] text-emerald-300 font-medium">= Closing Stock</span>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 mt-0.5">
              {formatCurrency(closingStock)}
            </div>
            <span className="text-[10px] text-emerald-300/80">Remaining tonight</span>
          </div>
        </div>
      </div>

      {/* 2. Stock Entry Form */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Boxes className="h-5 w-5 text-indigo-600" /> Record Daily Stock Movement
          </CardTitle>
          <CardDescription>
            Account for raw food & beverage materials received, prepared, and remaining in the department
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-muted-foreground" /> Date of Stock Count *
                </label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="h-10"
                />
              </div>

              {currentUser?.role === "ADMIN" && departments.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-muted-foreground" /> Department / Sector *
                  </label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger className="h-10">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <label className="text-xs font-semibold uppercase text-slate-700">
                  Opening Stock (FCFA) *
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 300000"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  className="font-bold bg-white"
                  required
                />
                <p className="text-[11px] text-muted-foreground">Value at start of shift</p>
              </div>

              <div className="space-y-1.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                <label className="text-xs font-semibold uppercase text-blue-900">
                  + New Purchases (FCFA)
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 100000"
                  value={newPurchases}
                  onChange={(e) => setNewPurchases(e.target.value)}
                  className="font-bold bg-white"
                />
                <p className="text-[11px] text-blue-700">Food/drinks bought today</p>
              </div>

              <div className="space-y-1.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                <label className="text-xs font-semibold uppercase text-amber-900">
                  - Stock Used (FCFA) *
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 150000"
                  value={stockUsed}
                  onChange={(e) => setStockUsed(e.target.value)}
                  className="font-bold bg-white"
                  required
                />
                <p className="text-[11px] text-amber-700">Cooked or served to clients</p>
              </div>

              <div className="space-y-1.5 p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                <label className="text-xs font-semibold uppercase text-rose-900">
                  - Damaged / Wasted (FCFA)
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 5000"
                  value={damagedStock}
                  onChange={(e) => setDamagedStock(e.target.value)}
                  className="font-bold bg-white"
                />
                <p className="text-[11px] text-rose-700">Spoilage, burns, expired</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Inventory Notes / Key Items Count
              </label>
              <Input
                type="text"
                placeholder="e.g. 15kg beef left, 4 crates Guinness, 1 bag rice remaining"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 h-11"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving Stock...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Save Daily Stock Count ({formatCurrency(closingStock)})
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 3. Historical Stock Ledger Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <History className="h-5 w-5 text-slate-600" /> Stock Movement History
            </CardTitle>
            <CardDescription>
              Recent daily stock logs for this department
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No daily stock records entered yet. Save your first stock count above!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b">
                  <tr>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3 text-right">Opening</th>
                    <th className="py-3 px-3 text-right">Purchased</th>
                    <th className="py-3 px-3 text-right">Used (COGS)</th>
                    <th className="py-3 px-3 text-right">Damaged</th>
                    <th className="py-3 px-3 text-right font-bold">Closing</th>
                    <th className="py-3 px-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-medium whitespace-nowrap">
                        {format(new Date(rec.date), "PPP")}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                        {rec.department?.name || "General"}
                      </td>
                      <td className="py-3 px-3 text-right">{formatCurrency(rec.openingStock)}</td>
                      <td className="py-3 px-3 text-right text-blue-600 font-medium">
                        +{formatCurrency(rec.newPurchases)}
                      </td>
                      <td className="py-3 px-3 text-right text-rose-600 font-medium">
                        -{formatCurrency(rec.stockUsed)}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-600">
                        {rec.damagedStock > 0 ? `-${formatCurrency(rec.damagedStock)}` : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-emerald-600">
                        {formatCurrency(rec.closingStock)}
                      </td>
                      <td className="py-3 px-3 text-xs text-muted-foreground truncate max-w-[200px]">
                        {rec.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
