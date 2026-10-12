import { describe, expect, it } from "vitest";
import { safePath } from "@/lib/safe-path";

describe("redirect after sign-in stays on this site", () => {
  it("keeps paths of the app", () => {
    for (const p of ["/home", "/d/abc/sell?date=2026-10-01", "/boss#cash"]) expect(safePath(p)).toBe(p);
  });
  it("refuses other sites, however written", () => {
    for (const p of ["//evil.com", "/\t/evil.com", "/\n/evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/\u0000/x", "", null, 42, "/%09/evil.com".replace("%09", "\t")]) expect(safePath(p)).toBe("/home");
  });
  it("a percent-encoded tab stays a harmless path of this site", () => {
    expect(safePath("/%09/evil.com")).toBe("/%09/evil.com");
  });
});
