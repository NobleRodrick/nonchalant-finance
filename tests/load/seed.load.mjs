import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasDb, loginAs, ok, setupStayOrganization, setupVenueOrganization } from "../support/fixtures";
import { saveHall, saveVenueAsset } from "@/actions/venue";
import { saveRoom } from "@/actions/rooms";
import { addDish } from "@/actions/menu-stock";
import { headerJar } from "../support/request-context";

/**
 * Seeds LOAD_ORGS businesses (default 180), each with a Boss, an event venue with its head and a
 * restaurant with its head (3 people per business: 540 by default), a hall and a dish, plus
 * LOAD_STAY_ORGS guest houses (default 60: 180 people, 5 apartments each), and writes their ids
 * to LOAD_SEED_OUT for scripts/load-test.mjs. Runs against the disposable test database.
 */
describe.skipIf(!hasDb)("load test seed", () => {
  it("creates the businesses", async () => {
    const n = Number(process.env.LOAD_ORGS || 180);
    const orgs = [];
    for (let i = 0; i < n; i += 1) {
      headerJar.set("x-forwarded-for", `10.0.${Math.floor(i / 250)}.${(i % 250) + 1}`); // each business registers from its own address
      const o = await setupVenueOrganization(`Load ${i}`);
      await loginAs(o.head.id);
      ok(await saveHall({ departmentId: o.venue.id, name: "Salle", basePrice: 500000 }));
      ok(await saveVenueAsset({ departmentId: o.venue.id, name: "Chairs", category: "CHAIRS", quantity: 300, unitValue: 8000 }));
      await loginAs(o.restHead.id);
      const dish = ok(await addDish({ departmentId: o.restaurant.id, name: "Ndolé", unitPrice: 2500, openingPlates: 100000 })).dish;
      orgs.push({ orgId: o.org.id, bossId: o.boss.id, venueHeadId: o.head.id, restHeadId: o.restHead.id, venueId: o.venue.id, restaurantId: o.restaurant.id, dishId: dish.id });
    }
    // Guest houses (Executive Stay): LOAD_STAY_ORGS businesses × (Boss + 2 heads), 5 apartments each.
    const stays = [];
    for (let i = 0; i < Number(process.env.LOAD_STAY_ORGS || 60); i += 1) {
      headerJar.set("x-forwarded-for", `10.1.${Math.floor(i / 250)}.${(i % 250) + 1}`);
      const o = await setupStayOrganization(`Load stay ${i}`);
      await loginAs(o.head.id);
      const roomIds = [];
      for (let r = 1; r <= 5; r += 1) roomIds.push(ok(await saveRoom({ departmentId: o.stay.id, name: `Apartment ${r}`, nightlyRate: 30000 })).roomId);
      stays.push({ orgId: o.org.id, bossId: o.boss.id, headId: o.head.id, head2Id: o.head2.id, stayId: o.stay.id, roomIds });
    }
    writeFileSync(process.env.LOAD_SEED_OUT || "load-seed.json", JSON.stringify({ orgs, stays }, null, 1));
    expect(orgs).toHaveLength(n);
  });
});
