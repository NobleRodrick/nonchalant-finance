"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { IndustryKpiStrip } from "./industry-kpi-strip";
import { MonthSelector } from "./month-selector";
import {
  Banknote,
  ShoppingCart,
  Boxes,
  FileText,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  CreditCard,
  Plus,
} from "lucide-react";
import { format, isSameDay } from "date-fns";

export function DepartmentDashboard({
  user,
  department,
  organization,
  transactions = [],
  accounts = [],
  stockRecords = [],
}) {
  const deptName = department?.name || "Assigned Department";
  const currentMonthKey = format(new Date(), "yyyy-MM");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  // Month-filtered data
  const monthTransactions = useMemo(() => {
    if (selectedMonth === "all") return transactions;
    return transactions.filter((t) => format(new Date(t.date), "yyyy-MM") === selectedMonth);
  }, [transactions, selectedMonth]);

  const monthStock = useMemo(() => {
    if (selectedMonth === "all") return stockRecords;
    return stockRecords.filter((s) => format(new Date(s.date), "yyyy-MM") === selectedMonth);
  }, [stockRecords, selectedMonth]);

  // Today's shift data
  const todayTransactions = useMemo(() => {
    const today = new Date();
    return transactions.filter((t) => isSameDay(new Date(t.date), today));
  }, [transactions]);

  const todayStock = useMemo(() => {
    const today = new Date();
    return stockRecords.filter((s) => isSameDay(new Date(s.date), today));
  }, [stockRecords]);

  const monthLabel =
    selectedMonth === "all"
      ? "All Time"
      : format(new Date(`${selectedMonth}-01`), "MMMM yyyy");

  return (
    <div className="space-y-8">
      {/* Department Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-800 to-indigo-900 text-white p-6 rounded-2xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-blue-200" />
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">
              {organization?.name || "Business Organization"}
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{deptName} Portal</h1>
          <p className="text-blue-100 text-sm mt-1">
            Role: <span className="font-semibold capitalize">{user.role.toLowerCase()}</span> • Shift Operator: {user.name}
          </p>
        </div>

        {/* Action Shortcuts */}
        <div className="flex flex-wrap gap-2">
          <Link href="/transaction/create?tab=sales">
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-sm">
              <Banknote className="h-4 w-4 mr-1.5" /> Record Sales
            </Button>
          </Link>
          <Link href="/transaction/create?tab=purchases">
            <Button className="bg-white text-blue-900 hover:bg-blue-50 font-bold shadow-sm">
              <ShoppingCart className="h-4 w-4 mr-1.5" /> Record Purchase
            </Button>
          </Link>
          <Link href="/stock">
            <Button variant="secondary" className="bg-blue-900/70 hover:bg-blue-900 text-white border border-blue-400/30">
              <Boxes className="h-4 w-4 mr-1.5" /> Stock Count
            </Button>
          </Link>
          <Link href="/reports">
            <Button variant="secondary" className="bg-blue-900/70 hover:bg-blue-900 text-white border border-blue-400/30">
              <FileText className="h-4 w-4 mr-1.5" /> Closing Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Control Bar: Accounting Month Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 border rounded-2xl">
        <div className="text-xs font-semibold text-slate-700">
          Showing operations for: <span className="text-blue-700 font-bold">{monthLabel}</span>
        </div>
        <MonthSelector
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
        />
      </div>

      {/* Today's Shift Performance (Live Cash Handover & Sales) */}
      <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-2xl">
        <div className="flex items-center gap-2 mb-3 text-emerald-900 font-bold text-sm">
          <Clock className="h-4 w-4 text-emerald-600" />
          <span>Today&apos;s Shift Reconciliation ({format(new Date(), "PPP")})</span>
        </div>
        <IndustryKpiStrip
          transactions={todayTransactions}
          stockRecords={todayStock}
          title="Today's Shift Performance"
          subtitle="Real-time sales, food purchases, discounts, and cash to be handed over tonight"
        />
      </div>

      {/* Selected Month Operations Performance */}
      <IndustryKpiStrip
        transactions={monthTransactions}
        stockRecords={monthStock}
        title={`${monthLabel} Summary for ${deptName}`}
        subtitle={`Cumulative sales, stock consumption, and profit for this accounting period`}
      />

      {/* Recent Operations Activity Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold">Recent Operations Ledger</CardTitle>
            <CardDescription>
              Last recorded sales, purchases, and expenses for {deptName}
            </CardDescription>
          </div>
          <Link href="/reports">
            <Button variant="outline" size="sm" className="text-xs">
              View Full Reports
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No transactions recorded for this department yet. Record your first sale or purchase!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Payment</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.slice(0, 10).map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-medium whitespace-nowrap text-xs">
                        {format(new Date(t.date), "PPP p")}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-bold ${
                            t.type === "SALE" || t.type === "INCOME"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : t.type === "PURCHASE"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : t.type === "DISCOUNT"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {t.type}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 text-xs">
                        {t.description || t.category}
                        {t.customerName && (
                          <span className="text-muted-foreground ml-1">
                            (Customer: {t.customerName})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-xs">
                        {t.paymentMethod === "CREDIT" ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-300 font-semibold text-[10px]">
                            Credit / Debt
                          </Badge>
                        ) : (
                          <span className="text-slate-600 text-xs">Cash</span>
                        )}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold text-sm ${
                          t.type === "SALE" || t.type === "INCOME"
                            ? "text-emerald-600"
                            : t.type === "PURCHASE"
                            ? "text-blue-600"
                            : "text-rose-600"
                        }`}
                      >
                        {t.type === "SALE" || t.type === "INCOME" ? "+" : "-"}
                        {formatCurrency(t.amount)}
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
