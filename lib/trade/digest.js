/** The line and the e-mail sections of a shop / bar / pressing / car wash report (pure, unit-tested). */
import { formatMoney } from "@/lib/format";

/** The e-mail and the notification line of a report (pure, from tradeReport / serviceReport). */
export function tradeDigest({ trade: t, services: s }, kind = "daily") {
  const money = (label, value) => ({ label, value, money: true });
  const i = (t || s).income;
  const sections = [];
  const parts = [];
  if (t) {
    sections.push({ title: "Sales and stock", rows: [money("Sales", t.sales.net), { label: "Number of sales", value: String(t.sales.count) }, money("Cash", t.sales.byMethod.CASH), money("Mobile Money", t.sales.byMethod.MOMO), money("Bank / card / other", t.sales.byMethod.BANK_TRANSFER + t.sales.byMethod.OTHER), money("On credit", t.sales.byMethod.CREDIT), money("Gross margin", t.sales.margin), money("Goods bought", t.purchases.amount), money("Goods lost / counted short", t.losses.lost), money("Stock value now", t.stock.value), money("Owed by customers", t.credit.owed)] });
    parts.push(`Sales ${formatMoney(t.sales.net)} (${t.sales.count})`, `margin ${formatMoney(t.sales.margin)}`, `stock ${formatMoney(t.stock.value)}`);
    if (t.credit.owed) parts.push(`owed ${formatMoney(t.credit.owed)}`);
  }
  if (s) {
    sections.push({ title: "Tickets", rows: [{ label: "Collected", value: String(s.tickets.collected) }, money("Revenue (collected)", s.tickets.revenue), { label: "Received", value: String(s.tickets.received) }, money("Money received (net)", s.money.received - s.money.refunded), { label: "Average time to be ready", value: s.tickets.turnaroundHours === null ? "—" : `${s.tickets.turnaroundHours} h` }, { label: "Cancelled", value: String(s.tickets.cancelled) }, money("Left without paying (all)", s.owing.amount)] });
    parts.push(`${s.tickets.collected} collected (${formatMoney(s.tickets.revenue)})`);
    if (s.owing.amount) parts.push(`left owing ${formatMoney(s.owing.amount)}`);
  }
  sections.push({ title: "Profit", rows: [money("Total income", i.moneyIn), money("Total costs", i.moneyOut), money("Profit", i.result)] });
  parts.push(`profit ${formatMoney(i.result)}`);
  const lists = [];
  if (t?.sales.byProduct.length) lists.push({ title: "Best sellers", items: t.sales.byProduct.slice(0, 5).map((p) => `${p.name}: ${p.quantity} sold, ${formatMoney(p.revenue)} (margin ${formatMoney(p.margin)})`) });
  if (t?.stock.rows.some((p) => p.empty || p.low)) lists.push({ title: "To buy", items: t.stock.rows.filter((p) => p.empty || p.low).slice(0, 8).map((p) => `${p.name}: ${p.quantity} ${p.unit} left`) });
  if (s?.workers.length && kind !== "daily") lists.push({ title: "Washers", items: s.workers.map((w) => `${w.name}: ${w.period.tickets} wash(es), earned ${formatMoney(w.period.commission)}, owed ${formatMoney(w.owed)}`) });
  if (s?.byService.length) lists.push({ title: "Services", items: s.byService.slice(0, 5).map((x) => `${x.name}: ${formatMoney(x.revenue)}`) });
  return { line: parts.join(" · "), sections, lists };
}

