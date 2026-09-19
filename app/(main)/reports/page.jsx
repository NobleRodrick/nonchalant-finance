"use client";

import { useState, useEffect, useMemo } from "react";
import { getDashboardData } from "@/actions/dashboard";
import { getDepartments } from "@/actions/organization";
import { getSessionUser } from "@/actions/auth";
import { getDepartmentStockRecords } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import {
  FileText,
  Printer,
  Calendar,
  Building2,
  Filter,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Loader2,
  Copy,
  Download,
  Banknote,
  ShoppingCart,
  Zap,
  Boxes,
  HandCoins,
  CreditCard,
  Percent,
} from "lucide-react";
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  isWithinInterval,
} from "date-fns";

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [allStockRecords, setAllStockRecords] = useState([]);

  // Filter states
  const [period, setPeriod] = useState("today");
  const [selectedDeptId, setSelectedDeptId] = useState("all");
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    async function loadData() {
      try {
        const [user, depts, txns, stock] = await Promise.all([
          getSessionUser(),
          getDepartments(),
          getDashboardData("all"),
          getDepartmentStockRecords(null, 100),
        ]);

        setCurrentUser(user);
        setDepartments(depts || []);
        setAllTransactions(txns || []);
        setAllStockRecords(stock || []);

        if (user?.role !== "ADMIN" && user?.departmentId) {
          setSelectedDeptId(user.departmentId);
        }
      } catch (err) {
        toast.error("Failed to load report data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Compute date interval
  const dateInterval = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now), label: `Daily Closing - ${format(now, "PPP")}` };
      case "yesterday": {
        const yest = subDays(now, 1);
        return { start: startOfDay(yest), end: endOfDay(yest), label: `Daily Closing - Yesterday (${format(yest, "PPP")})` };
      }
      case "this-week":
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
          label: `Weekly Report - Week of ${format(startOfWeek(now, { weekStartsOn: 1 }), "PPP")}`,
        };
      case "last-7":
        return { start: startOfDay(subDays(now, 7)), end: endOfDay(now), label: "Rolling 7-Day Summary" };
      case "this-month":
        return { start: startOfMonth(now), end: endOfMonth(now), label: `Monthly Statement - ${format(now, "MMMM yyyy")}` };
      case "custom":
      default:
        return {
          start: customStart ? new Date(customStart + "T00:00:00") : startOfDay(now),
          end: customEnd ? new Date(customEnd + "T23:59:59") : endOfDay(now),
          label: `Custom Period: ${customStart} to ${customEnd}`,
        };
    }
  }, [period, customStart, customEnd]);

  // Filter transactions for report
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      const txDate = new Date(tx.date);
      const matchesDate = isWithinInterval(txDate, {
        start: dateInterval.start,
        end: dateInterval.end,
      });

      const matchesDept =
        selectedDeptId === "all" || tx.departmentId === selectedDeptId;

      return matchesDate && matchesDept;
    });
  }, [allTransactions, dateInterval, selectedDeptId]);

  // Filter stock records for report
  const filteredStockRecords = useMemo(() => {
    return allStockRecords.filter((s) => {
      const sDate = new Date(s.date);
      const matchesDate = isWithinInterval(sDate, {
        start: dateInterval.start,
        end: dateInterval.end,
      });
      const matchesDept = selectedDeptId === "all" || s.departmentId === selectedDeptId;
      return matchesDate && matchesDept;
    });
  }, [allStockRecords, dateInterval, selectedDeptId]);

  // Comprehensive Financial & Operational Calculations
  const reportMetrics = useMemo(() => {
    let grossSales = 0;
    let discounts = 0;
    let netSales = 0;
    let cashSales = 0;
    let creditSales = 0;
    let otherIncome = 0;
    let totalPurchases = 0;
    let totalExpenses = 0;
    let outstandingDebts = 0;

    const creditTransactions = [];
    const salesByCategory = {};
    const purchasesByCategory = {};
    const expensesByCategory = {};

    filteredTransactions.forEach((tx) => {
      const amt = Number(tx.amount || 0);
      const gross = Number(tx.grossAmount || tx.amount || 0);
      const disc = Number(tx.discountAmount || 0);
      const net = Number(tx.netAmount || tx.amount || 0);
      const cat = tx.category || "General";

      if (tx.type === "SALE") {
        grossSales += gross;
        discounts += disc;
        netSales += net;

        salesByCategory[cat] = (salesByCategory[cat] || 0) + net;

        if (tx.paymentMethod === "CREDIT") {
          creditSales += net;
          creditTransactions.push(tx);
          if (!tx.isDebtPaid) outstandingDebts += net;
        } else {
          cashSales += net;
        }
      } else if (tx.type === "INCOME") {
        grossSales += amt;
        netSales += amt;
        cashSales += amt;
        otherIncome += amt;
        salesByCategory[cat] = (salesByCategory[cat] || 0) + amt;
      } else if (tx.type === "PURCHASE" || (tx.category && tx.category.startsWith("purchase-"))) {
        totalPurchases += amt;
        purchasesByCategory[cat] = (purchasesByCategory[cat] || 0) + amt;
      } else if (tx.type === "DISCOUNT") {
        discounts += amt;
      } else {
        totalExpenses += amt;
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + amt;
      }
    });

    // Stock metrics
    let openingStock = 0;
    let newStockPurchased = 0;
    let stockUsed = 0;
    let damagedStock = 0;
    let closingStock = 0;

    if (filteredStockRecords.length > 0) {
      openingStock = Number(filteredStockRecords[filteredStockRecords.length - 1].openingStock || 0);
      filteredStockRecords.forEach((s) => {
        newStockPurchased += Number(s.newPurchases || 0);
        stockUsed += Number(s.stockUsed || 0);
        damagedStock += Number(s.damagedStock || 0);
      });
      closingStock = Number(filteredStockRecords[0].closingStock || 0);
    } else {
      newStockPurchased = totalPurchases;
    }

    const cogs = stockUsed > 0 ? stockUsed : totalPurchases;
    const grossMargin = netSales - cogs;
    const netProfit = grossMargin - totalExpenses;
    const marginPercent = netSales > 0 ? ((netProfit / netSales) * 100).toFixed(1) : 0;

    // Cash Handover: Total actual cash collected minus cash paid out
    const cashToHandOver = Math.max(0, cashSales + otherIncome - totalPurchases - totalExpenses);

    return {
      grossSales,
      discounts,
      netSales,
      cashSales,
      creditSales,
      otherIncome,
      totalPurchases,
      totalExpenses,
      cogs,
      grossMargin,
      netProfit,
      marginPercent,
      cashToHandOver,
      outstandingDebts,
      creditTransactions,
      salesByCategory,
      purchasesByCategory,
      expensesByCategory,
      openingStock,
      newStockPurchased,
      stockUsed,
      damagedStock,
      closingStock,
      txCount: filteredTransactions.length,
    };
  }, [filteredTransactions, filteredStockRecords]);

  // Print function (opens browser print dialog which formats as PDF export)
  const handlePrint = () => {
    window.print();
  };

  // Copy structured summary for WhatsApp / Managerial communication
  const handleCopySummary = () => {
    const deptTitle =
      selectedDeptId === "all"
        ? "Consolidated (All Sectors)"
        : departments.find((d) => d.id === selectedDeptId)?.name || "Department";

    const text = `📊 *${currentUser?.organizationName || "Restaurant Group"} - Closing Report*
🏢 *Department:* ${deptTitle}
📅 *Period:* ${dateInterval.label}

💵 *Gross Sales:* ${formatCurrency(reportMetrics.grossSales)}
🏷️ *Discounts:* -${formatCurrency(reportMetrics.discounts)}
✨ *Net Sales:* ${formatCurrency(reportMetrics.netSales)}
💰 *Cash Sales Received:* ${formatCurrency(reportMetrics.cashSales)}
💳 *Credit / Debts:* ${formatCurrency(reportMetrics.creditSales)}

📦 *Food Purchases (COGS):* ${formatCurrency(reportMetrics.totalPurchases)}
💡 *Operating Expenses:* ${formatCurrency(reportMetrics.totalExpenses)}
📈 *Net Estimated Profit:* ${formatCurrency(reportMetrics.netProfit)} (${reportMetrics.marginPercent}%)

🚨 *Cash to Hand Over Tonight:* ${formatCurrency(reportMetrics.cashToHandOver)}
${reportMetrics.closingStock > 0 ? `📦 *Closing Stock Remaining:* ${formatCurrency(reportMetrics.closingStock)}\n` : ""}
Generated on ${new Date().toLocaleString()} by ${currentUser?.name || "Shift Manager"}`;

    navigator.clipboard.writeText(text);
    toast.success("Executive closing report copied to clipboard!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const activeDepartmentName =
    selectedDeptId === "all"
      ? "All Departments (Consolidated)"
      : departments.find((d) => d.id === selectedDeptId)?.name || "Assigned Department";

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* 1. Interactive Controls Toolbar (Hidden in Print) */}
      <Card className="shadow-sm border-slate-200 print:hidden">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-extrabold flex items-center gap-2 text-slate-900">
                <FileText className="h-6 w-6 text-blue-600" />
                Financial & Operational Closing Reports
              </CardTitle>
              <CardDescription>
                Generate, download, and print official daily, weekly, or monthly closing statements
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopySummary} className="h-9">
                <Copy className="h-4 w-4 mr-1.5" /> Copy Summary
              </Button>
              <Button size="sm" onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9">
                <Printer className="h-4 w-4 mr-1.5" /> Print / Save PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap items-center gap-3">
            {/* Department Scope Selector */}
            {currentUser?.role === "ADMIN" && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Department:</span>
                <select
                  className="h-9 rounded-md border border-input bg-white px-3 py-1 text-xs font-medium shadow-sm"
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                >
                  <option value="all">All Departments (Consolidated)</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Time Period Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Report Frequency:</span>
              <select
                className="h-9 rounded-md border border-input bg-white px-3 py-1 text-xs font-bold shadow-sm text-blue-900"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="today">📅 Daily Closing Report (Today)</option>
                <option value="yesterday">📅 Yesterday's Shift</option>
                <option value="this-week">📊 Weekly Performance Report</option>
                <option value="last-7">📊 Rolling 7 Days</option>
                <option value="this-month">📑 Monthly Financial Statement</option>
                <option value="custom">🔍 Custom Date Range</option>
              </select>
            </div>

            {/* Custom Dates if selected */}
            {period === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-9 w-36 text-xs"
                />
                <span className="text-xs text-slate-400">to</span>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-9 w-36 text-xs"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Official Printable & Downloadable Report Document */}
      <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-md border border-slate-200 print:border-none print:shadow-none print:p-0 space-y-8 max-w-4xl mx-auto">
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase font-extrabold tracking-widest text-blue-600 mb-1">
              Official Operations & Financial Statement
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {currentUser?.organizationName || "Business Organization"}
            </h1>
            <p className="text-sm font-semibold text-slate-700 mt-1 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-500" />
              <span>Department: {activeDepartmentName}</span>
            </p>
          </div>

          <div className="sm:text-right space-y-1 text-xs text-slate-600">
            <div className="font-extrabold text-sm text-slate-900">{dateInterval.label}</div>
            <div>Generated: {format(new Date(), "PPP p")}</div>
            <div>Prepared By: <span className="font-semibold">{currentUser?.name}</span> ({currentUser?.role})</div>
            <div>Transactions Recorded: <span className="font-semibold">{reportMetrics.txCount}</span></div>
          </div>
        </div>

        {/* Executive Highlights Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Gross Sales</span>
            <div className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
              {formatCurrency(reportMetrics.grossSales)}
            </div>
            {reportMetrics.discounts > 0 && (
              <span className="text-[10px] text-rose-600 font-medium">
                -{formatCurrency(reportMetrics.discounts)} disc
              </span>
            )}
          </div>

          <div>
            <span className="text-[11px] font-semibold text-emerald-700 uppercase">Net Sales</span>
            <div className="text-lg sm:text-xl font-extrabold text-emerald-700 mt-0.5">
              {formatCurrency(reportMetrics.netSales)}
            </div>
            <span className="text-[10px] text-emerald-700/80">Realized revenue</span>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-blue-700 uppercase">Purchases & Expenses</span>
            <div className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
              {formatCurrency(reportMetrics.totalPurchases + reportMetrics.totalExpenses)}
            </div>
            <span className="text-[10px] text-slate-500">
              {formatCurrency(reportMetrics.totalPurchases)} stock + {formatCurrency(reportMetrics.totalExpenses)} opex
            </span>
          </div>

          <div className="bg-emerald-100/60 p-2.5 rounded-lg border border-emerald-300">
            <span className="text-[11px] font-bold text-emerald-900 uppercase">Estimated Net Profit</span>
            <div className={`text-xl sm:text-2xl font-black mt-0.5 ${reportMetrics.netProfit >= 0 ? "text-emerald-800" : "text-rose-700"}`}>
              {formatCurrency(reportMetrics.netProfit)}
            </div>
            <span className="text-[10px] font-semibold text-emerald-800">
              Margin: {reportMetrics.marginPercent}%
            </span>
          </div>
        </div>

        {/* Section 1: Sales, Discounts & Payment Distribution */}
        <div className="space-y-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b pb-1 flex items-center gap-1.5">
            <Banknote className="h-4 w-4 text-emerald-600" /> 1. Sales & Revenue Breakdown
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-600">Total Gross Sales:</span>
                <span className="font-bold text-slate-900">{formatCurrency(reportMetrics.grossSales)}</span>
              </div>
              <div className="flex justify-between py-1 border-b text-rose-600">
                <span>Discounts Offered:</span>
                <span className="font-semibold">- {formatCurrency(reportMetrics.discounts)}</span>
              </div>
              <div className="flex justify-between py-1 border-b font-extrabold text-sm text-emerald-700 bg-emerald-50/50 px-2 rounded">
                <span>Net Sales Revenue:</span>
                <span>{formatCurrency(reportMetrics.netSales)}</span>
              </div>
              {reportMetrics.otherIncome > 0 && (
                <div className="flex justify-between py-1 border-b text-blue-700">
                  <span>Other Income (Tips/Corkage/Fees):</span>
                  <span className="font-semibold">+{formatCurrency(reportMetrics.otherIncome)}</span>
                </div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-600">Cash Sales Collected:</span>
                <span className="font-bold text-emerald-700">{formatCurrency(reportMetrics.cashSales)}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-600">Credit / Debt Sales:</span>
                <span className="font-bold text-amber-700">{formatCurrency(reportMetrics.creditSales)}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-600">Outstanding Unpaid Debts:</span>
                <span className="font-bold text-rose-600">{formatCurrency(reportMetrics.outstandingDebts)}</span>
              </div>
            </div>
          </div>

          {/* Credit sales debtor list if any */}
          {reportMetrics.creditTransactions.length > 0 && (
            <div className="mt-2 p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1">
              <div className="font-bold text-amber-900">Outstanding Customer Credit from this Period:</div>
              <ul className="list-disc list-inside text-amber-800 space-y-0.5">
                {reportMetrics.creditTransactions.map((c) => (
                  <li key={c.id}>
                    <strong>{c.customerName || "Customer"}</strong>: {formatCurrency(c.amount)} ({c.description || "Unspecified bill"})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Section 2: Purchases (Food/Drink Raw Materials) vs Operating Expenses */}
        <div className="space-y-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b pb-1 flex items-center gap-1.5">
            <ShoppingCart className="h-4 w-4 text-blue-600" /> 2. Outflows: Purchases (COGS) vs Operating Expenses (OPEX)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Purchases */}
            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-800 text-xs uppercase text-blue-800">
                Purchases (Raw Materials & Stock) - Total: {formatCurrency(reportMetrics.totalPurchases)}
              </div>
              {Object.keys(reportMetrics.purchasesByCategory).length === 0 ? (
                <p className="text-muted-foreground italic">No stock purchases recorded</p>
              ) : (
                Object.entries(reportMetrics.purchasesByCategory).map(([cat, amt]) => (
                  <div key={cat} className="flex justify-between py-1 border-b">
                    <span className="text-slate-600 capitalize">{cat.replace("purchase-", "").replace("-", " ")}:</span>
                    <span className="font-medium text-slate-900">{formatCurrency(amt)}</span>
                  </div>
                ))
              )}
            </div>

            {/* Expenses */}
            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-800 text-xs uppercase text-rose-800">
                Operating Expenses (Overheads) - Total: {formatCurrency(reportMetrics.totalExpenses)}
              </div>
              {Object.keys(reportMetrics.expensesByCategory).length === 0 ? (
                <p className="text-muted-foreground italic">No operating expenses recorded</p>
              ) : (
                Object.entries(reportMetrics.expensesByCategory).map(([cat, amt]) => (
                  <div key={cat} className="flex justify-between py-1 border-b">
                    <span className="text-slate-600 capitalize">{cat.replace("opex-", "").replace("-", " ")}:</span>
                    <span className="font-medium text-slate-900">{formatCurrency(amt)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Stock Management Reconciliation */}
        {(filteredStockRecords.length > 0 || reportMetrics.closingStock > 0) && (
          <div className="space-y-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b pb-1 flex items-center gap-1.5">
              <Boxes className="h-4 w-4 text-indigo-600" /> 3. Food & Beverage Stock Ledger
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 text-center text-xs">
              <div>
                <span className="text-slate-500">Opening Stock</span>
                <div className="font-bold text-slate-900 mt-0.5">{formatCurrency(reportMetrics.openingStock)}</div>
              </div>
              <div>
                <span className="text-blue-700">+ Purchases</span>
                <div className="font-bold text-blue-700 mt-0.5">+{formatCurrency(reportMetrics.newStockPurchased)}</div>
              </div>
              <div>
                <span className="text-rose-700">- Stock Used</span>
                <div className="font-bold text-rose-700 mt-0.5">-{formatCurrency(reportMetrics.stockUsed)}</div>
              </div>
              <div>
                <span className="text-amber-700">- Damaged</span>
                <div className="font-bold text-amber-700 mt-0.5">
                  {reportMetrics.damagedStock > 0 ? `-${formatCurrency(reportMetrics.damagedStock)}` : "0 FCFA"}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-emerald-100 p-1.5 rounded font-extrabold text-emerald-900">
                <span>Closing Stock</span>
                <div className="text-sm">{formatCurrency(reportMetrics.closingStock)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Section 4: Daily Cash Reconciliation (Cash to Hand Over) */}
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-amber-950 flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-amber-700" /> 4. Cash Reconciliation: Cash to Hand Over
            </h2>
            <div className="text-xl sm:text-2xl font-black text-amber-900">
              {formatCurrency(reportMetrics.cashToHandOver)}
            </div>
          </div>
          <p className="text-xs text-amber-800">
            Formula: <strong>Cash Sales ({formatCurrency(reportMetrics.cashSales)})</strong>
            {reportMetrics.otherIncome > 0 && ` + Other Income (${formatCurrency(reportMetrics.otherIncome)})`}
            {" "}- <strong>Cash Purchases ({formatCurrency(reportMetrics.totalPurchases)})</strong>
            {" "}- <strong>Operating Expenses ({formatCurrency(reportMetrics.totalExpenses)})</strong>
            {" "} = <strong>{formatCurrency(reportMetrics.cashToHandOver)}</strong> to be handed over to management.
          </p>
        </div>

        {/* Signatures & Approval Blocks */}
        <div className="pt-8 border-t-2 border-slate-300 grid grid-cols-2 gap-8 text-xs">
          <div className="space-y-8">
            <div>
              <p className="font-bold text-slate-800">Shift Operator / Cashier:</p>
              <p className="text-muted-foreground">{currentUser?.name} ({currentUser?.email})</p>
            </div>
            <div className="border-b border-dashed border-slate-400 w-48"></div>
            <p className="text-[11px] text-muted-foreground">Signature & Date</p>
          </div>

          <div className="space-y-8 text-right flex flex-col items-end">
            <div>
              <p className="font-bold text-slate-800">Manager / Business Owner Approval:</p>
              <p className="text-muted-foreground">Accounts Received & Verified</p>
            </div>
            <div className="border-b border-dashed border-slate-400 w-48"></div>
            <p className="text-[11px] text-muted-foreground">Signature & Date</p>
          </div>
        </div>
      </div>
    </div>
  );
}
