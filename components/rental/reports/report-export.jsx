"use client";

import { ExportMenu } from "@/components/kit/export-menu";

/** The report as an Excel workbook (one sheet per table), CSV (the income statement) or PDF. */
export function RentalReportExport({ report: r, trends, fileName }) {
  const kv = (name, rows) => ({ name, columns: [{ label: "Item", value: 0 }, { label: "FCFA", value: 1 }], rows });
  const i = r.income;
  const cf = r.cashFlow;
  const bs = r.balanceSheet;
  const sheets = [
    kv("Income statement", [
      ["Events (booking prices)", i.eventsRevenue],
      ["Charges (damages, extra days…)", i.chargesRevenue],
      ["Kept from cancelled bookings", i.cancellationIncome],
      ["Other income", i.otherIncome],
      ["Gains on assets sold", i.assetGains],
      ["Revenue", i.revenue],
      ["Expenses", -i.expenses],
      ["Repairs", -i.repairs],
      ["Items lost or written off", -i.losses],
      ["Depreciation", -i.depreciation],
      ["Costs", -i.costs],
      ["Result", i.result],
    ]),
    {
      name: "Profit per event",
      columns: [
        { label: "Date", value: "eventDateKey" },
        { label: "Booking", value: "referenceNo" },
        { label: "Event", value: "eventType" },
        { label: "Customer", value: "client" },
        { label: "Price", value: "price" },
        { label: "Charges", value: "charges" },
        { label: "Revenue", value: "revenue" },
        { label: "Expenses", value: "expenses" },
        { label: "Items lost", value: "losses" },
        { label: "Profit", value: "profit" },
        { label: "Margin %", value: "margin" },
      ],
      rows: r.profitability.rows,
    },
    kv("Cash flow", [
      ["Cash at the start", cf.opening],
      ["Received from customers", cf.receivedFromClients],
      ["Other income", cf.otherIncome],
      ["Refunds", -cf.refunds],
      ["Expenses paid", -cf.expenses],
      ["Operating", cf.operating],
      ["Purchases of items and assets", -cf.purchases],
      ["Net", cf.net],
      ["Handed over to the Boss", -cf.handedOver],
      ["Cash at the end", cf.closingCash],
    ]),
    kv("Balance sheet", [
      ["Cash", bs.cash],
      ["Owed by customers", bs.receivable],
      ["Stock at cost", bs.stockValue],
      ["Assets (book value)", bs.assetsBookValue],
      ["Total assets", bs.totalAssets],
      ["Advances from customers", bs.advances],
      ["Net position", bs.netPosition],
    ]),
    {
      name: "Owed by customers",
      columns: [
        { label: "Booking", value: "referenceNo" },
        { label: "Customer", value: "client" },
        { label: "Phone", value: "phone" },
        { label: "Event date", value: "eventDateKey" },
        { label: "Total", value: "total" },
        { label: "Paid", value: "paid" },
        { label: "Balance", value: "balance" },
        { label: "Overdue", value: (x) => (x.overdue ? "Yes" : "") },
      ],
      rows: r.balances.rows,
    },
    {
      name: "Items",
      columns: [
        { label: "Code", value: "code" },
        { label: "Item", value: "name" },
        { label: "Category", value: "category" },
        { label: "Owned", value: "owned" },
        { label: "Units rented", value: "units" },
        { label: "Times rented", value: "times" },
        { label: "Revenue", value: "revenue" },
        { label: "Losses", value: "losses" },
        { label: "Repairs", value: "repairs" },
        { label: "Profit", value: "profit" },
        { label: "Utilization %", value: "utilization" },
      ],
      rows: r.items.rows,
    },
    { name: "Customers", columns: [{ label: "Customer", value: "client" }, { label: "Events", value: "events" }, { label: "Revenue", value: "revenue" }], rows: r.customers },
    { name: "Expenses", columns: [{ label: "Category", value: "label" }, { label: "Amount", value: "amount" }], rows: r.expensesByCategory },
    {
      name: "Last 12 months",
      columns: [{ label: "Month", value: "monthKey" }, { label: "Events", value: "events" }, { label: "Revenue", value: "revenue" }, { label: "Costs", value: "costs" }, { label: "Result", value: "result" }],
      rows: trends,
    },
  ];
  return <ExportMenu fileName={fileName} sheets={sheets} />;
}
