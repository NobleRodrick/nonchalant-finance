import { describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupPropertyOrganization, setupRentalOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { propertyOperation } from "@/actions/property";
import { recordRentalPurchase, saveRentalAsset, saveRentalItem } from "@/actions/rental";

const t = today();
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082", "hex");

async function upload(user, departmentId, name = "proof.png") {
  return db.attachment.create({ data: { organizationId: user.organizationId, departmentId, uploadedById: user.id, fileName: name, mimeType: "image/png", sizeBytes: PNG.length, sha256: `${name}-${Math.random()}`, data: PNG } });
}

/** Rentals and offices: links to another business's records are refused (tests/integration/isolation.test.js). */
describe.skipIf(!hasDb)("isolation: rentals and offices", () => {
  it("rental: an asset cannot point at another business's purchase; an item photo must be one's own file", async () => {
    const r1 = await setupRentalOrganization("Iso R1");
    const r2 = await setupRentalOrganization("Iso R2");
    await loginAs(r2.head.id, r2.deco.id);
    const tents = ok(await saveRentalItem({ departmentId: r2.deco.id, name: "Tents", category: "Tents", rentalPrice: 20000, openingQuantity: 2 })).itemId;
    ok(await recordRentalPurchase({ departmentId: r2.deco.id, supplier: "Bâches SA", lines: [{ itemId: tents, quantity: 1, unitCost: 150000 }], idempotencyKey: key() }));
    const purchase = await db.purchase.findFirst({ where: { departmentId: r2.deco.id } });
    const photo = await upload(r2.head, r2.deco.id, "tent.png");

    await loginAs(r1.head.id, r1.deco.id);
    fails(await saveRentalAsset({ departmentId: r1.deco.id, name: "Van", category: "Vehicles", purchaseDateKey: t, cost: 1000000, usefulLifeMonths: 60, method: "STRAIGHT_LINE", purchaseId: purchase.id }), /Purchase not found/);
    fails(await saveRentalItem({ departmentId: r1.deco.id, name: "Chairs", category: "Chairs", rentalPrice: 500, attachmentIds: [photo.id] }), /image was not found/);
    // His own photo works, and saving the item again with the same photo too.
    const own = await upload(r1.head, r1.deco.id, "chairs.png");
    const chairs = ok(await saveRentalItem({ departmentId: r1.deco.id, name: "Chairs", category: "Chairs", rentalPrice: 500, attachmentIds: [own.id] })).itemId;
    ok(await saveRentalItem({ departmentId: r1.deco.id, id: chairs, name: "Chairs", category: "Chairs", rentalPrice: 600, attachmentIds: [own.id] }));
    expect((await db.rentalItem.findUnique({ where: { id: chairs } })).photoId).toBe(own.id);
  });

  it("property: a charge or an inspection cannot point at another business's repair or inspection", async () => {
    const p1 = await setupPropertyOrganization("Iso P1");
    const p2 = await setupPropertyOrganization("Iso P2");
    await loginAs(p2.head.id, p2.rentals.id);
    const unit2 = ok(await propertyOperation("property.unit.save", { departmentId: p2.rentals.id, buildingId: p2.main.id, name: "B1", listRent: 100000 })).unitId;
    const repair = ok(await propertyOperation("property.maintenance.report", { departmentId: p2.rentals.id, unitId: unit2, title: "Broken door" })).maintenanceId;

    await loginAs(p1.head.id, p1.rentals.id);
    const unit1 = ok(await propertyOperation("property.unit.save", { departmentId: p1.rentals.id, buildingId: p1.main.id, name: "A1", listRent: 100000 })).unitId;
    const lease = ok(await propertyOperation("property.lease.create", { departmentId: p1.rentals.id, unitId: unit1, tenant: { name: "Tenant" }, startKey: t, dueDay: 1, status: "ACTIVE" })).leaseId;
    fails(await propertyOperation("property.charge.add", { departmentId: p1.rentals.id, leaseId: lease, kind: "OTHER", label: "Door", amount: 5000, maintenanceId: repair, dueKey: t }), /Repair not found/);
    fails(await propertyOperation("property.inspection.record", { departmentId: p1.rentals.id, unitId: unit1, kind: "ROUTINE", maintenanceId: repair }), /Repair not found/);
  });
});
