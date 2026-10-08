import { defineConfig } from "vitest/config";
import base from "./vitest.config.mjs";

/** Integration tests (unit tests make no writes) + the isolation probe (tests/support/isolation-attacks.js). */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["tests/integration/**/*.test.{js,mjs}"],
    setupFiles: [...base.test.setupFiles, "tests/support/isolation-probe.js"],
  },
});
