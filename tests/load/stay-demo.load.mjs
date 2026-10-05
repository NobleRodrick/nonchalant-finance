import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasDb, key, loginAs, ok, setupStayOrganization, today } from "../support/fixtures";
import { addDaysToKey } from "@/lib/timezone";
import { addRoomAssets, completeRepair, createStay, moveRoomAssets, recordStayPayment, reportRepair, saveRoom, stepStay } from "@/actions/rooms";
import { recordMoney } from "@/actions/money";
import { recordHandover } from "@/actions/handovers";

/** A demo Executive Stay (5 apartments, a few weeks of activity) for screenshots: DEMO_OUT gets the Boss's e-mail. */
describe.skipIf(!hasDb)("demo", () => {
  it("seeds Executive Stay", async () => {
    const o = await setupStayOrganization("Demo");
    await loginAs(o.head.id);
    const t = today();
    const d = (n) => addDaysToKey(t, n);
    const rates = [35000, 35000, 30000, 25000, 45000];
    const rooms = [];
    for (let i = 0; i < 5; i += 1) rooms.push(ok(await saveRoom({ departmentId: o.stay.id, name: `Apartment ${i + 1}`, roomType: i === 4 ? "Executive suite" : "2 bedrooms", capacity: 4, nightlyRate: rates[i], weeklyRate: rates[i] * 6, monthlyRate: rates[i] * 22 })).roomId);
    let g = 0;
    for (let i = 0; i < 5; i += 1) {
      for (let start = -20 + i; start < 0; start += 5) {
        const s = ok(await createStay({ departmentId: o.stay.id, roomId: rooms[i], checkInKey: d(start), checkOutKey: d(start + 3), guestName: `Guest ${++g}`, guestPhone: `6990000${g}`, allowPast: true }));
        ok(await stepStay({ departmentId: o.stay.id, stayId: s.stayId, step: "checkin" }));
        if (start + 3 <= 0) ok(await stepStay({ departmentId: o.stay.id, stayId: s.stayId, step: "checkout" }));
        ok(await recordStayPayment({ departmentId: o.stay.id, stayId: s.stayId, amount: g % 3 ? s.totalPrice : Math.round(s.totalPrice / 2), paymentMethod: g % 2 ? "CASH" : "MOMO", reference: g % 2 ? null : `MP${g}`, receivedByName: g % 2 ? "Aline" : "Paul", idempotencyKey: key() }));
      }
    }
    for (let i = 0; i < 3; i += 1) ok(await createStay({ departmentId: o.stay.id, roomId: rooms[i], checkInKey: d(3 + i), checkOutKey: d(6 + i), guestName: `Future guest ${i + 1}` }));
    for (const [i, cat, amt, desc, who] of [[0, "stay-cleaning", 15000, "Deep cleaning", "CleanCo"], [1, "stay-supplies", 22000, "Towels and toiletries", "Mahima"], [null, "opex-electricity", 48000, "ENEO bill", "ENEO"], [null, "stay-security", 60000, "Night guard", "Guard"], [4, "stay-internet-tv", 18000, "Canal+ subscription", "Canal+"]]) {
      ok(await recordMoney({ departmentId: o.stay.id, type: "EXPENSE", amount: amt, category: cat, description: desc, counterparty: who, authorizedByName: "Boss", roomId: i === null ? null : rooms[i], idempotencyKey: key() }));
    }
    const chairs = ok(await addRoomAssets({ departmentId: o.stay.id, roomId: rooms[0], name: "Chair", category: "CHAIR", quantity: 6, unitValue: 15000, alreadyOwned: true, idempotencyKey: key() }));
    for (let i = 0; i < 5; i += 1) {
      ok(await addRoomAssets({ departmentId: o.stay.id, roomId: rooms[i], name: "Bed 160", category: "BED", quantity: 2, unitValue: 120000, alreadyOwned: true, idempotencyKey: key() }));
      ok(await addRoomAssets({ departmentId: o.stay.id, roomId: rooms[i], name: "TV 43", category: "TV", quantity: 1, unitValue: 220000, alreadyOwned: true, idempotencyKey: key() }));
      ok(await addRoomAssets({ departmentId: o.stay.id, roomId: rooms[i], name: "Air conditioner", category: "AC", quantity: 2, unitValue: 250000, alreadyOwned: true, idempotencyKey: key() }));
    }
    ok(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.assetId, kind: "damaged", quantity: 1, note: "Broken leg" }));
    ok(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.assetId, kind: "missing", quantity: 1, note: "After guest checkout" }));
    const r1 = ok(await reportRepair({ departmentId: o.stay.id, roomId: rooms[2], title: "Water heater not working", priority: "URGENT", estimatedCost: 45000, responsibleName: "Plumber Joe" }));
    ok(await reportRepair({ departmentId: o.stay.id, roomId: rooms[3], title: "AC leaking", priority: "HIGH", estimatedCost: 30000, blocksRoom: true }));
    ok(await completeRepair({ departmentId: o.stay.id, repairId: r1.repairId, actualCost: 40000, paidFromDrawer: true, authorizedByName: "Boss", idempotencyKey: key() }));
    ok(await reportRepair({ departmentId: o.stay.id, roomId: rooms[0], title: "Curtain rail loose", priority: "LOW" }));
    ok(await recordHandover({ departmentId: o.stay.id, amount: 100000, idempotencyKey: key() }));
    writeFileSync(process.env.DEMO_OUT || "demo.json", JSON.stringify({ email: o.boss.email, password: "Baobab-2468", deptId: o.stay.id, roomId: rooms[0], headEmail: o.head.email }));
    expect(rooms).toHaveLength(5);
  });
});
