"use client";

import { ExportMenu } from "@/components/kit/export-menu";
import { CHARGE_KIND_LABELS } from "@/lib/property/account";

/** The report as an Excel workbook (one sheet per table), CSV (the income statement) or PDF. */
export function PropertyReportExport({ report: r, trends, fileName }) {
  const kv = (name, rows) => ({ name, columns: [{ label: "Item", value: 0 }, { label: "FCFA", value: 1 }], rows });
  const i = r.income;
  const perf = (name, rows, tenant) => ({ name, columns: [{ label: "Name", value: "name" }, ...(tenant ? [{ label: "Offices", value: "offices" }] : [{ label: "Building", value: "building" }]), { label: "Rent", value: "rent" }, { label: "Charges", value: "charges" }, ...(tenant ? [{ label: "Total", value: "revenue" }] : [{ label: "Expenses", value: "expenses" }, { label: "Net", value: "net" }])], rows });
  const sheets = [
    kv("Income statement", [["Rent", i.rent], ["Forgiven", -i.waived], ...Object.entries(i.byKind).map(([k, v]) => [CHARGE_KIND_LABELS[k], v]), ["Other income", i.otherIncome], ["Total income", i.revenue], ...i.expensesByCategory.map((e) => [e.label, -e.amount]), ["Total expenses", -i.expenses], ["Net operating income", i.net]]),
    kv("Performance", [["Total offices", r.occupancy.total], ["Occupied", r.occupancy.OCCUPIED], ["Vacant", r.occupancy.vacant], ["Occupancy rate now (%)", r.occupancy.occupancyRate], ["Occupancy over the period (%)", r.occupancy.periodRate], ["Rent expected", r.rent.expected], ["Rent collected", r.rent.collected], ["Tenant debt now", r.arrears.owed], ["Overdue now", r.arrears.overdue], ["Deposits held now", r.deposits.held]]),
    kv("Cash flow", [["Opening cash", r.cashFlow.opening], ["Paid by tenants", r.cashFlow.tenantPayments], ["Refunds", -r.cashFlow.refunds], ["Deposits received", r.cashFlow.depositsIn], ["Deposits refunded", -r.cashFlow.depositsOut], ["Other income", r.cashFlow.otherIncome], ["Expenses", -r.cashFlow.expenses], ["Net", r.cashFlow.net], ["Bank & Mobile Money", r.cashFlow.bankAndMomo], ["Handed over", -r.cashFlow.handedOver], ["Closing cash", r.cashFlow.closingCash]]),
    perf("By building", r.by.buildings),
    perf("By office", r.by.units),
    perf("By tenant", r.by.tenants, true),
    { name: "Arrears", columns: [{ label: "Contract", value: "referenceNo" }, { label: "Tenant", value: "tenant" }, { label: "Office", value: "unit" }, { label: "Months owed", value: "monthsOwed" }, { label: "Days overdue", value: "daysOverdue" }, { label: "Owed", value: "balance" }], rows: r.arrears.rows },
    { name: "Last 12 months", columns: [{ label: "Month", value: "monthKey" }, { label: "Rent", value: "rent" }, { label: "Utilities", value: "utilities" }, { label: "Other", value: "other" }, { label: "Total income", value: "revenue" }, { label: "Expenses", value: "expenses" }, { label: "Net", value: "net" }, { label: "Collected", value: "collected" }], rows: trends },
  ];
  return <ExportMenu fileName={fileName} sheets={sheets} />;
}
