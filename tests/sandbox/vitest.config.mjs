import { defineConfig } from "vitest/config";
import path from "node:path";

/** Finance Copilot sandbox run (tests/sandbox/copilot.sandbox.mjs); not part of the normal test run. */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../..") } },
  test: {
    environment: "node",
    include: ["tests/sandbox/copilot.sandbox.mjs"],
    setupFiles: ["tests/support/setup.js"],
    globalSetup: ["tests/support/global-setup.js"],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: "forks",
  },
});
