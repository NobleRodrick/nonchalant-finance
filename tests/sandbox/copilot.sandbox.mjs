import { expect, it } from "vitest";
import { runSandbox } from "./sandbox-run.mjs";

/** Finance Copilot sandbox run under vitest (the global setup rebuilds the disposable database). */
it("runs the copilot scenarios and exports the evidence", async () => {
  const results = await runSandbox({ log: (m) => console.log(m) });
  expect(results.filter((r) => r.error)).toEqual([]);
});
