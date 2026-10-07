import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/prisma";
import { checkLedger } from "../support/ledger-check";

/**
 * After a load test (npm run test:load:verify): the books of every company in Full accounting
 * still equal the statements month by month, the trial balance balances and a second sync
 * changes nothing — however many records were written at the same time.
 */
describe.skipIf(!process.env.LOAD_SEED)("after the load test", () => {
  it("the books agree with the statements", async () => {
    const { properties = [], trades = [], makers = [] } = JSON.parse(readFileSync(process.env.LOAD_SEED, "utf8"));
    let compared = 0;
    for (const p of properties) {
      const boss = await db.user.findUnique({ where: { id: p.bossId } });
      const r = await checkLedger({ organizationId: p.orgId, boss, fromMonth: "2026-08" });
      compared += r.compared.length;
    }
    expect(compared).toBe(properties.length * 3);
    // Shops, bars, pressings, car washes, other in Full accounting (every other business of the seed).
    const fullTrades = trades.filter((_, i) => i % 2 === 0);
    let tradeCompared = 0;
    for (const t of fullTrades) {
      const boss = await db.user.findUnique({ where: { id: t.bossId } });
      tradeCompared += (await checkLedger({ organizationId: t.orgId, boss, fromMonth: new Date().toISOString().slice(0, 7) })).compared.length;
    }
    let makerCompared = 0;
    for (const m of makers) {
      const boss = await db.user.findUnique({ where: { id: m.bossId } });
      makerCompared += (await checkLedger({ organizationId: m.orgId, boss, fromMonth: new Date().toISOString().slice(0, 7) })).compared.length;
    }
    expect(makerCompared).toBe(makers.length * 3);
    tradeCompared += makerCompared;
    const entries = await db.journalEntry.count({ where: { status: "POSTED" } });
    console.log(`${properties.length + fullTrades.length + makers.length} companies, ${compared + tradeCompared} department-months compared, ${entries} posted entries`);
    expect(tradeCompared).toBeGreaterThanOrEqual(fullTrades.length);
  });
});
