import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Plain-language copy uses apostrophes and quotes; escaping them adds no safety in JSX text.
  { rules: { "react/no-unescaped-entities": "off" } },
  // Catch names used without being imported or declared, and imports left unused.
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.serviceworker } },
    rules: { "no-undef": "error", "no-unused-vars": ["error", { args: "none", ignoreRestSiblings: true, caughtErrors: "none" }] },
  },
  { files: ["tests/**", "e2e/**", "e2e-offline/**"], languageOptions: { globals: { ...globals.vitest } } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    ".scratch/**",
  ]),
]);

export default eslintConfig;
