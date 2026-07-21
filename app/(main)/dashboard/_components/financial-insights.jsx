"use client";

import { useState, useMemo } from "react";
import { format, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";
import { 
  Award, 
  FileText, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  X,
  Info
} from "lucide-react";

export function FinancialInsights({ accounts, transactions }) {
  // States
  const [period, setPeriod] = useState("this-month");
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activeModal, setActiveModal] = useState(null); // 'income' | 'balance' | 'cashflow' | null

  // 1. Credit Score Calculation Algorithm (FICO Range: 300 - 850)
  const creditScoreData = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return {
        score: 500,
        tier: "Fair",
        color: "text-amber-500",
        strokeColor: "#f59e0b",
        factors: {
          paymentReliability: { rating: "No History", score: 0 },
          savingsRate: { rating: "No History", score: 0 },
          balanceBuffer: { rating: "Needs Accounts", score: 0 },
          spendingHabits: { rating: "No History", score: 0 },
          historyAge: { rating: "New", score: 10 }
        }
      };
    }

    // A. Payment History / Reliability (35% weight - Max 192.5 pts)
    const totalTx = transactions.length;
    const completedTx = transactions.filter(t => t.status === "COMPLETED").length;
    const reliabilityRate = totalTx > 0 ? completedTx / totalTx : 1;
    const paymentScore = reliabilityRate * 192.5;

    // B. Savings Rate (30% weight - Max 165 pts)
    const totalIncome = transactions
      .filter(t => t.type === "INCOME")
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const totalExpense = transactions
      .filter(t => t.type === "EXPENSE")
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    
    let savingsRate = 0;
    let savingsScore = 0;
    if (totalIncome > 0) {
      savingsRate = (totalIncome - totalExpense) / totalIncome;
      if (savingsRate >= 0.20) savingsScore = 165;
      else if (savingsRate >= 0.10) savingsScore = 120;
      else if (savingsRate >= 0) savingsScore = 80;
      else savingsScore = 0; // negative savings
    } else if (totalExpense > 0) {
      savingsScore = 0; // only expenses, no income
    } else {
      savingsScore = 80; // no transactions in general, neutral baseline
    }

    // C. Balance Buffer (15% weight - Max 82.5 pts)
    const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
    let balanceScore = 30;
    if (totalBalance > 10000) balanceScore = 82.5;
    else if (totalBalance > 5000) balanceScore = 65;
    else if (totalBalance > 1000) balanceScore = 50;
    else if (totalBalance >= 0) balanceScore = 30;
    else balanceScore = 0; // negative balance

    // D. Spending Habits / Credit Utilization (10% weight - Max 55 pts)
    let spendingScore = 20;
    if (totalIncome > 0) {
      const expenseRatio = totalExpense / totalIncome;
      if (expenseRatio < 0.5) spendingScore = 55;
      else if (expenseRatio <= 0.8) spendingScore = 40;
      else if (expenseRatio <= 1.0) spendingScore = 20;
      else spendingScore = 0; // spending > income
    } else if (totalExpense > 0) {
      spendingScore = 0;
    } else {
      spendingScore = 35;
    }

    // E. Credit History Age (10% weight - Max 55 pts)
    const sortedTxs = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstTxDate = sortedTxs[0] ? new Date(sortedTxs[0].date) : new Date();
    const diffMonths = (new Date() - firstTxDate) / (1000 * 60 * 60 * 24 * 30.4);
    
    let ageScore = 10;
    if (diffMonths > 6) ageScore = 55;
    else if (diffMonths >= 3) ageScore = 40;
    else if (diffMonths >= 1) ageScore = 25;
    else ageScore = 10;

    // Calculate Final Score
    const finalScore = Math.min(850, Math.max(300, Math.round(300 + paymentScore + savingsScore + balanceScore + spendingScore + ageScore)));

    // Categorize
    let tier = "Poor";
    let color = "text-red-500";
    let strokeColor = "#ef4444";
    if (finalScore >= 800) {
      tier = "Exceptional";
      color = "text-teal-500";
      strokeColor = "#14b8a6";
    } else if (finalScore >= 740) {
      tier = "Very Good";
      color = "text-green-500";
      strokeColor = "#22c55e";
    } else if (finalScore >= 670) {
      tier = "Good";
      color = "text-lime-500";
      strokeColor = "#84cc16";
    } else if (finalScore >= 580) {
      tier = "Fair";
      color = "text-amber-500";
      strokeColor = "#f59e0b";
    }

    // Sub-factors details
    const paymentRating = reliabilityRate >= 0.98 ? "Excellent" : reliabilityRate >= 0.90 ? "Good" : reliabilityRate >= 0.80 ? "Fair" : "Poor";
    const savingsRating = savingsRate >= 0.20 ? "Excellent" : savingsRate >= 0.10 ? "Good" : savingsRate >= 0 ? "Fair" : "Poor";
    const balanceRating = totalBalance > 5000 ? "Excellent" : totalBalance > 1000 ? "Good" : totalBalance >= 0 ? "Fair" : "Poor";
    const spendingRating = totalIncome > 0 && (totalExpense / totalIncome < 0.5) ? "Excellent" : totalIncome > 0 && (totalExpense / totalIncome <= 0.8) ? "Good" : "Fair";
    const ageRating = diffMonths > 6 ? "Excellent" : diffMonths >= 3 ? "Good" : "Fair";

    return {
      score: finalScore,
      tier,
      color,
      strokeColor,
      factors: {
        paymentReliability: { rating: paymentRating, score: Math.round(paymentScore) },
        savingsRate: { rating: savingsRating, score: Math.round(savingsScore) },
        balanceBuffer: { rating: balanceRating, score: Math.round(balanceScore) },
        spendingHabits: { rating: spendingRating, score: Math.round(spendingScore) },
        historyAge: { rating: ageRating, score: Math.round(ageScore) }
      }
    };
  }, [transactions, accounts]);

  // 2. Financial Date Range Resolver
  const selectedDateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "this-month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last-30":
        return { start: subDays(now, 30), end: now };
      case "this-quarter":
        return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "this-year":
        return { start: startOfYear(now), end: endOfYear(now) };
      case "custom":
      default:
        return { 
          start: customStart ? new Date(customStart + "T00:00:00") : startOfMonth(now), 
          end: customEnd ? new Date(customEnd + "T23:59:59") : endOfMonth(now) 
        };
    }
  }, [period, customStart, customEnd]);

  // 3. Transactions filtered for statement period
  const statementTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => {
      const txDate = new Date(t.date);
      return isWithinInterval(txDate, {
        start: selectedDateRange.start,
        end: selectedDateRange.end
      });
    });
  }, [transactions, selectedDateRange]);

  const hasTransactionsForPeriod = statementTransactions.length > 0;

  // 4. Financial Calculations for Statement Preview
  const financialData = useMemo(() => {
    // Basic income & expenses
    const incomes = statementTransactions.filter(t => t.type === "INCOME");
    const expenses = statementTransactions.filter(t => t.type === "EXPENSE");

    // Grouping by category
    const incomeByCategory = incomes.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + parseFloat(t.amount || 0);
      return acc;
    }, {});

    const expenseByCategory = expenses.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + parseFloat(t.amount || 0);
      return acc;
    }, {});

    const totalIncome = incomes.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const totalExpense = expenses.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const netIncome = totalIncome - totalExpense;

    // Accounts / Balance Sheet snapshot (Assets)
    const assetAccounts = accounts.map(a => ({
      name: a.name,
      type: a.type,
      balance: parseFloat(a.balance || 0)
    }));
    const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0);
    const totalLiabilities = 0; // standard cash basis assumption
    const netWorth = totalAssets - totalLiabilities;

    // Cash Flow Categorizations
    const investingCategories = ["investment", "investments", "stock", "stocks", "crypto", "shares", "savings", "property"];
    const financingCategories = ["loan", "loans", "debt", "mortgage", "interest", "credit card", "credit-card"];

    let opInflow = 0;
    let opOutflow = 0;
    let invInflow = 0;
    let invOutflow = 0;
    let finInflow = 0;
    let finOutflow = 0;

    statementTransactions.forEach(t => {
      const catLower = t.category.toLowerCase();
      const amount = parseFloat(t.amount || 0);

      const isInv = investingCategories.some(keyword => catLower.includes(keyword));
      const isFin = financingCategories.some(keyword => catLower.includes(keyword));

      if (t.type === "INCOME") {
        if (isInv) invInflow += amount;
        else if (isFin) finInflow += amount;
        else opInflow += amount;
      } else {
        if (isInv) invOutflow += amount;
        else if (isFin) finOutflow += amount;
        else opOutflow += amount;
      }
    });

    const netOpCash = opInflow - opOutflow;
    const netInvCash = invInflow - invOutflow;
    const netFinCash = finInflow - finOutflow;
    const netChangeInCash = netOpCash + netInvCash + netFinCash;

    // Beginning balance is current balance minus the net change for this period
    const endingCash = totalAssets;
    const beginningCash = endingCash - netChangeInCash;

    return {
      incomeByCategory,
      expenseByCategory,
      totalIncome,
      totalExpense,
      netIncome,
      assetAccounts,
      totalAssets,
      totalLiabilities,
      netWorth,
      cashFlow: {
        opInflow,
        opOutflow,
        netOpCash,
        invInflow,
        invOutflow,
        netInvCash,
        finInflow,
        finOutflow,
        netFinCash,
        beginningCash,
        netChangeInCash,
        endingCash
      }
    };
  }, [statementTransactions, accounts]);

  // 5. PDF Generator Function
  const handleDownloadPDF = (title, reportHtml) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to download/print statements.");
      return;
    }

    const startFormatted = format(selectedDateRange.start, "PP");
    const endFormatted = format(selectedDateRange.end, "PP");

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              padding: 40px;
              color: #0f172a;
              line-height: 1.6;
              background: #fff;
            }
            .header-container {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0284c7;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo-section h1 {
              margin: 0;
              font-size: 26px;
              font-weight: 700;
              color: #0f172a;
              letter-spacing: -0.025em;
            }
            .logo-section h1 span {
              color: #0284c7;
            }
            .logo-section p {
              margin: 2px 0 0 0;
              font-size: 13px;
              color: #64748b;
            }
            .report-title-section {
              text-align: right;
            }
            .report-title-section h2 {
              margin: 0;
              font-size: 20px;
              font-weight: 600;
              color: #0284c7;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .report-title-section p {
              margin: 4px 0 0 0;
              font-size: 13px;
              color: #64748b;
            }
            .meta-info {
              display: flex;
              justify-content: space-between;
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 12px 20px;
              font-size: 13px;
              color: #334155;
              margin-bottom: 30px;
            }
            .meta-info span strong {
              color: #0f172a;
            }
            .table-title {
              font-size: 15px;
              font-weight: 700;
              color: #0f172a;
              margin-top: 25px;
              margin-bottom: 10px;
              text-transform: uppercase;
              letter-spacing: 0.025em;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 5px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 25px;
            }
            th, td {
              padding: 10px 14px;
              font-size: 14px;
              border-bottom: 1px solid #f1f5f9;
            }
            th {
              background-color: #f8fafc;
              font-weight: 600;
              color: #475569;
              text-align: left;
            }
            .num {
              text-align: right;
            }
            .indent {
              padding-left: 28px;
            }
            .bold {
              font-weight: 600;
              color: #0f172a;
            }
            .total-row {
              font-weight: 700;
              background-color: #f8fafc;
              border-top: 1px solid #cbd5e1;
              border-bottom: 2px solid #0f172a;
            }
            .grand-total-row {
              font-weight: 700;
              background-color: #f0f9ff;
              border-top: 2px solid #0284c7;
              border-bottom: 4px double #0284c7;
              font-size: 15px;
            }
            .grand-total-row td {
              color: #0369a1;
            }
            .footer {
              margin-top: 60px;
              text-align: center;
              font-size: 11px;
              color: #94a3b8;
              border-top: 1px solid #e2e8f0;
              padding-top: 15px;
            }
            @media print {
              body {
                padding: 20px;
              }
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="logo-section">
              <h1>Springer<span>Finance</span></h1>
              <p>Advanced Wealth Management & Analysis</p>
            </div>
            <div class="report-title-section">
              <h2>${title}</h2>
              <p>Reporting Period Statement</p>
            </div>
          </div>
          <div class="meta-info">
            <span><strong>Date Generated:</strong> ${format(new Date(), "PP")}</span>
            <span><strong>Reporting Window:</strong> ${startFormatted} &mdash; ${endFormatted}</span>
          </div>
          <div class="report-content">
            ${reportHtml}
          </div>
          <div class="footer">
            Confidential Financial Statement. Generated automatically by Springer Finance on behalf of the account owner.
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // SVGs for credit score display
  const scorePercent = (creditScoreData.score - 300) / 550; // map 300-850 to 0-1
  const dashArray = 339.29; // circumference for r=54
  const dashOffset = dashArray - (scorePercent * dashArray);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* 1. CREDIT SCORE CARD */}
      <Card className="shadow-md border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl flex items-center gap-2">
            <Award className="h-5 w-5 text-indigo-500" />
            Dynamic Credit Health Score
          </CardTitle>
          <CardDescription>
            Transaction-based credit safety rating calculated in real-time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
            {/* Circular Gauge */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                {/* Background Ring */}
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="transparent"
                  stroke="hsl(var(--muted))"
                  strokeWidth="8"
                />
                {/* Filled Gauge */}
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="transparent"
                  stroke={creditScoreData.strokeColor}
                  strokeWidth="8"
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              {/* Inner Label */}
              <div className="absolute text-center">
                <span className="text-3xl font-extrabold tracking-tight">
                  {creditScoreData.score}
                </span>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-0.5">
                  FICO Equivalent
                </p>
              </div>
            </div>

            {/* Rating Details */}
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <div>
                <span className={`text-2xl font-bold ${creditScoreData.color}`}>
                  {creditScoreData.tier}
                </span>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Your score ranges from 300 to 850. Higher scores indicate strong liquidity and consistent payment reliability.
                </p>
              </div>
            </div>
          </div>

          {/* Factor Breakdown */}
          <div className="mt-4 border-t pt-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" /> Scoring Factor breakdown
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center justify-between border-b pb-1">
                <span className="text-muted-foreground">Payment History:</span>
                <span className="font-medium flex items-center gap-1">
                  {creditScoreData.factors.paymentReliability.rating}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-1">
                <span className="text-muted-foreground">Monthly Surplus:</span>
                <span className="font-medium">
                  {creditScoreData.factors.savingsRate.rating}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-1">
                <span className="text-muted-foreground">Liquidity Buffer:</span>
                <span className="font-medium">
                  {creditScoreData.factors.balanceBuffer.rating}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-1">
                <span className="text-muted-foreground">Spending habits:</span>
                <span className="font-medium">
                  {creditScoreData.factors.spendingHabits.rating}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. FINANCIAL STATEMENTS BUILDER */}
      <Card className="shadow-md border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-500" />
            Financial Statements Generator
          </CardTitle>
          <CardDescription>
            Compile Balance Sheet, Income Statement, or Cash Flow Report
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Period Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Reporting Window</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-month">This Month</SelectItem>
                  <SelectItem value="last-30">Last 30 Days</SelectItem>
                  <SelectItem value="this-quarter">This Quarter</SelectItem>
                  <SelectItem value="this-year">This Year</SelectItem>
                  <SelectItem value="custom">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Empty space/dates */}
            {period === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Start Date</label>
                  <Input 
                    type="date" 
                    value={customStart} 
                    onChange={(e) => setCustomStart(e.target.value)} 
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">End Date</label>
                  <Input 
                    type="date" 
                    value={customEnd} 
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-end text-xs text-muted-foreground pb-2">
                <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border px-3 py-2 rounded-md w-full justify-center">
                  <Calendar className="h-4 w-4 text-indigo-500" />
                  {format(selectedDateRange.start, "PP")} &mdash; {format(selectedDateRange.end, "PP")}
                </span>
              </div>
            )}
          </div>

          {/* Verification check and action buttons */}
          {!hasTransactionsForPeriod ? (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-md p-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Statement compilation disabled</p>
                <p className="mt-0.5 opacity-90">There are no transaction records within this date range. You need at least one transaction to construct financial statements.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-md p-3 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Statements are ready</p>
                <p className="mt-0.5 opacity-90">Found {statementTransactions.length} records in selected period. Click below to preview and download statements.</p>
              </div>
            </div>
          )}

          {/* Statement Action buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasTransactionsForPeriod}
              onClick={() => setActiveModal("income")}
              className="text-xs flex items-center justify-center gap-1"
            >
              <FileText className="h-3.5 w-3.5" />
              Income Stmt
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasTransactionsForPeriod}
              onClick={() => setActiveModal("balance")}
              className="text-xs flex items-center justify-center gap-1"
            >
              <FileText className="h-3.5 w-3.5" />
              Balance Sheet
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasTransactionsForPeriod}
              onClick={() => setActiveModal("cashflow")}
              className="text-xs flex items-center justify-center gap-1"
            >
              <FileText className="h-3.5 w-3.5" />
              Cash Flow
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3. PREVIEW & PRINT MODALS */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 rounded-lg border max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold">
                  {activeModal === "income" && "Income Statement Preview"}
                  {activeModal === "balance" && "Balance Sheet Preview"}
                  {activeModal === "cashflow" && "Cash Flow Statement Preview"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Reporting range: {format(selectedDateRange.start, "PP")} &mdash; {format(selectedDateRange.end, "PP")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActiveModal(null)}
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Content / Document Preview */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-900/50">
              <div id="financial-report-doc" className="bg-white text-slate-900 border p-8 shadow-sm rounded-md max-w-2xl mx-auto font-sans leading-relaxed">
                
                {/* 3.A INCOME STATEMENT PREVIEW */}
                {activeModal === "income" && (
                  <div>
                    <h3 className="text-center text-lg font-bold text-sky-700 uppercase tracking-wide border-b pb-2 mb-4">
                      Income Statement
                    </h3>
                    <div className="mb-6 flex justify-between text-xs text-slate-500 border-b pb-2">
                      <span><strong>Issuer:</strong> Springer Finance</span>
                      <span><strong>For the Period:</strong> {format(selectedDateRange.start, "PP")} to {format(selectedDateRange.end, "PP")}</span>
                    </div>

                    <div className="space-y-4">
                      {/* Revenue */}
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 border-b pb-1">Revenue (Inflows)</h4>
                        <table className="w-full text-sm mt-2">
                          <tbody>
                            {Object.entries(financialData.incomeByCategory).map(([cat, val]) => (
                              <tr key={cat}>
                                <td className="py-1 pl-4 text-slate-700">{cat}</td>
                                <td className="py-1 text-right text-slate-700">{formatCurrency(val)}</td>
                              </tr>
                            ))}
                            <tr className="font-semibold bg-slate-50 border-t">
                              <td className="py-1.5 pl-2 text-slate-800">Total Revenue</td>
                              <td className="py-1.5 text-right text-slate-800">{formatCurrency(financialData.totalIncome)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Operating Expenses */}
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 border-b pb-1">Operating Expenses (Outflows)</h4>
                        <table className="w-full text-sm mt-2">
                          <tbody>
                            {Object.entries(financialData.expenseByCategory).map(([cat, val]) => (
                              <tr key={cat}>
                                <td className="py-1 pl-4 text-slate-700">{cat}</td>
                                <td className="py-1 text-right text-slate-700">{formatCurrency(val)}</td>
                              </tr>
                            ))}
                            <tr className="font-semibold bg-slate-50 border-t">
                              <td className="py-1.5 pl-2 text-slate-800">Total Expenses</td>
                              <td className="py-1.5 text-right text-slate-800">{formatCurrency(financialData.totalExpense)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Net Income */}
                      <table className="w-full text-sm mt-6">
                        <tbody>
                          <tr className="font-bold text-base bg-sky-50 border-t-2 border-b-4 border-double border-sky-600 text-sky-900">
                            <td className="py-2.5 pl-2">Net Profit / (Loss)</td>
                            <td className="py-2.5 text-right">{formatCurrency(financialData.netIncome)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3.B BALANCE SHEET PREVIEW */}
                {activeModal === "balance" && (
                  <div>
                    <h3 className="text-center text-lg font-bold text-sky-700 uppercase tracking-wide border-b pb-2 mb-4">
                      Balance Sheet
                    </h3>
                    <div className="mb-6 flex justify-between text-xs text-slate-500 border-b pb-2">
                      <span><strong>Issuer:</strong> Springer Finance</span>
                      <span><strong>As of Date:</strong> {format(selectedDateRange.end, "PP")}</span>
                    </div>

                    <div className="space-y-4">
                      {/* Assets Section */}
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 border-b pb-1">Assets</h4>
                        <p className="text-[10px] font-semibold text-slate-400 mt-1 uppercase pl-2">Cash & Cash Equivalents</p>
                        <table className="w-full text-sm mt-1">
                          <tbody>
                            {financialData.assetAccounts.map(a => (
                              <tr key={a.name}>
                                <td className="py-1 pl-4 text-slate-700">{a.name} ({a.type})</td>
                                <td className="py-1 text-right text-slate-700">{formatCurrency(a.balance)}</td>
                              </tr>
                            ))}
                            <tr className="font-semibold bg-slate-50 border-t">
                              <td className="py-1.5 pl-2 text-slate-800">Total Assets</td>
                              <td className="py-1.5 text-right text-slate-800">{formatCurrency(financialData.totalAssets)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Liabilities Section */}
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 border-b pb-1">Liabilities</h4>
                        <table className="w-full text-sm mt-2">
                          <tbody>
                            <tr>
                              <td className="py-1 pl-4 text-slate-500 italic">No Liability Accounts Recorded (Cash Basis)</td>
                              <td className="py-1 text-right text-slate-700">{formatCurrency(0)}</td>
                            </tr>
                            <tr className="font-semibold bg-slate-50 border-t">
                              <td className="py-1.5 pl-2 text-slate-800">Total Liabilities</td>
                              <td className="py-1.5 text-right text-slate-800">{formatCurrency(0)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Net Worth / Capital */}
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 border-b pb-1">Equity & Net Worth</h4>
                        <table className="w-full text-sm mt-2">
                          <tbody>
                            <tr>
                              <td className="py-1 pl-4 text-slate-700">Retained Wealth Balance</td>
                              <td className="py-1 text-right text-slate-700">{formatCurrency(financialData.netWorth)}</td>
                            </tr>
                            <tr className="font-bold text-base bg-sky-50 border-t-2 border-b-4 border-double border-sky-600 text-sky-900">
                              <td className="py-2.5 pl-2">Total Liabilities & Equity</td>
                              <td className="py-2.5 text-right">{formatCurrency(financialData.netWorth)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3.C CASH FLOW STATEMENT PREVIEW */}
                {activeModal === "cashflow" && (
                  <div>
                    <h3 className="text-center text-lg font-bold text-sky-700 uppercase tracking-wide border-b pb-2 mb-4">
                      Statement of Cash Flows
                    </h3>
                    <div className="mb-6 flex justify-between text-xs text-slate-500 border-b pb-2">
                      <span><strong>Issuer:</strong> Springer Finance</span>
                      <span><strong>For the Period:</strong> {format(selectedDateRange.start, "PP")} to {format(selectedDateRange.end, "PP")}</span>
                    </div>

                    <div className="space-y-4 text-sm">
                      {/* Operating Activities */}
                      <div>
                        <h4 className="font-bold text-slate-800 border-b pb-1">Cash Flows from Operating Activities</h4>
                        <table className="w-full text-sm mt-1">
                          <tbody>
                            <tr>
                              <td className="py-1 pl-4 text-slate-700">Operating Inflows (Revenue/Receipts)</td>
                              <td className="py-1 text-right text-slate-700">{formatCurrency(financialData.cashFlow.opInflow)}</td>
                            </tr>
                            <tr>
                              <td className="py-1 pl-4 text-slate-700">Operating Outflows (Payments/Costs)</td>
                              <td className="py-1 text-right text-slate-700">({formatCurrency(financialData.cashFlow.opOutflow)})</td>
                            </tr>
                            <tr className="font-semibold text-slate-800 border-t">
                              <td className="py-1 pl-2">Net Cash provided by Operating Activities</td>
                              <td className="py-1 text-right">{formatCurrency(financialData.cashFlow.netOpCash)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Investing Activities */}
                      <div>
                        <h4 className="font-bold text-slate-800 border-b pb-1">Cash Flows from Investing Activities</h4>
                        <table className="w-full text-sm mt-1">
                          <tbody>
                            <tr>
                              <td className="py-1 pl-4 text-slate-700">Inflows from Investments / Asset Liquidations</td>
                              <td className="py-1 text-right text-slate-700">{formatCurrency(financialData.cashFlow.invInflow)}</td>
                            </tr>
                            <tr>
                              <td className="py-1 pl-4 text-slate-700">Outflows for Capital Investments / Savings Transfers</td>
                              <td className="py-1 text-right text-slate-700">({formatCurrency(financialData.cashFlow.invOutflow)})</td>
                            </tr>
                            <tr className="font-semibold text-slate-800 border-t">
                              <td className="py-1 pl-2">Net Cash provided by Investing Activities</td>
                              <td className="py-1 text-right">{formatCurrency(financialData.cashFlow.netInvCash)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Financing Activities */}
                      <div>
                        <h4 className="font-bold text-slate-800 border-b pb-1">Cash Flows from Financing Activities</h4>
                        <table className="w-full text-sm mt-1">
                          <tbody>
                            <tr>
                              <td className="py-1 pl-4 text-slate-700">Inflows from Loans / Financing Receipts</td>
                              <td className="py-1 text-right text-slate-700">{formatCurrency(financialData.cashFlow.finInflow)}</td>
                            </tr>
                            <tr>
                              <td className="py-1 pl-4 text-slate-700">Outflows for Loan Repayments / Debt Servicing</td>
                              <td className="py-1 text-right text-slate-700">({formatCurrency(financialData.cashFlow.finOutflow)})</td>
                            </tr>
                            <tr className="font-semibold text-slate-800 border-t">
                              <td className="py-1 pl-2">Net Cash provided by Financing Activities</td>
                              <td className="py-1 text-right">{formatCurrency(financialData.cashFlow.netFinCash)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Reconciliation */}
                      <div className="pt-2">
                        <h4 className="font-bold text-slate-800 border-b pb-1">Net Summary of Cash</h4>
                        <table className="w-full text-sm mt-1">
                          <tbody>
                            <tr>
                              <td className="py-1 pl-2 text-slate-700">Net Increase / (Decrease) in Cash</td>
                              <td className="py-1 text-right text-slate-700 font-medium">{formatCurrency(financialData.cashFlow.netChangeInCash)}</td>
                            </tr>
                            <tr>
                              <td className="py-1 pl-2 text-slate-700">Beginning Cash Balance</td>
                              <td className="py-1 text-right text-slate-700">{formatCurrency(financialData.cashFlow.beginningCash)}</td>
                            </tr>
                            <tr className="font-bold text-base bg-sky-50 border-t-2 border-b-4 border-double border-sky-600 text-sky-900">
                              <td className="py-2.5 pl-2">Ending Cash Balance</td>
                              <td className="py-2.5 text-right">{formatCurrency(financialData.cashFlow.endingCash)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50 dark:bg-slate-950">
              <Button
                variant="outline"
                onClick={() => setActiveModal(null)}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  const title = 
                    activeModal === "income" ? "Income Statement" : 
                    activeModal === "balance" ? "Balance Sheet" : "Cash Flow Statement";
                  const reportHtml = document.getElementById("financial-report-doc").innerHTML;
                  handleDownloadPDF(title, reportHtml);
                }}
                className="flex items-center gap-1.5"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
