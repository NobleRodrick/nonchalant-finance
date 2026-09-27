import { resetTestDatabase } from "../scripts/reset-test-db.mjs";

export default async function globalSetup() {
  if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a disposable database to run E2E tests.");
  await resetTestDatabase();
}
