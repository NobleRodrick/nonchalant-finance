#!/usr/bin/env node
/**
 * Load test: hundreds of people using the app at the same time, each in their own business
 * (multi-tenant), against a running server (`next start`) on the disposable test database.
 *
 *   1. npm run test:load:seed           # LOAD_ORGS businesses × 3 people (default 180 → 540 people)
 *   2. next build && next start          # with DATABASE_URL = the test database, JWT_SECRET set
 *   3. npm run test:load                 # this script
 *
 * Every virtual person signs in with a signed session cookie (same JWT_SECRET as the server) and,
 * after a think time, does what their role does: a venue head opens the dashboard, calendar,
 * bookings and reports, books dates and records payments; a restaurant head sells and records
 * expenses; the Boss opens the overview, statements and reports. Writes go through /api/sync,
 * exactly as the app's outbox sends them. Prints p50 / p95 / p99 per action and the error rate.
 *
 * Env: BASE_URL (http://localhost:3100), JWT_SECRET, LOAD_SEED (load-seed.json), DURATION (s, 120),
 * RAMP (s, 30), THINK_MIN / THINK_MAX (ms, 3000 / 12000), LOAD_REPORT (JSON output path).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { SignJWT } from "jose";

// BASE_URL may list several servers (comma-separated): each person stays on one, as behind a load balancer.
const BASES = (process.env.BASE_URL || "http://localhost:3100").split(",").map((u) => u.trim()).filter(Boolean);
const serverOf = new AsyncLocalStorage();
const base = () => serverOf.getStore() || BASES[0];
const DURATION = Number(process.env.DURATION || 120) * 1000;
const RAMP = Number(process.env.RAMP || 30) * 1000;
const THINK_MIN = Number(process.env.THINK_MIN || 3000);
const THINK_MAX = Number(process.env.THINK_MAX || 12000);
const TIMEOUT = 30_000;
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "");
if (!process.env.JWT_SECRET) throw new Error("Set JWT_SECRET (the server's).");
const { orgs, stays = [] } = JSON.parse(readFileSync(process.env.LOAD_SEED || "load-seed.json", "utf8"));

const stats = new Map(); // label → { ms: [], errors, rejected }
const stat = (label) => stats.get(label) || stats.set(label, { ms: [], errors: 0, rejected: 0 }).get(label);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
const pick = (weighted) => {
  const total = weighted.reduce((s, [w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [w, f] of weighted) if ((r -= w) <= 0) return f;
  return weighted[0][1];
};
const dateKey = (days) => new Date(Date.now() + 3600000 + days * 86400000).toISOString().slice(0, 10);

async function cookieFor(userId, role, organizationId) {
  const token = await new SignJWT({ userId, role, organizationId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("3h").sign(secret);
  return `sf_access_token=${token}`;
}

async function timed(label, fn) {
  const s = stat(label);
  const t0 = performance.now();
  try {
    const out = await fn();
    s.ms.push(performance.now() - t0);
    return out;
  } catch (e) {
    s.errors += 1;
    s.lastError = String(e?.message || e).slice(0, 200);
    return null;
  }
}

async function page(cookie, label, path) {
  return timed(label, async () => {
    const res = await fetch(`${base()}${path}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT) });
    await res.arrayBuffer();
    if (res.status !== 200) throw new Error(`${path} → HTTP ${res.status}`);
    return true;
  });
}

/** One operation through /api/sync, as the outbox sends it. Rejections (a rule said no) are counted apart. */
async function op(cookie, label, kind, input) {
  return timed(label, async () => {
    const key = `load-${randomUUID()}`;
    const res = await fetch(`${base()}/api/sync`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ops: [{ key, kind, input, occurredAt: Date.now() }] }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.status !== 200) throw new Error(`sync → HTTP ${res.status}`);
    const [r] = (await res.json()).results;
    if (r.status === "error") throw new Error(r.error);
    if (r.status === "rejected") {
      stat(label).rejected += 1;
      return null;
    }
    return r.result;
  });
}

