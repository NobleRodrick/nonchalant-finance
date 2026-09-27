import { PrismaClient } from "@prisma/client";

/**
 * Creates the Prisma client.
 *
 * Default: the standard Prisma query engine (what production uses).
 * Optional: PRISMA_DRIVER_ADAPTER=pg uses the node-postgres driver adapter. This is used by
 * the automated test/E2E harness and can also be used on serverless hosts; it requires the
 * client to be generated with the "driverAdapters" preview feature (see scripts/test-db).
 */
function createPrismaClient() {
  if (process.env.PRISMA_DRIVER_ADAPTER === "pg") {
    const { PrismaPg } = require("@prisma/adapter-pg");
    return new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }
  return new PrismaClient();
}

export const db = globalThis.prisma || createPrismaClient();

// Reuse one client across hot reloads in development.
if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = db;
}
