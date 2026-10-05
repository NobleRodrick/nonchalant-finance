import { describe, expect, it } from "vitest";
import { generateTempPassword, validatePasswordStrength } from "@/lib/password-utils";
import { ROLE_PERMISSIONS, roleAllowed } from "@/lib/permissions";

describe("password policy", () => {
  it("accepts a reasonable password", () => {
    expect(validatePasswordStrength("Okra-pepper-77")).toBe(null);
    expect(validatePasswordStrength("Kola-24680", { email: "ada@x.cm", name: "Ada Head" })).toBe(null);
  });
  it("refuses short, letter-only, digit-only and over-long passwords", () => {
    expect(validatePasswordStrength("Ab1")).toMatch(/8 characters/);
    expect(validatePasswordStrength("abcdefghij")).toMatch(/letters and numbers/);
    expect(validatePasswordStrength("1234567890")).toMatch(/letters and numbers/);
    expect(validatePasswordStrength(`a1${"é".repeat(40)}`)).toMatch(/too long/);
  });
  it("refuses common passwords, even with digits or symbols around them", () => {
    for (const p of ["Password123", "password1!", "Azerty2026", "Qwerty123", "1Welcome!", "aaaaaaaa1"]) {
      expect(validatePasswordStrength(p), p).toMatch(/too easy/);
    }
  });
  it("refuses the person's e-mail or name", () => {
    expect(validatePasswordStrength("kamga.paul99", { email: "kamga.paul@x.cm" })).toMatch(/e-mail/);
    expect(validatePasswordStrength("Kamga2026", { name: "Paul Kamga" })).toMatch(/your name/);
  });
  it("temporary passwords always pass the policy", () => {
    for (let i = 0; i < 200; i++) expect(validatePasswordStrength(generateTempPassword())).toBe(null);
  });
});

describe("the Boss running a department with no head (OWNER)", () => {
  it("has everything a head has, plus his own oversight", () => {
    for (const p of ROLE_PERMISSIONS.HEAD) expect(ROLE_PERMISSIONS.OWNER.has(p)).toBe(true);
    for (const p of ROLE_PERMISSIONS.ADMIN) expect(ROLE_PERMISSIONS.OWNER.has(p)).toBe(true);
  });
  it("opens head pages and Boss pages", () => {
    expect(roleAllowed(["HEAD"], "OWNER")).toBe(true);
    expect(roleAllowed(["ADMIN"], "OWNER")).toBe(true);
    expect(roleAllowed(["HEAD"], "ADMIN")).toBe(false);
  });
});
