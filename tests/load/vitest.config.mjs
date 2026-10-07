import { defineConfig } from "vitest/config";
import path from "node:path";

/** Seeds the load test's businesses (npm run test:load:seed); not part of the normal test run. */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../..") } },
  test: {
    environment: "node",
    include: ["tests/load/seed.load.mjs", "tests/load/stay-demo.load.mjs"],
    setupFiles: ["tests/support/setup.js"],
    globalSetup: ["tests/support/global-setup.js"],
    testTimeout: 1_800_000,
    hookTimeout: 600_000,
    pool: "forks",
  },
});
