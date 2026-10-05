import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, loginAs, ok, setupVenueOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDaysToKey } from "@/lib/timezone";
import { createBooking, saveAssetCheck, saveHall, saveVenueAsset, settleAssetIncident } from "@/actions/venue";
import { bookingChecks } from "@/lib/venue/asset-queries";
import { bookingDetail } from "@/lib/venue/booking-queries";
import { compareChecks, incidentTotals, normalizeLine } from "@/lib/venue/asset-math";

describe("asset checks (pure)", () => {
  it("normalizes lines and finds what the event changed", () => {
    expect(normalizeLine({ expected: 100, good: 95, damaged: 3 })).toMatchObject({ missing: 2, valid: true });
    expect(normalizeLine({ expected: 10, good: 9, damaged: 3, missing: 0 }).valid).toBe(false);
    expect(compareChecks([{ assetId: "a", damaged: 2, missing: 0 }], [{ assetId: "a", damaged: 5, missing: 1 }, { assetId: "b", damaged: 0, missing: 2 }])).toEqual([
      { assetId: "a", newDamaged: 3, newMissing: 1, repaired: 0, found: 0 },
      { assetId: "b", newDamaged: 0, newMissing: 2, repaired: 0, found: 0 },
    ]);
    expect(incidentTotals([{ status: "OPEN", cost: 100, quantity: 1 }, { status: "CHARGED", cost: 50, quantity: 2 }, { status: "LOSS", cost: 30, quantity: 1 }])).toMatchObject({ open: 100, charged: 50, loss: 30, units: 4 });
  });
});

describe.skipIf(!hasDb)("event venue: assets before and after an event", () => {
  let o;
  let chairs;
  let tables;
  let booking;
  beforeAll(async () => {
    o = await setupVenueOrganization("Assets");
    await loginAs(o.head.id);
    ok(await saveHall({ departmentId: o.venue.id, name: "Salle", basePrice: 500000 }));
    chairs = ok(await saveVenueAsset({ departmentId: o.venue.id, name: "Chairs", category: "CHAIRS", quantity: 200, unitValue: 8000 })).assetId;
    tables = ok(await saveVenueAsset({ departmentId: o.venue.id, name: "Round tables", category: "TABLES", quantity: 20, unitValue: 45000 })).assetId;
    booking = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: addDaysToKey(today(), 3), eventType: "Wedding", client: { name: "Ngono", phone: "1" } }));
    fails(await saveVenueAsset({ departmentId: o.venue.id, name: "Chairs", category: "CHAIRS", quantity: 1 }), /already exists/);
  });

  it("the check before the event: counts must add up to what is owned", async () => {
    fails(await saveAssetCheck({ departmentId: o.venue.id, bookingId: booking.bookingId, phase: "BEFORE", lines: [{ assetId: chairs, good: 199, damaged: 3, missing: 0 }] }), /must equal the 200 owned/);
    ok(await saveAssetCheck({ departmentId: o.venue.id, bookingId: booking.bookingId, phase: "BEFORE", lines: [{ assetId: chairs, good: 198, damaged: 2 }, { assetId: tables, good: 20 }] }));
  });

  it("the check after: newly damaged and missing units become differences with their estimated cost", async () => {
    const r = ok(await saveAssetCheck({ departmentId: o.venue.id, bookingId: booking.bookingId, phase: "AFTER", lines: [{ assetId: chairs, good: 192, damaged: 5, missing: 3 }, { assetId: tables, good: 19, damaged: 1 }] }));
    expect(r.incidents).toEqual([
      { asset: "Chairs", kind: "DAMAGED", quantity: 3, cost: 24000 },
      { asset: "Chairs", kind: "MISSING", quantity: 3, cost: 24000 },
      { asset: "Round tables", kind: "DAMAGED", quantity: 1, cost: 45000 },
    ]);
    fails(await saveAssetCheck({ departmentId: o.venue.id, bookingId: booking.bookingId, phase: "BEFORE", lines: [{ assetId: chairs, good: 200 }] }), /check before can no longer change/);
  });

  it("settling: charged to the client (a booking charge), a loss (missing units leave the inventory), resolved", async () => {
    const { incidents } = await bookingChecks(o.venue.id, booking.bookingId);
    const [damagedChairs, missingChairs, table] = incidents;
    ok(await settleAssetIncident({ departmentId: o.venue.id, incidentId: damagedChairs.id, outcome: "CHARGE", cost: 20000, note: "Client agreed" }));
    ok(await settleAssetIncident({ departmentId: o.venue.id, incidentId: missingChairs.id, outcome: "LOSS", responsibility: "UNKNOWN" }));
    ok(await settleAssetIncident({ departmentId: o.venue.id, incidentId: table.id, outcome: "RESOLVED", cost: 0, note: "Repaired by our staff" }));
    fails(await settleAssetIncident({ departmentId: o.venue.id, incidentId: table.id, outcome: "LOSS" }), /already settled/);
    const detail = await bookingDetail({ departmentId: o.venue.id, bookingId: booking.bookingId, todayKey: today() });
    expect(detail.charges.map((c) => [c.kind, c.label, c.amount])).toEqual([["DAMAGE", "3 × Chairs damaged", 20000]]);
    expect(detail.figures.total).toBe(520000);
    expect((await db.venueAsset.findUnique({ where: { id: chairs } })).quantity).toBe(197);
    const after = await bookingChecks(o.venue.id, booking.bookingId);
    expect(after.incidents.map((i) => i.status)).toEqual(["CHARGED", "LOSS", "RESOLVED"]);
    fails(await saveAssetCheck({ departmentId: o.venue.id, bookingId: booking.bookingId, phase: "AFTER", lines: [{ assetId: chairs, good: 197 }] }), /already settled/);
  });

  it("the Boss cannot check assets; another department cannot see them", async () => {
    await loginAs(o.boss.id);
    fails(await saveAssetCheck({ departmentId: o.venue.id, bookingId: booking.bookingId, phase: "BEFORE", lines: [] }), /role does not allow/);
    const other = await setupVenueOrganization("Other");
    expect((await bookingChecks(other.venue.id, booking.bookingId)).incidents).toEqual([]);
  });
});