const ROLES = {
  async venueHead(o, cookie, state) {
    const v = `/d/${o.venueId}`;
    await pick([
      [3, () => page(cookie, "venue dashboard", v)],
      [2, () => page(cookie, "venue calendar", `${v}/calendar`)],
      [2, () => page(cookie, "venue bookings", `${v}/bookings`)],
      [1, () => page(cookie, "venue reports", `${v}/reports?period=month`)],
      [
        2,
        async () => {
          // Dates from a small window: some are already taken and must be refused (one event per date).
          const r = await op(cookie, "book a date", "venue.booking.create", { departmentId: o.venueId, eventDateKey: dateKey(2 + Math.floor(Math.random() * 60)), eventType: "Wedding", client: { name: `Client ${randomUUID().slice(0, 6)}`, phone: "690000000" } });
          if (r?.bookingId) state.bookings.push(r.bookingId);
        },
      ],
      [
        1,
        async () => {
          const id = state.bookings[Math.floor(Math.random() * state.bookings.length)];
          if (!id) return page(cookie, "venue bookings", `${v}/bookings`);
          return op(cookie, "record a payment", "venue.payment.record", { departmentId: o.venueId, bookingId: id, amount: 50000, paymentMethod: "CASH", receivedByName: "Load" });
        },
      ],
    ])();
  },
  async restHead(o, cookie) {
    const d = `/d/${o.restaurantId}`;
    await pick([
      [2, () => page(cookie, "restaurant home", d)],
      [2, () => page(cookie, "restaurant sell", `${d}/sell`)],
      [5, () => op(cookie, "record a sale", "sale.record", { departmentId: o.restaurantId, lines: [{ dishId: o.dishId, quantity: 1 + Math.floor(Math.random() * 3) }], paymentMethod: "CASH" })],
      [1, () => op(cookie, "record an expense", "money.record", { departmentId: o.restaurantId, type: "EXPENSE", amount: 1500, category: "opex-electricity" })],
    ])();
  },
  async stayHead(o, cookie, state) {
    const d = `/d/${o.stayId}`;
    await pick([
      [3, () => page(cookie, "stay dashboard", d)],
      [2, () => page(cookie, "stay bookings", `${d}/stays`)],
      [1, () => page(cookie, "stay calendar", `${d}/occupancy`)],
      [1, () => page(cookie, "stay reports", `${d}/reports?period=month`)],
      [
        2,
        async () => {
          // Nights from a small window: some are taken and must be refused (no double booking).
          const start = 1 + Math.floor(Math.random() * 40);
          const r = await op(cookie, "book an apartment", "rooms.stay.create", { departmentId: o.stayId, roomId: o.roomIds[Math.floor(Math.random() * o.roomIds.length)], checkInKey: dateKey(start), checkOutKey: dateKey(start + 1 + Math.floor(Math.random() * 3)), guestName: `Guest ${randomUUID().slice(0, 6)}` });
          if (r?.stayId) state.bookings.push(r.stayId);
        },
      ],
      [
        1,
        async () => {
          const id = state.bookings[Math.floor(Math.random() * state.bookings.length)];
          if (!id) return page(cookie, "stay bookings", `${d}/stays`);
          return op(cookie, "record a stay payment", "rooms.payment.record", { departmentId: o.stayId, stayId: id, amount: 10000, receivedByName: "Load" });
        },
      ],
      [1, () => op(cookie, "record a stay expense", "money.record", { departmentId: o.stayId, type: "EXPENSE", amount: 2500, category: "stay-cleaning", description: "Cleaning", counterparty: "CleanCo", authorizedByName: "Boss", roomId: o.roomIds[0] })],
    ])();
  },
  async stayHead2(o, cookie) {
    const d = `/d/${o.stayId}`;
    await pick([
      [2, () => page(cookie, "stay money", `${d}/money?period=month`)],
      [1, () => page(cookie, "stay apartments", `${d}/rooms`)],
      [1, () => page(cookie, "stay maintenance", `${d}/maintenance`)],
      [1, () => page(cookie, "stay assets", `${d}/assets`)],
    ])();
  },
  async stayBoss(o, cookie) {
    await pick([
      [3, () => page(cookie, "boss overview", "/boss")],
      [1, () => page(cookie, "stay dashboard (boss)", `/d/${o.stayId}`)],
      [1, () => page(cookie, "stay reports (boss)", `/d/${o.stayId}/reports?period=month`)],
    ])();
  },
  async boss(o, cookie) {
    await pick([
      [3, () => page(cookie, "boss overview", "/boss")],
      [1, () => page(cookie, "statements", "/statements?period=month")],
      [1, () => page(cookie, "venue reports (boss)", `/d/${o.venueId}/reports?period=month`)],
      [1, () => page(cookie, "venue dashboard (boss)", `/d/${o.venueId}`)],
    ])();
  },
};

