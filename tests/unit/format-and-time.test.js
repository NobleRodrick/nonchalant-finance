import { describe, expect, it } from "vitest";
import { formatMoney, formatStatementAmount, formatSigned, formatPlates, formatPct, countOf } from "@/lib/format";
import { formatReference } from "@/lib/documents/sequence";
import { dayBounds, toDateKey, startOfDateKey, addDaysToKey, periodRange, previousRange } from "@/lib/timezone";
import { getDomain, departmentNavigation, DOMAIN_LIST } from "@/lib/domains/registry";
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS, personLabel, roleHasPermission } from "@/lib/permissions";

describe("formatting", () => {
  it("formats FCFA, statement negatives, signs, plates and percentages", () => {
    expect(formatMoney(1250000)).toBe("1 250 000 FCFA");
    expect(formatMoney(-500)).toBe("−500 FCFA");
    expect(formatStatementAmount(-12500)).toBe("(12 500)");
    expect(formatSigned(2000)).toBe("+2 000");
    expect(formatPlates(12)).toBe("12");
    expect(formatPct(12.34)).toBe("+12.3%");
    expect(formatPct(null)).toBe("—");
  });
  it("formats reference numbers", () => {
    expect(formatReference("S", 1)).toBe("S-0001");
    expect(formatReference("S", 12345)).toBe("S-12345");
  });
});

describe("business days in Africa/Douala", () => {
  it("cuts the day at local midnight", () => {
    const { start, end, key } = dayBounds(new Date("2026-10-05T23:30:00Z"));
    expect(key).toBe("2026-10-06");
    expect(start.toISOString()).toBe("2026-10-05T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-06T22:59:59.999Z");
    expect(toDateKey(new Date("2026-10-05T22:59:59Z"))).toBe("2026-10-05");
    expect(startOfDateKey("2026-10-05").toISOString()).toBe("2026-10-04T23:00:00.000Z");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("builds week and month ranges and the previous period", () => {
    expect(periodRange("week", "2026-10-07")).toEqual({ fromKey: "2026-10-05", toKey: "2026-10-11" });
    expect(periodRange("month", "2026-02-10")).toEqual({ fromKey: "2026-02-01", toKey: "2026-02-28" });
    expect(previousRange("2026-03-01", "2026-03-31", "month")).toEqual({ fromKey: "2026-02-01", toKey: "2026-02-28" });
  });
});

describe("department types and roles", () => {
  it("the restaurant, event venue, rooms, event rental and property rental types are enabled; every type has a label and description", () => {
    expect(DOMAIN_LIST.map((d) => d.key)).toEqual(["RESTAURANT", "EVENT_VENUE", "ROOM_RENTAL", "BAR", "PRESSING", "CAR_WASH", "MATERIAL_RENTAL", "PROPERTY_RENTAL", "SHOP", "OTHER"]);
    expect(DOMAIN_LIST.filter((d) => d.enabled).map((d) => d.key)).toEqual(["RESTAURANT", "EVENT_VENUE", "ROOM_RENTAL", "MATERIAL_RENTAL", "PROPERTY_RENTAL"]);
    expect(getDomain("PRESSING").label).toBe("Pressing (dress wash)");
    expect(DOMAIN_LIST.every((d) => d.description.length > 10)).toBe(true);
  });
  it("navigation depends on the department type and the role", () => {
    const rest = { id: "d1", domain: "RESTAURANT" };
    expect(departmentNavigation(rest, "HEAD").map((n) => n.id)).toEqual(["home", "sell", "menu-stock", "money", "debts", "cash", "report", "history"]);
    expect(departmentNavigation(rest, "ADMIN").map((n) => n.id)).toEqual(["home", "menu-stock", "money", "debts", "report", "history"]);
    expect(departmentNavigation({ id: "d2", domain: "BAR" }, "HEAD").map((n) => n.id)).toEqual(["home"]);
    expect(departmentNavigation(rest, "HEAD")[1].href).toBe("/d/d1/sell");
    expect(departmentNavigation(rest, null)).toEqual([]);
  });
  it("two roles: the Boss oversees, department heads run their departments", () => {
    for (const p of [PERMISSIONS.SALES_CREATE, PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.EXPENSES_CREATE, PERMISSIONS.HANDOVER_CREATE, PERMISSIONS.REPORTS_SUBMIT, PERMISSIONS.RECORDS_VOID]) {
      expect(roleHasPermission("HEAD", p)).toBe(true);
      expect(roleHasPermission("ADMIN", p)).toBe(false);
    }
    for (const p of [PERMISSIONS.REPORTS_REVIEW, PERMISSIONS.ORGANIZATION_MANAGE, PERMISSIONS.HANDOVER_CONFIRM]) {
      expect(roleHasPermission("ADMIN", p)).toBe(true);
      expect(roleHasPermission("HEAD", p)).toBe(false);
    }
    // Two stored roles; OWNER is only the Boss's role in a department that has no head yet.
    expect(ROLES).toEqual(["ADMIN", "HEAD"]);
    expect(Object.keys(ROLE_PERMISSIONS)).toEqual(["ADMIN", "HEAD", "OWNER"]);
    expect(personLabel({ role: "HEAD", title: "Accountant" })).toBe("Accountant · Department head");
    expect(personLabel({ role: "HEAD", title: null })).toBe("Department head");
    expect(personLabel({ role: "ADMIN", title: "Owner" })).toBe("Boss");
  });
});

describe("countOf", () => {
  it("uses the singular for one and the plural otherwise", () => {
    expect(countOf(1, "plate")).toBe("1 plate");
    expect(countOf(0, "plate")).toBe("0 plates");
    expect(countOf(2, "dish", "dishes")).toBe("2 dishes");
  });
});
