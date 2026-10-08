import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupTradeOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { tradeOperation } from "@/actions/trade";
import { recordMoney } from "@/actions/money";
import { GET as downloadAttachment } from "@/app/api/attachments/[id]/route";

// A 1×1 PNG.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082", "hex");

async function upload(user, departmentId, name = "proof.png") {
  return db.attachment.create({ data: { organizationId: user.organizationId, departmentId, uploadedById: user.id, fileName: name, mimeType: "image/png", sizeBytes: PNG.length, sha256: `${name}-${Math.random()}`, data: PNG } });
}

/**
 * One business never reaches another's records, and a department head never reaches another
 * department's: the cases found by the isolation probe (npm run test:isolation) and the code review.
 */
describe.skipIf(!hasDb)("isolation between businesses and departments", () => {
  let a;
  let b;
  beforeAll(async () => {
    a = await setupTradeOrganization("Iso A");
    b = await setupTradeOrganization("Iso B");
  });

  it("a file of another business (or another person) cannot be attached to a record, nor downloaded", async () => {
    const theirs = await upload(b.head, b.shop.id, "their-receipt.png");
    await loginAs(a.head.id, a.shop.id);
    fails(await recordMoney({ departmentId: a.shop.id, type: "EXPENSE", category: "trade-shop-rent", amount: 1000, paymentMethod: "CASH", attachmentIds: [theirs.id], idempotencyKey: key() }), /attached files was not found/);
    expect((await db.attachment.findUnique({ where: { id: theirs.id } })).entityId).toBeNull();
    const res = await downloadAttachment(new Request("http://x"), { params: Promise.resolve({ id: theirs.id }) });
    expect(res.status).toBe(404);
    // His own file is attached; the same file cannot be attached a second time.
    const mine = await upload(a.head, a.shop.id, "mine.png");
    ok(await recordMoney({ departmentId: a.shop.id, type: "EXPENSE", category: "trade-shop-rent", amount: 1000, paymentMethod: "CASH", attachmentIds: [mine.id], idempotencyKey: key() }));
    fails(await recordMoney({ departmentId: a.shop.id, type: "EXPENSE", category: "trade-shop-rent", amount: 1000, paymentMethod: "CASH", attachmentIds: [mine.id], idempotencyKey: key() }), /already attached/);
  });

  it("a logo cannot be taken from a record, even one of his own other department", async () => {
    // A receipt of the bar (uploaded by the Boss, attached to a bar expense by the bar's head).
    await loginAs(a.head.id, a.bar.id);
    const receipt = await upload(a.head, a.bar.id, "bar-receipt.png");
    ok(await recordMoney({ departmentId: a.bar.id, type: "EXPENSE", category: "trade-shop-rent", amount: 2000, paymentMethod: "CASH", attachmentIds: [receipt.id], idempotencyKey: key() }));
    const linked = await db.attachment.findUnique({ where: { id: receipt.id } });
    expect(linked.entityId).not.toBeNull();
    // The shop's head tries to make it his logo.
    await loginAs(a.head.id, a.shop.id);
    fails(await tradeOperation("trade.profile.save", { departmentId: a.shop.id, businessName: "Shop", attachmentIds: [receipt.id] }), /image was not found/);
    expect(await db.attachment.findUnique({ where: { id: receipt.id } })).toMatchObject({ entityId: linked.entityId, departmentId: a.bar.id });
    // His own upload becomes the logo, and saving the form again keeps it.
    const logo = await upload(a.head, a.shop.id, "logo.png");
    ok(await tradeOperation("trade.profile.save", { departmentId: a.shop.id, businessName: "Shop", attachmentIds: [logo.id] }));
    ok(await tradeOperation("trade.profile.save", { departmentId: a.shop.id, businessName: "Shop 2", attachmentIds: [logo.id] }));
    expect((await db.department.findUnique({ where: { id: a.shop.id } })).profile.logoId).toBe(logo.id);
  });

  it("a stored result is only returned to the person who made it", async () => {
    await loginAs(a.head.id, a.shop.id);
    const k = key();
    ok(await tradeOperation("trade.product.save", { departmentId: a.shop.id, name: "Sugar", salePrice: 900, idempotencyKey: k }));
    await loginAs(a.boss.id, a.shop.id);
    fails(await tradeOperation("trade.product.save", { departmentId: a.shop.id, name: "Salt", salePrice: 300, idempotencyKey: k }), /key is already used/);
  });

});