async function person(role, o, userId, userRole, startAt, endAt) {
  const cookie = await cookieFor(userId, userRole, o.orgId);
  const state = { bookings: [] };
  await sleep(startAt - Date.now());
  while (Date.now() < endAt) {
    await ROLES[role](o, cookie, state);
    if (Math.random() < 0.3) await timed("connectivity check", async () => (await fetch(`${base()}/api/health`, { signal: AbortSignal.timeout(8000) })).ok || Promise.reject(new Error("health")));
    await think();
  }
}

const q = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

async function main() {
  const people = [
    ...orgs.flatMap((o) => [["venueHead", o, o.venueHeadId, "HEAD"], ["restHead", o, o.restHeadId, "HEAD"], ["boss", o, o.bossId, "ADMIN"]]),
    ...stays.flatMap((o) => [["stayHead", o, o.headId, "HEAD"], ["stayHead2", o, o.head2Id, "HEAD"], ["stayBoss", o, o.bossId, "ADMIN"]]),
  ];
  const t0 = Date.now();
  const end = t0 + RAMP + DURATION;
  console.log(`${people.length} people in ${orgs.length + stays.length} businesses · ramp ${RAMP / 1000}s · ${DURATION / 1000}s at full load · think ${THINK_MIN}–${THINK_MAX} ms · ${BASES.join(", ")}`);
  const ticker = setInterval(() => {
    const done = [...stats.values()].reduce((s, x) => s + x.ms.length + x.errors, 0);
    console.log(`  ${Math.round((Date.now() - t0) / 1000)}s: ${done} requests`);
  }, 15000);
  await Promise.all(people.map(([role, o, id, r], i) => serverOf.run(BASES[i % BASES.length], () => person(role, o, id, r, t0 + (RAMP * i) / people.length, end))));
  clearInterval(ticker);
  const secs = (Date.now() - t0) / 1000;

  const rows = [...stats.entries()].map(([label, s]) => {
    const ms = s.ms.sort((a, b) => a - b);
    return { label, count: ms.length + s.errors, errors: s.errors, rejected: s.rejected, p50: Math.round(q(ms, 50)), p95: Math.round(q(ms, 95)), p99: Math.round(q(ms, 99)), max: Math.round(ms.at(-1) || 0), lastError: s.lastError };
  });
  const total = rows.reduce((s, r) => s + r.count, 0);
  const errors = rows.reduce((s, r) => s + r.errors, 0);
  console.table(rows.map(({ lastError, ...r }) => r));
  for (const r of rows.filter((x) => x.lastError)) console.log(`  last error of "${r.label}": ${r.lastError}`);
  console.log(`${total} requests in ${Math.round(secs)}s (${(total / secs).toFixed(1)}/s), errors ${errors} (${((errors / Math.max(1, total)) * 100).toFixed(2)}%)`);
  if (process.env.LOAD_REPORT) writeFileSync(process.env.LOAD_REPORT, JSON.stringify({ people: people.length, businesses: orgs.length + stays.length, seconds: Math.round(secs), total, errors, rows }, null, 1));
  process.exit(errors / Math.max(1, total) > 0.01 ? 1 : 0);
}

main();
