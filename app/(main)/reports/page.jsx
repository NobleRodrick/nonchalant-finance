"use client";

import { useState, useEffect, useMemo } from "react";
import { getDashboardData } from "@/actions/dashboard";
import { getDepartments } from "@/actions/organization";
import { getSessionUser } from "@/actions/auth";
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

  // Filter states
  const [period, setPeriod] = useState("today");
  const [selectedDeptId, setSelectedDeptId] = useState("all");
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    async function loadData() {
      try {
        const [user, depts, txns] = await Promise.all([
          getSessionUser(),
          getDepartments(),
          getDashboardData("all"),
        ]);

        setCurrentUser(user);
        setDepartments(depts);
        setAllTransactions(txns || []);

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
        return { start: startOfDay(now), end: endOfDay(now), label: `Today (${format(now, "PPP")})` };
      case "yesterday": {
        const yest = subDays(now, 1);
        return { start: startOfDay(yest), end: endOfDay(yest), label: `Yesterday (${format(yest, "PPP")})` };
      }
      case "this-week":
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
          label: "This Week",
        };
      case "last-7":
        return { start: startOfDay(subDays(now, 7)), end: endOfDay(now), label: "Last 7 Days" };
      case "this-month":
        return { start: startOfMonth(now), end: endOfMonth(now), label: `This Month (${format(now, "MMMM yyyy")})` };
      case "custom":
      default:
        return {
          start: customStart ? new Date(customStart + "T00:00:00") : startOfDay(now),
          end: customEnd ? new Date(customEnd + "T23:59:59") : endOfDay(now),
          label: `${customStart} to ${customEnd}`,
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

  // Financial calculations
  const incomes = filteredTransactions.filter((t) => t.type === "INCOME");
  const expenses = filteredTransactions.filter((t) => t.type === "EXPENSE");

  const totalRevenue = incomes.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

  // Breakdown by category
  const revenueByCategory = incomes.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + Number(t.amount || 0);
    return acc;
  }, {});

  const expensesByCategory = expenses.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + Number(t.amount || 0);
    return acc;
  }, {});

  // Print function
  const handlePrint = () => {
    window.print();
  };

  // Copy summary text for easy sharing on WhatsApp / Email
  const handleCopySummary = () => {
    const deptTitle =
      selectedDeptId === "all"
        ? "Consolidated (All Departments)"
        : departments.find((d) => d.id === selectedDeptId)?.name || "Department";

    const text = `📊 *${currentUser?.organizationName || "Company"} - Financial Report*\n🏢 *Sector:* ${deptTitle}\n📅 *Period:* ${dateInterval.label}\n\n💰 *Total Revenue:* ${formatCurrency(totalRevenue)}\n📉 *Total Expenses:* ${formatCurrency(totalExpenses)}\n✨ *Net Profit:* ${formatCurrency(netProfit)} (${margin}% margin)\n📝 *Total Transactions:* ${filteredTransactions.length}\n\nGenerated on ${new Date().toLocaleString()} by ${currentUser?.name || "Staff"}`;

    navigator.clipboard.writeText(text);
    toast.success("Report summary copied to clipboard! Ready to share.");
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
      {/* Non-printed Controls Card */}
      <Card className="shadow-sm border-slate-200 print:hidden">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6 text-blue-600" />
                Financial Closing & Operational Reports
              </CardTitle>
              <CardDescription>
                Generate, download, and share closing statements for today, this week, or any custom interval
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopySummary}>
                <Copy className="h-4 w-4 mr-1.5" /> Copy Summary
              </Button>
              <Button size="sm" onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Printer className="h-4 w-4 mr-1.5" /> Print Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap items-center gap-3">
            {/* Department Scope Selector (Only for Admin or multi-department staff) */}
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
              <span className="text-xs font-semibold text-slate-600">Period:</span>
              <select
                className="h-9 rounded-md border border-input bg-white px-3 py-1 text-xs font-medium shadow-sm"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="today">Today (Daily Closing)</option>
                <option value="yesterday">Yesterday</option>
                <option value="this-week">This Week</option>
                <option value="last-7">Last 7 Days</option>
                <option value="this-month">This Month</option>
                <option value="custom">Custom Date Range</option>
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

      {/* Printable Report Document */}
      <div className="bg-white border rounded-2xl p-6 sm:p-10 shadow-sm print:border-none print:shadow-none print:p-0">
        {/* Document Header */}
        <div className="flex justify-between items-start border-b pb-6 mb-6">
          <div>
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Building2 className="h-5 w-5" />
              <span className="font-bold text-lg">{currentUser?.organizationName || "Company Organization"}</span>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Financial Closing Statement
            </h2>
            <p className="text-sm font-medium text-slate-600 mt-1">
              Sector: <span className="text-blue-700 font-semibold">{activeDepartmentName}</span>
            </p>
          </div>

          <div className="text-right text-xs space-y-1">
            <div className="font-semibold text-slate-800">
              Period: <span className="font-normal">{dateInterval.label}</span>
            </div>
            <div className="text-muted-foreground">
              Generated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
            </div>
            <div className="text-muted-foreground">
              Sign-off Staff: <span className="font-medium text-slate-800">{currentUser?.name || "Accountant"}</span> (
              {currentUser?.role})
            </div>
          </div>
        </div>

        {/* High-Level Financial Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-xl border bg-slate-50">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Gross Revenue</span>
            <div className="text-2xl font-extrabold text-emerald-600 mt-1">{formatCurrency(totalRevenue)}</div>
            <span className="text-[11px] text-muted-foreground">{incomes.length} sales recorded</span>
          </div>

          <div className="p-4 rounded-xl border bg-slate-50">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Operating Expenses</span>
            <div className="text-2xl font-extrabold text-rose-600 mt-1">{formatCurrency(totalExpenses)}</div>
            <span className="text-[11px] text-muted-foreground">{expenses.length} expenses logged</span>
          </div>

          <div className="p-4 rounded-xl border bg-slate-50">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Net Operating Profit</span>
            <div className={`text-2xl font-extrabold mt-1 ${netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatCurrency(netProfit)}
            </div>
            <span className="text-[11px] text-muted-foreground">Margin: {margin}%</span>
          </div>

          <div className="p-4 rounded-xl border bg-slate-50">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Total Activity</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">{filteredTransactions.length}</div>
            <span className="text-[11px] text-muted-foreground">Total verified entries</span>
          </div>
        </div>

        {/* Category Breakdown (2 columns) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Revenue Breakdown */}
          <div className="border rounded-xl p-4 bg-slate-50/50">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-600" /> Revenue by Category
            </h3>
            {Object.keys(revenueByCategory).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No sales recorded for this period.</p>
            ) : (
              <div className="divide-y text-xs">
                {Object.entries(revenueByCategory).map(([cat, amt]) => (
                  <div key={cat} className="py-2 flex justify-between">
                    <span className="capitalize text-slate-700">{cat}</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(amt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expense Breakdown */}
          <div className="border rounded-xl p-4 bg-slate-50/50">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-rose-600" /> Expenses by Category
            </h3>
            {Object.keys(expensesByCategory).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No expenses logged for this period.</p>
            ) : (
              <div className="divide-y text-xs">
                {Object.entries(expensesByCategory).map(([cat, amt]) => (
                  <div key={cat} className="py-2 flex justify-between">
                    <span className="capitalize text-slate-700">{cat}</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(amt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Itemized Transactions Table */}
        <div className="mb-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-3">
            Itemized Audit Ledger ({filteredTransactions.length} items)
          </h3>
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b">
                <tr>
                  <th className="py-2.5 px-3">Date / Time</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Sector</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Logged By</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-800">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted-foreground italic">
                      No transactions found for this interval.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 font-medium">
                        {tx.description || tx.category}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100">
                          {tx.department?.name || "General"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 capitalize text-slate-600">{tx.category}</td>
                      <td className="py-2.5 px-3 text-slate-600">{tx.user?.name || "Staff"}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                          tx.type === "INCOME" ? "text-emerald-600" : "text-slate-900"
                        }`}
                      >
                        {tx.type === "INCOME" ? "+" : "-"}
                        {formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Verification & Signature Block for Boss & Accountant */}
        <div className="grid grid-cols-2 gap-12 pt-8 border-t text-xs">
          <div className="space-y-10">
            <p className="font-semibold text-slate-700">Prepared & Certified by Employee / Accountant:</p>
            <div className="border-b border-dashed border-slate-400 w-3/4" />
            <p className="text-[11px] text-muted-foreground">Signature & Date</p>
          </div>

          <div className="space-y-10 text-right">
            <p className="font-semibold text-slate-700">Reviewed & Approved by Boss (Admin):</p>
            <div className="border-b border-dashed border-slate-400 w-3/4 ml-auto" />
            <p className="text-[11px] text-muted-foreground">Executive Stamp & Date</p>
          </div>
        </div>
      </div>
    </div>
  );
}
