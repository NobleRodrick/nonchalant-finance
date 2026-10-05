import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, loginAs, ok, setupVenueOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { removePriceRule, saveHall, savePriceRule } from "@/actions/venue";
import { addDish } from "@/actions/menu-stock";
import { hallOf } from "@/lib/venue/hall-service";
import { priceForDate } from "@/lib/venue/pricing";

describe.skipIf(!hasDb)("event venue: the hall and its prices", () => {
  let o;
  let other;
  beforeAll(async () => {
    o = await setupVenueOrganization("Hall");
    other = await setupVenueOrganization("Other");
  });

  it("the head sets up the hall, then changes it (audited); bad input is refused", async () => {
    await loginAs(o.head.id);
    fails(await saveHall({ departmentId: o.venue.id, name: "S", basePrice: 1000 }), /hall's name/);
    fails(await saveHall({ departmentId: o.venue.id, name: "Salle", basePrice: 10.5 }), /whole number/);
    fails(await saveHall({ departmentId: o.venue.id, name: "Salle", basePrice: 1000, reservationHoldDays: 0 }), /reservation hold/);
    const created = ok(await saveHall({ departmentId: o.venue.id, name: "Salle Majestueuse", capacity: 500, basePrice: 300000, reservationHoldDays: 7 }));
    const again = ok(await saveHall({ departmentId: o.venue.id, name: "Salle Majestueuse", capacity: 600, basePrice: 350000, reservationHoldDays: 10 }));
    expect(again.venueId).toBe(created.venueId);
    const hall = await hallOf(o.venue.id);
    expect(hall).toMatchObject({ capacity: 600, basePrice: 350000, reservationHoldDays: 10 });
    expect(await db.auditEvent.count({ where: { entityId: created.venueId, action: { in: ["VENUE_CREATED", "VENUE_UPDATED"] } } })).toBe(2);
  });

  it("prices by day of the week, season and special date; one price per day and date", async () => {
    await loginAs(o.head.id);
    const venueId = (await hallOf(o.venue.id)).id;
    const sat = ok(await savePriceRule({ departmentId: o.venue.id, venueId, kind: "WEEKDAY", weekday: 6, price: 500000 }));
    fails(await savePriceRule({ departmentId: o.venue.id, venueId, kind: "WEEKDAY", weekday: 6, price: 1 }), /already has a price/);
    ok(await savePriceRule({ departmentId: o.venue.id, venueId, id: sat.ruleId, kind: "WEEKDAY", weekday: 6, price: 550000 }));
    fails(await savePriceRule({ departmentId: o.venue.id, venueId, kind: "SEASON", startKey: "2026-12-20", endKey: "2026-12-01", price: 1, label: "X" }), /end on or after/);
    fails(await savePriceRule({ departmentId: o.venue.id, venueId, kind: "SEASON", startKey: "2026-12-01", endKey: "2026-12-31", price: 1 }), /Name the season/);
    ok(await savePriceRule({ departmentId: o.venue.id, venueId, kind: "SEASON", startKey: "2026-12-01", endKey: "2026-12-31", price: 700000, label: "December" }));
    const nye = ok(await savePriceRule({ departmentId: o.venue.id, venueId, kind: "SPECIAL_DATE", startKey: "2026-12-31", price: 1200000, label: "New Year's Eve" }));
    fails(await savePriceRule({ departmentId: o.venue.id, venueId, kind: "SPECIAL_DATE", startKey: "2026-12-31", price: 1 }), /already has a special price/);

    const hall = await hallOf(o.venue.id);
    expect(priceForDate("2026-12-31", hall).price).toBe(1200000);
    expect(priceForDate("2026-12-12", hall).price).toBe(700000);
    expect(priceForDate("2026-11-07", hall).price).toBe(550000);
    expect(priceForDate("2026-11-09", hall).price).toBe(350000);

    ok(await removePriceRule({ departmentId: o.venue.id, ruleId: nye.ruleId }));
    expect(priceForDate("2026-12-31", await hallOf(o.venue.id)).price).toBe(700000);
  });

  it("only the venue's heads change it; the Boss reads it; other types and organizations are refused", async () => {
    const venueId = (await hallOf(o.venue.id)).id;
    await loginAs(o.boss.id);
    fails(await saveHall({ departmentId: o.venue.id, name: "Boss hall", basePrice: 1 }), /role does not allow/);
    await loginAs(o.restHead.id);
    fails(await saveHall({ departmentId: o.venue.id, name: "Intruder", basePrice: 1 }), /not assigned/);
    await loginAs(o.head.id);
    fails(await saveHall({ departmentId: o.restaurant.id, name: "Wrong type", basePrice: 1 }), /not assigned|only available in event venue/);
    fails(await addDish({ departmentId: o.venue.id, name: "Rice", unitPrice: 1000 }), /only available in restaurant departments/);
    // Another organization's head cannot touch this hall, even with its ids.
    await loginAs(other.head.id);
    fails(await savePriceRule({ departmentId: o.venue.id, venueId, kind: "WEEKDAY", weekday: 1, price: 1 }), /not found|not assigned/i);
    fails(await savePriceRule({ departmentId: other.venue.id, venueId, kind: "WEEKDAY", weekday: 1, price: 1 }), /Set up the hall first/);
  });
});

describe.skipIf(!hasDb)("a missing id never selects another record", () => {
  it("a Boss decision, a price removal or a person's update without its id is refused", async () => {
    const { reviewReport } = await import("@/actions/daily-report");
    const { updateEmployee } = await import("@/actions/organization");
    const o = await setupVenueOrganization("Ids");
    await loginAs(o.boss.id);
    fails(await reviewReport({ decision: "APPROVED" }), /not found/i);
    fails(await updateEmployee({ title: "Hijacked" }), /not found/i);
    await loginAs(o.head.id);
    fails(await removePriceRule({ departmentId: o.venue.id }), /not found/i);
  });
});
