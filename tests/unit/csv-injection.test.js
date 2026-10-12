import { describe, expect, it } from "vitest";
import { neutralizeFormula, toCsv } from "@/lib/export/table-export";

describe("CSV exports never run a formula typed into the app", () => {
  it("text starting like a formula stays text; numbers stay numbers", () => {
    for (const bad of ["=HYPERLINK(\"http://x\",\"Click\")", "+cmd|' /C calc'!A0", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) expect(neutralizeFormula(bad)).toBe(`'${bad}`);
    for (const fine of ["Rice", "-1 500", "+237 677 000 000", "12,5", -500, 1500, null, "a=b"]) expect(neutralizeFormula(fine)).toBe(fine);
  });

  it("toCsv writes them escaped", () => {
    const csv = toCsv({ columns: [{ label: "Client", value: "name" }, { label: "Amount", value: "amount" }], rows: [{ name: "=1+1", amount: -500 }] });
    expect(csv.split("\r\n")[1]).toBe("'=1+1,-500");
  });
});
