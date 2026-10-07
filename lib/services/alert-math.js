/** What needs attention in a pressing, car wash or jobs department (pure, unit-tested). */
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);

/** What needs attention (pure): late tickets, ready not told, unclaimed, collected but not paid, washers owed. */
export function serviceWarnings({ tickets = [], owing = [], workers = [], domain }) {
  const out = [];
  const add = (w) => w.count && out.push(w);
  const word = domain === "CAR_WASH" ? "wash" : domain === "OTHER" ? "job" : "ticket";
  const row = (t, extra = {}) => ({ id: t.id, label: `${t.referenceNo} · ${t.customer || t.plate || "walk-in"}`, href: `/tickets/${t.id}`, ...extra });
  const late = tickets.filter((t) => t.late);
  add({ key: "late", tone: "bad", count: late.length, title: `${late.length} ${word}(s) late`, detail: "Promised for a time already past and not ready yet.", href: "/tickets?view=late", rows: late.map((t) => row(t, { note: `promised ${t.promisedLabel}` })) });
  const tell = tickets.filter((t) => t.status === "READY" && !t.notified && t.phone);
  add({ key: "to-notify", tone: "warn", count: tell.length, title: `${tell.length} customer(s) to tell their ${domain === "CAR_WASH" ? "vehicle" : "items"} are ready`, detail: "Send the WhatsApp message from the ticket.", href: "/tickets?view=ready", rows: tell.map((t) => row(t, { note: t.phone })) });
  const unclaimed = tickets.filter((t) => t.unclaimed);
  add({ key: "unclaimed", tone: "warn", count: unclaimed.length, amount: sum(unclaimed, (t) => Math.max(0, t.balance)), title: `${unclaimed.length} ${word}(s) ready but not collected for a long time`, detail: "Unclaimed items: call the customer.", href: "/tickets?view=unclaimed", rows: unclaimed.map((t) => row(t, { note: `ready since ${t.readyKey}`, amount: t.balance })) });
  add({ key: "owing", tone: "bad", count: owing.length, amount: sum(owing, (t) => t.balance), title: `${owing.length} collected ${word}(s) not fully paid`, detail: "Customers who left owing money.", href: "/tickets?view=owing", rows: owing.map((t) => row(t, { amount: t.balance })) });
  const owed = workers.filter((w) => w.owed > 0 && w.isActive);
  add({ key: "workers-owed", tone: "info", count: owed.length, amount: sum(owed, (w) => w.owed), title: `${owed.length} washer(s) with commissions to pay`, detail: "Earned on collected washes and not paid yet.", href: "/workers", rows: owed.map((w) => ({ id: w.id, label: w.name, amount: w.owed })) });
  return out;
}

