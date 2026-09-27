import { beforeAll, describe, expect, it, vi } from "vitest";
import { fails, hasDb, loginAs, ok, setupOrganization, today } from "../support/fixtures";
import { generateInsights } from "@/actions/insights";

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: async (prompt) => ({ response: { text: () => JSON.stringify(["Money in " + (/Money in ([\d\s ]+FCFA)/.exec(prompt)?.[1] || "?"), "b", "c"]) } }) };
    }
  },
}));

describe.skipIf(!hasDb)("AI insights on statements", () => {
  let o;
  beforeAll(async () => {
    o = await setupOrganization("Insights");
  });

  it("says AI is not configured when there is no key (never invents figures)", async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await loginAs(o.boss.id);
    const res = ok(await generateInsights({ departmentIds: [o.deptA.id], fromKey: today(), toKey: today() }));
    expect(res.insights).toEqual([]);
    expect(res.error).toMatch(/not configured/);
    if (saved) process.env.GEMINI_API_KEY = saved;
  });

  it("sends only the recorded totals and returns the model's insights", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    await loginAs(o.boss.id);
    const res = ok(await generateInsights({ departmentIds: [], fromKey: today(), toKey: today() }));
    expect(res.insights).toHaveLength(3);
    expect(res.insights[0]).toMatch(/^Money in 0/);
    delete process.env.GEMINI_API_KEY;
  });

  it("refuses a head of other departments and a bad period", async () => {
    await loginAs(o.multi.id);
    fails(await generateInsights({ departmentIds: [o.deptA.id], fromKey: today(), toKey: today() }), /cannot read/);
    await loginAs(o.boss.id);
    fails(await generateInsights({ departmentIds: [], fromKey: "2026-13-01", toKey: today() }), /valid period/);
  });
});
