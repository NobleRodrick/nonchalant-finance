"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { FinancialInsights } from "./financial-insights";
import { IndustryKpiStrip } from "./industry-kpi-strip";
import { MonthSelector } from "./month-selector";
import {
  TrendingUp,
  TrendingDown,
  Building2,
  Users,
  Layers,
  Banknote,
  ShoppingCart,
  Boxes,
  FileText,
  Filter,
  Plus,
  ArrowRight,
  Clock,
} from "lucide-react";
import { format, isSameDay } from "date-fns";

export function ExecutiveDashboard({
  user,
  organization,
  departments = [],
  transactions = [],
  accounts = [],
  stockRecords = [],
  kpis,
}) {
  const currentMonthKey = format(new Date(), "yyyy-MM");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [selectedDeptId, setSelectedDeptId] = useState("all");

  // 1. Filter by Accounting Month
  const monthFilteredTransactions = useMemo(() => {
    if (selectedMonth === "all") return transactions;
    return transactions.filter((t) => {
      const txDate = format(new Date(t.date), "yyyy-MM");
      return txDate === selectedMonth;
    });
  }, [transactions, selectedMonth]);

  const monthFilteredStock = useMemo(() => {
    if (selectedMonth === "all") return stockRecords;
    return stockRecords.filter((s) => {
      const sDate = format(new Date(s.date), "yyyy-MM");
      return sDate === selectedMonth;
    });
  }, [stockRecords, selectedMonth]);

  // 2. Filter by Department Scope
  const displayedTransactions = useMemo(() => {
    if (selectedDeptId === "all") return monthFilteredTransactions;
    return monthFilteredTransactions.filter((t) => t.departmentId === selectedDeptId);
  }, [monthFilteredTransactions, selectedDeptId]);

  const displayedStock = useMemo(() => {
    if (selectedDeptId === "all") return monthFilteredStock;
    return monthFilteredStock.filter((s) => s.departmentId === selectedDeptId);
  }, [monthFilteredStock, selectedDeptId]);

  // 3. Today's Transactions for live shift monitoring
  const todayTransactions = useMemo(() => {
    const today = new Date();
    return transactions.filter((t) => isSameDay(new Date(t.date), today));
  }, [transactions]);

  const todayStock = useMemo(() => {
    const today = new Date();
    return stockRecords.filter((s) => isSameDay(new Date(s.date), today));
  }, [stockRecords]);

  // Human-readable period name
  const monthLabel =
    selectedMonth === "all"
      ? "Consolidated (All Time)"
      : format(new Date(`${selectedMonth}-01`), "MMMM yyyy");

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-5 w-5 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Executive Command Center
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{organization?.name || "Business Organization"}</h1>
          <p className="text-slate-300 text-sm mt-1">
            Consolidated managerial accounting across {departments.length} operational sectors
          </p>
        </div>

        {/* Quick Operations Actions */}
        <div className="flex flex-wrap gap-2">
          <Link href="/transaction/create?tab=sales">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm">
              <Banknote className="h-4 w-4 mr-1.5" /> Record Sales
            </Button>
          </Link>
          <Link href="/transaction/create?tab=purchases">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm">
              <ShoppingCart className="h-4 w-4 mr-1.5" /> Record Purchase
            </Button>
          </Link>
          <Link href="/stock">
            <Button size="sm" variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-white/20">
              <Boxes className="h-4 w-4 mr-1.5" /> Stock Control
            </Button>
          </Link>
          <Link href="/reports">
            <Button size="sm" variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-white/20">
              <FileText className="h-4 w-4 mr-1.5" /> Closing Reports
            </Button>
          </Link>
        </div>
      </div>

      {/* Control Bar: Accounting Month Selector & Department Scope Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 border rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1 mr-1">
            <Filter className="h-3.5 w-3.5" /> Sector:
          </span>
          <button
            onClick={() => setSelectedDeptId("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              selectedDeptId === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white border text-slate-700 hover:bg-slate-100"
            }`}
          >
            All Sectors (Consolidated)
          </button>
          {departments.map((dept) => (
            <button
              key={dept.id}
              onClick={() => setSelectedDeptId(dept.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                selectedDeptId === dept.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white border text-slate-700 hover:bg-slate-100"
              }`}
            >
              {dept.name}
            </button>
          ))}
        </div>

        <MonthSelector
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
        />
      </div>

      {/* Today's Real-time Operations Strip */}
      <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-2xl">
        <div className="flex items-center gap-2 mb-3 text-emerald-900 font-bold text-sm">
          <Clock className="h-4 w-4 text-emerald-600" />
          <span>Today&apos;s Live Shift ({format(new Date(), "PPP")})</span>
        </div>
        <IndustryKpiStrip
          transactions={todayTransactions}
          stockRecords={todayStock}
          title="Today's Performance"
          subtitle="Instant cash reconciliation and sales generated so far today"
        />
      </div>

      {/* Selected Accounting Period Performance Strip (Point 6 & 8) */}
      <IndustryKpiStrip
        transactions={displayedTransactions}
        stockRecords={displayedStock}
        title={`${monthLabel} Performance Overview`}
        subtitle={`Aggregated financial performance for ${monthLabel} (${displayedTransactions.length} operations)`}
      />

      {/* Cross-Department Breakdown Matrix (Point 7) */}
      {selectedDeptId === "all" && kpis?.departments && (
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-600" /> Department Performance Matrix ({monthLabel})
            </CardTitle>
            <CardDescription>
              Compare sales, food purchases, overheads, and cash handover across your departments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {kpis.departments.map((dept) => (
                <div
                  key={dept.id}
                  className="p-4 rounded-xl border bg-slate-50 hover:bg-slate-100/80 transition-all cursor-pointer shadow-sm"
                  onClick={() => setSelectedDeptId(dept.id)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-extrabold text-slate-900 text-sm">{dept.name}</span>
                    <Badge variant="outline" className="text-xs bg-white">
                      {dept.transactionCount} txns
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gross Sales:</span>
                      <span className="font-bold text-slate-900">{formatCurrency(dept.sales + (dept.discounts || 0))}</span>
                    </div>
                    {dept.discounts > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span>Discounts Given:</span>
                        <span>- {formatCurrency(dept.discounts)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Purchases (Stock):</span>
                      <span className="font-semibold text-blue-700">{formatCurrency(dept.purchases)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expenses (OPEX):</span>
                      <span className="font-semibold text-rose-700">{formatCurrency(dept.expenses)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t font-extrabold">
                      <span>Estimated Profit:</span>
                      <span className={dept.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}>
                        {formatCurrency(dept.netProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] pt-1 text-amber-800 font-semibold bg-amber-50/60 p-1.5 rounded">
                      <span>Cash Handover:</span>
                      <span>{formatCurrency(dept.cashToHandOver || 0)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial Statements & Ratio Reports */}
      <FinancialInsights
        accounts={accounts}
        transactions={displayedTransactions}
      />
    </div>
  );
}
