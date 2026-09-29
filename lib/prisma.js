import { PrismaClient } from "@prisma/client";

const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS || 500);

/**
 * Creates the Prisma client.
 *
 * Default: the standard Prisma query engine (what production uses).
 * Optional: PRISMA_DRIVER_ADAPTER=pg uses the node-postgres driver adapter. This is used by
 * the automated test/E2E harness and can also be used on serverless hosts; it requires the
 * client to be generated with the "driverAdapters" preview feature (see scripts/test-db).
 */
function createPrismaClient() {
  // Slow queries are logged (one JSON line) so they can be found in the Vercel logs.
  const log = [{ emit: "event", level: "query" }];
  const client =
    process.env.PRISMA_DRIVER_ADAPTER === "pg"
      ? new PrismaClient({ log, adapter: new (require("@prisma/adapter-pg").PrismaPg)({ connectionString: process.env.DATABASE_URL }) })
      : new PrismaClient({ log });
  client.$on("query", (e) => {
    if (process.env.NODE_ENV === "production" && e.duration >= SLOW_QUERY_MS) {
      console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event: "slow_query", ms: e.duration, query: String(e.query).slice(0, 400) }));
    }
  });
  return client;
}

export const db = globalThis.prisma || createPrismaClient();

// Reuse one client across hot reloads in development.
if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = db;
}
