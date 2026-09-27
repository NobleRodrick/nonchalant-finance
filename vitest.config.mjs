import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Same JSX runtime as Next.js (e-mail templates are rendered by the scheduled jobs).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,mjs}"],
    setupFiles: ["tests/support/setup.js"],
    globalSetup: ["tests/support/global-setup.js"],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
    pool: "forks",
  },
});
