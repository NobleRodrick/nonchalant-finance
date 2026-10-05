import { describe, expect, it } from "vitest";
import { hasDb, loginAs, ok, setupStayOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { saveRoom } from "@/actions/rooms";
import { reportPeriod, sendStayReports } from "@/lib/rooms/periodic-reports";

describe("report periods of the automatic reports (pure)", () => {
  it("daily: yesterday; weekly: last Monday to Sunday", () => {
    expect(reportPeriod("daily", "2026-10-05")).toEqual({ fromKey: "2026-10-04", toKey: "2026-10-04" });
    expect(reportPeriod("weekly", "2026-10-05")).toEqual({ fromKey: "2026-09-28", toKey: "2026-10-04" }); // a Monday
    expect(reportPeriod("weekly", "2026-10-07")).toEqual({ fromKey: "2026-09-28", toKey: "2026-10-04" });
  });
});

describe.skipIf(!hasDb)("Executive Stay: automatic daily and weekly reports", () => {
  it("reach the Boss and every head in the app (e-mail when configured), once per period", async () => {
    const o = await setupStayOrganization("Auto");
    await loginAs(o.head.id);
    ok(await saveRoom({ departmentId: o.stay.id, name: "Apartment 1", nightlyRate: 30000 }));
    expect(await sendStayReports({ organizationId: o.org.id, timeZone: "Africa/Douala", kind: "daily" })).toBe(1);
    expect(await sendStayReports({ organizationId: o.org.id, timeZone: "Africa/Douala", kind: "daily" })).toBe(0); // a retry sends nothing twice
    expect(await sendStayReports({ organizationId: o.org.id, timeZone: "Africa/Douala", kind: "weekly" })).toBe(1);
    const notes = await db.notification.findMany({ where: { organizationId: o.org.id, kind: { in: ["STAY_DAILY_REPORT", "STAY_WEEKLY_REPORT"] } } });
    expect(notes).toHaveLength(6); // 2 reports × (Boss + 2 heads)
    const daily = notes.find((n) => n.kind === "STAY_DAILY_REPORT" && n.userId === o.boss.id);
    const { fromKey } = reportPeriod("daily", today());
    expect(daily.href).toBe(`/d/${o.stay.id}/reports?period=custom&from=${fromKey}&to=${fromKey}`);
    expect(daily.body).toMatch(/Revenue 0 FCFA · net income 0 FCFA · 0\/1 occupied/);
  });
});
