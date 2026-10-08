import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LATEST_MIGRATION } from "@/lib/schema-version";

describe("schema version", () => {
  it("names the newest migration folder (update lib/schema-version.js with every new migration)", () => {
    const dir = path.resolve("prisma/migrations");
    const folders = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort();
    expect(LATEST_MIGRATION).toBe(folders.at(-1));
  });
});
