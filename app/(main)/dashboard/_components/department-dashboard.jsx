"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { FinancialInsights } from "./financial-insights";
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  PenBox,
  FileText,
  Building2,
  Calendar,
  Clock,
  Sparkles,
} from "lucide-react";

export function DepartmentDashboard({
  user,
  department,
  organization,
  transactions = [],
  accounts = [],
}) {
  const deptName = department?.name || "Assigned Department";

  // Calculate metrics
  const totalRevenue = transactions
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalExpenses = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const netProfit = totalRevenue - totalExpenses;

  // Today's metrics
  const today = new Date().toDateString();
  const todayTransactions = transactions.filter(
    (t) => new Date(t.date).toDateString() === today
  );

  const todayRevenue = todayTransactions
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const todayExpenses = todayTransactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  return (
    <div className="space-y-8">
      {/* Department Banner */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 rounded-2xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-blue-200" />
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">
              {organization?.name || "Business Organization"}
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{deptName} Portal</h1>
          <p className="text-blue-100 text-sm mt-1">
            Role: <span className="font-semibold capitalize">{user.role.toLowerCase()}</span> • Logged in as {user.name}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/transaction/create">
            <Button className="bg-white text-blue-800 hover:bg-blue-50 font-semibold shadow-sm">
              <PenBox className="h-4 w-4 mr-1.5" /> Record Transaction
            </Button>
          </Link>
          <Link href="/reports">
            <Button variant="secondary" className="bg-blue-900/60 hover:bg-blue-900 text-white border border-blue-400/30">
              <FileText className="h-4 w-4 mr-1.5" /> Generate Closing Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today&apos;s Sales</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(todayRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{todayTransactions.length} transactions today</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today&apos;s Expenses</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(todayExpenses)}</div>
            <p className="text-xs text-muted-foreground mt-1">Daily purchases & supplies</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cumulative Revenue</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total recorded revenue</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Department Net</CardTitle>
            <TrendingUp className={`h-4 w-4 ${netProfit >= 0 ? "text-emerald-500" : "text-rose-500"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatCurrency(netProfit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Revenue minus expenses</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Statement & Reports Engine */}
      <FinancialInsights
        accounts={accounts}
        transactions={transactions}
      />

      {/* Recent Department Activity */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">{deptName} Activity Log</CardTitle>
            <CardDescription>Recent sales and expenditures logged in this department</CardDescription>
          </div>
          <Link href="/transaction/create">
            <Button size="sm" variant="outline" className="text-xs">
              <PenBox className="h-3.5 w-3.5 mr-1" /> Add Entry
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              No transactions recorded yet for {deptName}. Click &quot;Record Transaction&quot; to add your first entry.
            </p>
          ) : (
            <div className="divide-y text-sm">
              {transactions.slice(0, 10).map((t) => (
                <div key={t.id} className="py-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-slate-800">
                      {t.description || t.category}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.date).toLocaleDateString()} • {t.category}
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
