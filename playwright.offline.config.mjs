import { defineConfig, devices } from "@playwright/test";

/**
 * Offline end-to-end test: runs the production build (service worker on) and stops/starts the
 * server itself to cut the connection for real (npm run test:offline builds first).
 * Requires TEST_DATABASE_URL (a disposable database, rebuilt before the run).
 */
export default defineConfig({
  testDir: "./e2e-offline",
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.mjs",
  use: {
    baseURL: `http://localhost:${Number(process.env.OFFLINE_E2E_PORT || 3200)}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
