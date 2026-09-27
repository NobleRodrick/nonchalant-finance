import { resetTestDatabase } from "../../scripts/reset-test-db.mjs";

/**
 * Integration tests run against a DISPOSABLE PostgreSQL database (TEST_DATABASE_URL),
 * rebuilt from the checked-in migrations — which also proves a fresh database migrates
 * cleanly.
 */
export default async function globalSetup() {
  if (!process.env.TEST_DATABASE_URL) {
    console.warn("[tests] TEST_DATABASE_URL not set — integration tests will be skipped.");
    return;
  }
  await resetTestDatabase();
}
