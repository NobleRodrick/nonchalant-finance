import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasDb, key, loginAs, ok, setupPropertyOrganization, setupRentalOrganization, setupStayOrganization, setupTradeOrganization, setupVenueOrganization } from "../support/fixtures";
import { tradeOperation } from "@/actions/trade";
import { propertyOperation } from "@/actions/property";
import { db } from "@/lib/prisma";
import { setAccountingLevel } from "@/lib/accounting/company-service";
import { syncCompany } from "@/lib/accounting/sync";
import { saveHall, saveVenueAsset } from "@/actions/venue";
import { saveRoom } from "@/actions/rooms";
import { saveRentalItem } from "@/actions/rental";
import { addDish } from "@/actions/menu-stock";
import { headerJar } from "../support/request-context";

/**
 * Seeds LOAD_ORGS businesses (default 180), each with a Boss, an event venue with its head and a
 * restaurant with its head (3 people per business: 540 by default), a hall and a dish, plus
 * LOAD_STAY_ORGS guest houses (default 60: 180 people, 5 apartments each), LOAD_RENTAL_ORGS event
 * rentals (default 60: 180 people, chairs / tables / plates in stock), and writes their ids
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
    // Event rentals (Deco Diva): LOAD_RENTAL_ORGS businesses × (Boss + 2 heads), 3 stock lines each.
    const rentals = [];
    for (let i = 0; i < Number(process.env.LOAD_RENTAL_ORGS || 60); i += 1) {
      headerJar.set("x-forwarded-for", `10.2.${Math.floor(i / 250)}.${(i % 250) + 1}`);
      const o = await setupRentalOrganization(`Load rental ${i}`);
      await loginAs(o.head.id, o.deco.id);
      const itemIds = [];
      for (const [name, category, rentalPrice, openingQuantity] of [["Chairs", "Chairs", 500, 300], ["Tables", "Tables", 3000, 40], ["Plates", "Tableware", 200, 500]]) {
        itemIds.push(ok(await saveRentalItem({ departmentId: o.deco.id, name, category, rentalPrice, purchasePrice: rentalPrice * 10, openingQuantity })).itemId);
      }
      rentals.push({ orgId: o.org.id, bossId: o.boss.id, headId: o.head.id, head2Id: o.head2.id, rentalId: o.deco.id, itemIds });
    }
    // Office rentals (Place Étoilée): LOAD_PROPERTY_ORGS businesses × (Boss + 2 heads), 6 offices with
    // contracts; their company keeps Full accounting (the books update while they work).
    const properties = [];
    for (let i = 0; i < Number(process.env.LOAD_PROPERTY_ORGS || 60); i += 1) {
      headerJar.set("x-forwarded-for", `10.3.${Math.floor(i / 250)}.${(i % 250) + 1}`);
      const o = await setupPropertyOrganization(`Load property ${i}`);
      await loginAs(o.head.id, o.rentals.id);
      const leaseIds = [];
      for (let u = 1; u <= 6; u += 1) {
        const unitId = ok(await propertyOperation("property.unit.save", { departmentId: o.rentals.id, buildingId: u % 2 ? o.etoilee.id : o.main.id, name: `Office ${u}`, listRent: 100000 + u * 10000 })).unitId;
        leaseIds.push(ok(await propertyOperation("property.lease.create", { departmentId: o.rentals.id, unitId, tenant: { name: `Tenant ${i}-${u}` }, startKey: "2026-08-01", dueDay: 5, status: "ACTIVE" })).leaseId);
      }
      ok(await propertyOperation("property.payment.record", { departmentId: o.rentals.id, leaseId: leaseIds[0], amount: 110000, idempotencyKey: key() }));
      const company = await db.company.findFirst({ where: { organizationId: o.org.id } });
      await db.$transaction((tx) => setAccountingLevel(tx, { user: o.boss }, { companyId: company.id, level: "FULL" }));
      await syncCompany(company.id, { full: true });
      properties.push({ orgId: o.org.id, bossId: o.boss.id, headId: o.head.id, head2Id: o.head2.id, propertyId: o.rentals.id, companyId: company.id, leaseIds });
    }
    // Shops, bars, pressings, car washes, other: LOAD_TRADE_ORGS businesses × (Boss + 1 head running the five);
    // half of them keep Full accounting.
    const trades = [];
    for (let i = 0; i < Number(process.env.LOAD_TRADE_ORGS || 40); i += 1) {
      headerJar.set("x-forwarded-for", `10.4.${Math.floor(i / 250)}.${(i % 250) + 1}`);
      const o = await setupTradeOrganization(`Load trade ${i}`);
      await loginAs(o.head.id, o.shop.id);
      const op = (kind, input) => tradeOperation(kind, { idempotencyKey: key(), ...input });
      const productIds = [];
      for (const [name, salePrice, costPrice] of [["Rice 5 kg", 5000, 4000], ["Soap", 500, 300], ["Oil 1 l", 1800, 1400]]) productIds.push(ok(await op("trade.product.save", { departmentId: o.shop.id, name, barcode: `${i}${productIds.length}${Date.now() % 100000}`.slice(0, 20), salePrice, costPrice, openingQuantity: 100000 })).productId);
      const crateId = ok(await op("trade.packaging.save", { departmentId: o.bar.id, name: "Crate (12)", deposit: 3600, bottleDeposit: 300 })).packagingId;
      const drinkId = ok(await op("trade.product.save", { departmentId: o.bar.id, name: "Beer 65 cl", salePrice: 700, costPrice: 500, openingQuantity: 100000, unitsPerPack: 12, packagingId: crateId })).productId;
      const pressItemId = ok(await op("services.item.save", { departmentId: o.pressing.id, name: "Wash & iron", basePrice: 1000, prices: { Shirt: 500 } })).itemId;
      const washItemId = ok(await op("services.item.save", { departmentId: o.carWash.id, name: "Full wash", basePrice: 3000, commissionType: "PERCENT", commissionValue: 30 })).itemId;
      const workerId = ok(await op("services.worker.save", { departmentId: o.carWash.id, name: "Paul" })).workerId;
      const company = await db.company.findFirst({ where: { organizationId: o.org.id } });
      if (i % 2 === 0) {
        await db.$transaction((tx) => setAccountingLevel(tx, { user: o.boss }, { companyId: company.id, level: "FULL" }));
        await syncCompany(company.id, { full: true });
      }
      trades.push({ orgId: o.org.id, bossId: o.boss.id, headId: o.head.id, shopId: o.shop.id, barId: o.bar.id, pressingId: o.pressing.id, carWashId: o.carWash.id, companyId: company.id, productIds, drinkId, crateId, pressItemId, washItemId, workerId });
    }
    writeFileSync(process.env.LOAD_SEED_OUT || "load-seed.json", JSON.stringify({ orgs, stays, rentals, properties, trades }, null, 1));
    expect(orgs).toHaveLength(n);
  });
});
