/** Setup file of the isolation run (vitest.isolation.config.mjs): wraps every write operation. */
import fs from "node:fs";
import { vi } from "vitest";

vi.mock("@/lib/operations/execute", async (importOriginal) => {
  const actual = await importOriginal();
  const { probeAfter } = await import("./isolation-attacks.js");
  return {
    ...actual,
    async executeOperation(args) {
      const out = await actual.executeOperation(args);
      if (!out.duplicate) {
        await probeAfter(actual, args, out).catch((e) => {
          fs.appendFileSync(process.env.ISOLATION_OUT || "isolation-probe.jsonl", `${JSON.stringify({ attack: "probe", kind: args.kind, outcome: "probe-error", message: String(e?.message || e).slice(0, 200) })}\n`);
        });
      }
      return out;
    },
  };
});
