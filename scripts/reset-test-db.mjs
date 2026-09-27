/**
 * Rebuilds a DISPOSABLE database from prisma/migrations (drop public schema, apply every
 * migration.sql in order). Used by the integration and end-to-end test suites.
 * Usage: TEST_DATABASE_URL=postgresql://... node scripts/reset-test-db.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

export async function resetTestDatabase(url = process.env.TEST_DATABASE_URL) {
  if (!url) throw new Error("TEST_DATABASE_URL is not set.");
  if (/supabase\.com|pooler/i.test(url) && process.env.ALLOW_REMOTE_TEST_DB !== "true") {
    throw new Error("Refusing to wipe a remote database. Point TEST_DATABASE_URL at a disposable local database.");
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    const dir = path.resolve("prisma/migrations");
    const migrations = fs
      .readdirSync(dir)
      .filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
      .sort();
    for (const m of migrations) {
      await client.query(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
    }
    return migrations;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  resetTestDatabase()
    .then((m) => console.log(`Applied ${m.length} migrations: ${m.join(", ")}`))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
