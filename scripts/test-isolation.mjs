/**
 * npm run test:isolation — runs the integration tests with the isolation probe
 * (tests/support/isolation-attacks.js): every write they make is replayed by another business and by
 * another department with the same record ids. Fails if any replay is accepted.
 * Needs TEST_DATABASE_URL (a disposable database), like npm test.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const out = path.resolve("isolation-probe.jsonl");
fs.rmSync(out, { force: true });
const run = spawnSync("npx", ["vitest", "run", "-c", "vitest.isolation.config.mjs", ...process.argv.slice(2)], { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ISOLATION_OUT: out } });
if (run.status !== 0) process.exit(run.status || 1);

const rows = fs.existsSync(out) ? fs.readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const count = (f) => rows.filter(f).length;
const accepted = rows.filter((r) => r.outcome === "ACCEPTED");
const errors = rows.filter((r) => r.outcome === "probe-error");
const kinds = new Set(rows.filter((r) => r.outcome === "refused").map((r) => r.kind));
console.log(`\nIsolation probe: ${count((r) => r.attack === "other-business" && r.outcome === "refused")} replays by another business refused, ${count((r) => r.attack === "other-department" && r.outcome === "refused")} by another department refused, over ${kinds.size} kinds of operation.`);
for (const r of accepted) console.error(`LEAK: ${r.attack} could run ${r.kind} with the ids at ${r.ids.join(", ")}`);
for (const r of errors) console.error(`Probe error (${r.kind}): ${r.message}`);
if (accepted.length || errors.length) process.exit(1);
console.log("No leak found.");
