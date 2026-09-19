"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import {
  Banknote,
  Percent,
  TrendingUp,
  ShoppingCart,
  Zap,
  Boxes,
  HandCoins,
  CreditCard,
  DollarSign,
  PackageCheck,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

export function IndustryKpiStrip({
  transactions = [],
  stockRecords = [],
  title = "Department & Operations Overview",
  subtitle = "Real-time metrics: Sales, Purchases, Overheads, Stock & Cash Reconciliation",
}) {
  const metrics = useMemo(() => {
    let grossSales = 0;
    let discounts = 0;
    let netSales = 0;
    let cashSales = 0;
    let creditSales = 0;
    let otherIncome = 0;
    let purchases = 0;
    let expenses = 0;
    let outstandingDebts = 0;

    transactions.forEach((tx) => {
      const amt = Number(tx.amount || 0);
      const gross = Number(tx.grossAmount || tx.amount || 0);
      const disc = Number(tx.discountAmount || 0);
      const net = Number(tx.netAmount || tx.amount || 0);

      if (tx.type === "SALE") {
        grossSales += gross;
        discounts += disc;
        netSales += net;
        if (tx.paymentMethod === "CREDIT") {
          creditSales += net;
          if (!tx.isDebtPaid) outstandingDebts += net;
        } else {
          cashSales += net;
        }
      } else if (tx.type === "INCOME") {
        grossSales += amt;
        netSales += amt;
        cashSales += amt;
        otherIncome += amt;
      } else if (tx.type === "PURCHASE" || (tx.category && tx.category.startsWith("purchase-"))) {
        purchases += amt;
      } else if (tx.type === "DISCOUNT") {
        discounts += amt;
      } else {
        expenses += amt;
      }
    });

    let stockUsed = 0;
    let closingStock = 0;

    stockRecords.forEach((s) => {
      stockUsed += Number(s.stockUsed || 0);
    });

    if (stockRecords.length > 0) {
      closingStock = Number(stockRecords[0].closingStock || 0);
    }

    // Cost of Goods: if stock used is recorded, use stock used; otherwise purchases
    const cogs = stockUsed > 0 ? stockUsed : purchases;
    const estimatedProfit = netSales - cogs - expenses;
    const profitMargin = netSales > 0 ? ((estimatedProfit / netSales) * 100).toFixed(1) : 0;

    // Cash Handover: cash entered drawer minus cash paid out for purchases & expenses
    const cashToHandOver = Math.max(0, cashSales + otherIncome - purchases - expenses);

    return {
      grossSales,
      discounts,
      netSales,
      purchases,
      expenses,
      stockUsed,
      cashToHandOver,
      outstandingDebts,
      estimatedProfit,
      profitMargin,
      closingStock,
    };
  }, [transactions, stockRecords]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" /> {title}
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* Row 1: Sales, Purchases, Operating Expenses */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Gross Sales */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase text-slate-600">Total Sales</CardTitle>
            <Banknote className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {formatCurrency(metrics.grossSales)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Gross customer orders</p>
          </CardContent>
        </Card>

        {/* Discounts */}
        <Card className="border-rose-100 shadow-sm bg-rose-50/40">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase text-rose-700">Total Discounts</CardTitle>
            <Percent className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl sm:text-2xl font-black text-rose-600">
              - {formatCurrency(metrics.discounts)}
            </div>
            <p className="text-[11px] text-rose-700/80 mt-0.5">Promos & customer cuts</p>
          </CardContent>
        </Card>

        {/* Net Sales */}
        <Card className="border-emerald-200 shadow-sm bg-emerald-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase text-emerald-800">Net Sales</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl sm:text-2xl font-black text-emerald-700">
              {formatCurrency(metrics.netSales)}
            </div>
            <p className="text-[11px] text-emerald-700/80 mt-0.5">Sales after discounts</p>
          </CardContent>
        </Card>

        {/* Purchases (Food & Drinks Stock) */}
        <Card className="border-blue-200 shadow-sm bg-blue-50/40">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase text-blue-800">Purchases (COGS)</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl sm:text-2xl font-black text-blue-700">
              {formatCurrency(metrics.purchases)}
            </div>
            <p className="text-[11px] text-blue-700/80 mt-0.5">Raw meat, rice, drinks, food</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: OPEX, Stock Used, Estimated Profit, Cash to Hand Over, Debts, Closing Stock */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Operating Expenses */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center justify-between">
              <span>Expenses (OPEX)</span>
              <Zap className="h-3.5 w-3.5 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base sm:text-lg font-bold text-slate-900">
              {formatCurrency(metrics.expenses)}
            </div>
            <p className="text-[10px] text-muted-foreground">Power, fuel, repairs</p>
          </CardContent>
        </Card>

        {/* Stock Used */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center justify-between">
              <span>Stock Used</span>
              <Boxes className="h-3.5 w-3.5 text-indigo-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base sm:text-lg font-bold text-indigo-700">
              {formatCurrency(metrics.stockUsed || metrics.purchases)}
            </div>
            <p className="text-[10px] text-muted-foreground">Cooked & consumed</p>
          </CardContent>
        </Card>

        {/* Estimated True Profit */}
        <Card className={`border-slate-200 shadow-sm ${metrics.estimatedProfit >= 0 ? "bg-emerald-50/30" : "bg-rose-50/30"}`}>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center justify-between">
              <span>Estimated Profit</span>
              <TrendingUp className={`h-3.5 w-3.5 ${metrics.estimatedProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`} />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className={`text-base sm:text-lg font-extrabold ${metrics.estimatedProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatCurrency(metrics.estimatedProfit)}
            </div>
            <p className="text-[10px] text-muted-foreground">Margin: {metrics.profitMargin}%</p>
          </CardContent>
        </Card>

        {/* Cash to Be Handed Over */}
        <Card className="border-amber-200 shadow-sm bg-amber-50/40">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase text-amber-900 flex items-center justify-between">
              <span>Cash Handover</span>
              <HandCoins className="h-3.5 w-3.5 text-amber-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base sm:text-lg font-extrabold text-amber-800">
              {formatCurrency(metrics.cashToHandOver)}
            </div>
            <p className="text-[10px] text-amber-800/80">Cash due in drawer</p>
          </CardContent>
        </Card>

        {/* Outstanding Debts */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center justify-between">
              <span>Credit / Debts</span>
              <CreditCard className="h-3.5 w-3.5 text-rose-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base sm:text-lg font-bold text-rose-600">
              {formatCurrency(metrics.outstandingDebts)}
            </div>
            <p className="text-[10px] text-muted-foreground">Uncollected sales</p>
          </CardContent>
        </Card>

        {/* Closing Stock */}
        <Card className="border-indigo-100 shadow-sm bg-indigo-50/30">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase text-indigo-900 flex items-center justify-between">
              <span>Closing Stock</span>
              <PackageCheck className="h-3.5 w-3.5 text-indigo-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base sm:text-lg font-extrabold text-indigo-800">
              {formatCurrency(metrics.closingStock)}
            </div>
            <p className="text-[10px] text-indigo-800/80">Food/drinks remaining</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
