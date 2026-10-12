/**
 * Bundles the Finance Copilot sandbox (tests/sandbox/standalone.mjs) into one file:
 * dist-sandbox/copilot-sandbox.mjs. Only the Prisma client stays outside (it needs its engine).
 */
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const shim = (f) => path.join(root, "tests/sandbox/shims", f);
await build({
  entryPoints: [path.join(root, "tests/sandbox/standalone.mjs")],
  outfile: path.join(root, "dist-sandbox/copilot-sandbox.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  jsx: "automatic",
  loader: { ".js": "jsx" },
  alias: { "@": root, "next/headers": shim("next-headers.mjs"), "next/cache": shim("next-cache.mjs"), "next/navigation": shim("next-navigation.mjs") },
  external: ["@prisma/client", ".prisma/client", "@prisma/adapter-pg", "pg"],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
console.log("dist-sandbox/copilot-sandbox.mjs");
