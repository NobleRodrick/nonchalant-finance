"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { FinancialInsights } from "./financial-insights";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Building2,
  Users,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  FileText,
  Filter,
} from "lucide-react";

export function ExecutiveDashboard({
  user,
  organization,
  departments = [],
  transactions = [],
  accounts = [],
  kpis,
}) {
  const [selectedDeptId, setSelectedDeptId] = useState("all");

  // Filter transactions based on selected department tab
  const displayedTransactions =
    selectedDeptId === "all"
      ? transactions
      : transactions.filter((t) => t.departmentId === selectedDeptId);

  // Compute metrics for the active filter
  const totalRevenue = displayedTransactions
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalExpenses = displayedTransactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const netProfit = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-5 w-5 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">
              Executive Command Center
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{organization?.name || "Business Organization"}</h1>
          <p className="text-slate-300 text-sm mt-1">
            Consolidated oversight across {departments.length} operational departments
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/organization/employees">
            <Button variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border-white/20">
              <Users className="h-4 w-4 mr-1.5" /> Staff Directory
            </Button>
          </Link>
          <Link href="/organization/departments">
            <Button variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border-white/20">
              <Layers className="h-4 w-4 mr-1.5" /> Departments
            </Button>
          </Link>
          <Link href="/reports">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white font-medium">
              <FileText className="h-4 w-4 mr-1.5" /> Closing Reports
            </Button>
          </Link>
        </div>
      </div>

      {/* Department Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1 mr-1">
          <Filter className="h-3.5 w-3.5" /> Scope:
        </span>
        <button
          onClick={() => setSelectedDeptId("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            selectedDeptId === "all"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white border text-slate-700 hover:bg-slate-50"
          }`}
        >
          All Departments (Consolidated)
        </button>
        {departments.map((dept) => (
          <button
            key={dept.id}
            onClick={() => setSelectedDeptId(dept.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedDeptId === dept.id
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white border text-slate-700 hover:bg-slate-50"
            }`}
          >
            {dept.name}
          </button>
        ))}
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Recorded gross sales & income</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Operating Expenses</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalExpenses)}</div>
            <p className="text-xs text-muted-foreground mt-1">Purchases, utilities, & bills</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Operating Profit</CardTitle>
            <TrendingUp className={`h-4 w-4 ${netProfit >= 0 ? "text-emerald-500" : "text-rose-500"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatCurrency(netProfit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Net margin: <span className="font-semibold text-slate-800">{margin}%</span>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Volume & Activity</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{displayedTransactions.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Total recorded transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Cross-Department Breakdown (Shown when viewing Consolidated) */}
      {selectedDeptId === "all" && kpis?.departments && (
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Department Performance Matrix</CardTitle>
            <CardDescription>
              Real-time revenue, expense, and net margin breakdown across your sectors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {kpis.departments.map((dept) => (
                <div
                  key={dept.id}
                  className="p-4 rounded-xl border bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer"
                  onClick={() => setSelectedDeptId(dept.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900 text-sm">{dept.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {dept.transactionCount} txns
                    </Badge>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revenue:</span>
                      <span className="font-medium text-emerald-600">{formatCurrency(dept.revenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expenses:</span>
                      <span className="font-medium text-rose-600">{formatCurrency(dept.expenses)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t font-semibold">
                      <span>Net:</span>
                      <span className={dept.net >= 0 ? "text-emerald-700" : "text-rose-700"}>
                        {formatCurrency(dept.net)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comprehensive Financial Statements & Reports Engine */}
      <FinancialInsights
        accounts={accounts}
        transactions={displayedTransactions}
      />

      {/* Recent Transactions List */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Recent Operations Ledger</CardTitle>
            <CardDescription>Latest entries logged across your departments</CardDescription>
          </div>
          <Link href="/transaction/create">
            <Button size="sm" variant="outline" className="text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" /> New Entry
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {displayedTransactions.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              No transactions recorded yet for this selection.
            </p>
          ) : (
            <div className="divide-y text-sm">
              {displayedTransactions.slice(0, 8).map((t) => (
                <div key={t.id} className="py-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {t.description || t.category}
                      </span>
                      {t.department && (
                        <Badge variant="secondary" className="text-[10px] py-0">
                          {t.department.name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.date).toLocaleDateString()} • Logged by {t.user?.name || "Staff"}
                    </p>
                  </div>

                  <div
                    className={`font-bold ${
                      t.type === "INCOME" ? "text-emerald-600" : "text-slate-900"
                    }`}
                  >
                    {t.type === "INCOME" ? "+" : "-"}
                    {formatCurrency(t.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
