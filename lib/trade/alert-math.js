/** What needs attention in a shop, bar or other activity (pure, unit-tested; the dashboard, the morning alert). */
import { addDaysToKey } from "@/lib/timezone";

const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);

/**
 * What needs attention in a shop / bar today (pure): products out of stock or low, tabs open since
 * yesterday, customers' debts past due, supplier bills due within 5 days or late, crates owed back.
 */
export function tradeWarnings({ products = [], tabs = [], debts = [], bills = [], crates = null, todayKey, nowIso }) {
  const out = [];
  const add = (w) => w.count && out.push(w);
  const goods = products.filter((p) => p.kind !== "SERVICE" && p.isActive);
  const empty = goods.filter((p) => p.empty);
  add({ key: "out-of-stock", tone: "bad", count: empty.length, title: `${empty.length} product(s) out of stock`, detail: "Customers cannot buy them: buy more, or archive what you no longer sell.", href: "/stock?status=low", rows: empty.map((p) => ({ id: p.id, label: p.name, note: p.code, href: `/products/${p.id}` })) });
  const low = goods.filter((p) => p.low && !p.empty);
  add({ key: "low-stock", tone: "warn", count: low.length, title: `${low.length} product(s) running low`, detail: "At or under their low-stock level.", href: "/stock?status=low", rows: low.map((p) => ({ id: p.id, label: p.name, note: `${p.quantity} ${p.unit} left (level ${p.lowStock})`, href: `/products/${p.id}` })) });
  const dayAgo = nowIso ? new Date(Date.parse(nowIso) - 12 * 3600000).toISOString() : null;
  const oldTabs = dayAgo ? tabs.filter((t) => t.openedAt < dayAgo) : [];
  add({ key: "old-tabs", tone: "warn", count: oldTabs.length, amount: sum(oldTabs, (t) => t.total), title: `${oldTabs.length} tab(s) open for more than 12 hours`, detail: "Close them (paid or on credit) so the day's sales are right.", href: "/sell", rows: oldTabs.map((t) => ({ id: t.id, label: `${t.label} · ${t.referenceNo}`, amount: t.total })) });
  const lateDebts = debts.filter((d) => d.overdue);
  add({ key: "late-debts", tone: "bad", count: lateDebts.length, amount: sum(lateDebts, (d) => d.balance), title: `${lateDebts.length} customer debt(s) past due`, detail: "Customers on credit who were to pay by now.", href: "/debts", rows: lateDebts.map((d) => ({ id: d.id, label: d.debtor, note: `due ${d.dueKey}`, amount: d.balance })) });
  const soon = addDaysToKey(todayKey, 5);
  const dueBills = bills.filter((b) => b.dueKey && b.dueKey <= soon);
  add({ key: "bills-due", tone: dueBills.some((b) => b.dueKey < todayKey) ? "bad" : "warn", count: dueBills.length, amount: sum(dueBills, (b) => b.balance), title: `${dueBills.length} supplier bill(s) due`, detail: "Bought on credit: due within 5 days or already late.", href: "/purchases?tab=bills", rows: dueBills.map((b) => ({ id: b.id, label: `${b.supplier} · ${b.referenceNo}`, note: b.dueKey < todayKey ? `late since ${b.dueKey}` : `due ${b.dueKey}`, amount: b.balance })) });
  if (crates) {
    const owed = crates.crates.filter((c) => c.owedToSuppliers > 0);
    add({ key: "crates-owed", tone: "info", count: owed.length ? 1 : 0, amount: crates.totals.depositsWithSuppliers, title: `${crates.totals.owedToSuppliers} crate(s) to give back to suppliers`, detail: "Their deposit is yours once the empties go back.", href: "/crates", rows: owed.map((c) => ({ id: c.id, label: c.name, note: `${c.owedToSuppliers} crate(s)` })) });
    const out2 = crates.crates.filter((c) => c.bottlesWithCustomers > 0);
    add({ key: "bottles-out", tone: "info", count: out2.length ? 1 : 0, amount: crates.totals.depositsHeldForCustomers, title: `${crates.totals.bottlesWithCustomers} bottle(s) out with customers`, detail: "Their deposit is held for the customers until they bring them back.", href: "/crates", rows: out2.map((c) => ({ id: c.id, label: c.name, note: `${c.bottlesWithCustomers} bottle(s)` })) });
  }
  return out;
}

