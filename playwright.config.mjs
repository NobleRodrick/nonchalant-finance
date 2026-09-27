import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3100);

/**
 * End-to-end tests (docs/RESTAURANT_V2_IMPLEMENTATION_PLAN.md §10.5). Requires TEST_DATABASE_URL
 * (a disposable database; it is rebuilt from the migrations before the run).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.mjs",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /navigation\.spec/ },
  ],
  webServer: {
    command: `npx next dev --webpack -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL || "",
      DIRECT_URL: process.env.TEST_DATABASE_URL || "",
      JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234567",
      NEXT_TELEMETRY_DISABLED: "1",
      GEMINI_API_KEY: "",
    },
  },
});
