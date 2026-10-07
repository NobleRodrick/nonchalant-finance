import { defineConfig } from "vitest/config";
import path from "node:path";

/** Checks the database a load test left (npm run test:load:verify): no reset before. */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../..") } },
  test: {
    environment: "node",
    include: ["tests/load/verify.load.mjs"],
    setupFiles: ["tests/support/setup.js"],
    testTimeout: 1_800_000,
    pool: "forks",
  },
});
