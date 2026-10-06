import { describe, expect, it } from "vitest";
import { codePrefix, countersFromMovements, formatItemCode, inStock, movementEffect, stockAlert, unitLossValue } from "@/lib/rental/stock-math";
import { exportFileName, sheetCells, toCsv, toXlsx } from "@/lib/export/table-export";

const item = (c = {}) => ({ name: "Chairs", owned: 500, out: 50, damaged: 15, inRepair: 3, missing: 2, ...c });

describe("event rental stock", () => {
  it("in the store = owned − out − damaged − in repair − missing (the requirements' example)", () => {
    expect(inStock(item())).toBe(430);
  });

  it("each movement changes the right counters", () => {
    const run = (kind, q, from) => movementEffect(item(), kind, q, from).counters;
    expect(run("PURCHASED", 100)).toMatchObject({ owned: 600 });
    expect(run("ISSUED", 200)).toMatchObject({ out: 250 });
    expect(run("RETURNED", 50)).toMatchObject({ out: 0 });
    expect(run("DAMAGED", 3, "out")).toMatchObject({ out: 47, damaged: 18 });
    expect(run("DAMAGED", 3)).toMatchObject({ out: 50, damaged: 18 });
    expect(run("REPAIR_SENT", 5)).toMatchObject({ damaged: 10, inRepair: 8 });
    expect(run("REPAIRED", 3)).toMatchObject({ inRepair: 0 });
    expect(run("REPAIRED", 5, "damaged")).toMatchObject({ damaged: 10 });
    expect(run("MISSING", 2, "out")).toMatchObject({ out: 48, missing: 4 });
    expect(run("FOUND", 2)).toMatchObject({ missing: 0 });
    expect(run("WRITTEN_OFF", 2, "missing")).toMatchObject({ owned: 498, missing: 0 });
    expect(run("WRITTEN_OFF", 10, "damaged")).toMatchObject({ owned: 490, damaged: 5 });
    expect(run("ADJUSTED", -30)).toMatchObject({ owned: 470 });
    expect(run("TRANSFERRED", 500)).toMatchObject({ owned: 500, out: 50 });
  });

  it("refuses units the line does not have, with a clear message", () => {
    expect(() => movementEffect(item(), "ISSUED", 431)).toThrow("Only 430 Chairs in the store.");
    expect(() => movementEffect(item(), "RETURNED", 51)).toThrow("Only 50 Chairs out at events.");
    expect(() => movementEffect(item(), "FOUND", 3)).toThrow("Only 2 Chairs missing.");
    expect(() => movementEffect(item(), "ADJUSTED", -431)).toThrow(/Only 430/);
    expect(() => movementEffect(item(), "ISSUED", 0)).toThrow(/at least 1/);
  });

  it("the deltas of the movements add up to the counters", () => {
    let state = { name: "Plates", owned: 0, out: 0, damaged: 0, inRepair: 0, missing: 0 };
    const moves = [];
    for (const [kind, q, from] of [["OPENING", 200], ["ISSUED", 200], ["RETURNED", 195], ["DAMAGED", 3, "out"], ["MISSING", 2, "out"], ["REPAIR_SENT", 3], ["REPAIRED", 3], ["WRITTEN_OFF", 2, "missing"]]) {
      const e = movementEffect(state, kind, q, from);
      moves.push(e.deltas);
      state = { ...state, ...e.counters };
    }
    expect(countersFromMovements(moves)).toEqual({ owned: 198, out: 0, damaged: 0, inRepair: 0, missing: 0 });
  });

  it("warns low and empty lines; the loss value falls back to the purchase price", () => {
    expect(stockAlert({ owned: 100, lowStockLevel: 20, out: 85 })).toBe("LOW");
    expect(stockAlert({ owned: 100, out: 100 })).toBe("EMPTY");
    expect(stockAlert({ owned: 100, lowStockLevel: 20 })).toBe(null);
    expect(unitLossValue({ purchasePrice: 15000 })).toBe(15000);
    expect(unitLossValue({ purchasePrice: 15000, replacementValue: 18000 })).toBe(18000);
  });

  it("codes from names", () => {
    expect(codePrefix("Chairs")).toBe("CHR");
    expect(codePrefix("Tables")).toBe("TBL");
    expect(codePrefix("Gold charger plates")).toBe("GLD");
    expect(codePrefix("Vase")).toBe("VAS");
    expect(codePrefix("Éclairage")).toBe("ECL");
    expect(codePrefix("")).toBe("ITM");
    expect(formatItemCode("CHR", 7)).toBe("CHR-007");
  });
});

describe("table export", () => {
  const sheet = { name: "Stock", columns: [{ label: "Item", value: "name" }, { label: "Units", value: (r) => r.n }], rows: [{ name: 'Chairs, "gold"', n: 200 }, { name: "Tables", n: 0 }] };
  it("CSV quotes what needs it and starts with a BOM", () => {
    expect(sheetCells(sheet)).toEqual([["Item", "Units"], ['Chairs, "gold"', 200], ["Tables", 0]]);
    expect(toCsv(sheet)).toBe('﻿Item,Units\r\n"Chairs, ""gold""",200\r\nTables,0');
  });
  it("Excel: a zip with the workbook, numbers kept as numbers", () => {
    const bytes = toXlsx(sheet);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain("<v>200</v>");
    expect(text).toContain("Chairs, &quot;gold&quot;");
  });
  it("file names", () => {
    expect(exportFileName("Stock", "Deco Diva", "2026-10-05")).toBe("stock-deco-diva-2026-10-05");
  });
});
