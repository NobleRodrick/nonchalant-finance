/**
 * Finance Copilot sandbox without a test framework: bundled into one file (scripts/build-sandbox.mjs)
 * so it runs on any machine with Node, Postgres and the Prisma client.
 *
 *   node copilot-sandbox.mjs seed              builds the business (database rebuilt beforehand)
 *   node copilot-sandbox.mjs run S01 S02 …     runs these scenarios (all when none given)
 *   node copilot-sandbox.mjs export            writes the evidence files
 * Environment: DATABASE_URL (disposable!), GEMINI_API_KEY, SANDBOX_OUT, SANDBOX_DRY=1 (no model).
 */
process.env.QUIET_ACTION_WARNINGS = "1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "sandbox-secret-sandbox-secret-sandbox-1234";
const { seedSandbox, runScenarios, exportEvidence } = await import("./sandbox-run.mjs");
const [cmd, ...ids] = process.argv.slice(2);
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
if (cmd === "seed") await seedSandbox({ log });
else if (cmd === "run") {
  const r = await runScenarios({ only: ids.length ? ids : null, log });
  log(`${r.filter((x) => !x.error).length}/${r.length} scenarios done`);
} else if (cmd === "export") log(JSON.stringify((await exportEvidence()).counts));
else {
  console.error("usage: seed | run [S01 …] | export");
  process.exitCode = 1;
}
const { db } = await import("@/lib/prisma");
await db.$disconnect();
