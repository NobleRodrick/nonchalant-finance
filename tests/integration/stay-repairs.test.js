import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupStayOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDaysToKey } from "@/lib/timezone";
import { cancelRepair, completeRepair, createStay, reportRepair, saveRoom, updateRepair } from "@/actions/rooms";
import { listRepairs, repairTotals } from "@/lib/rooms/repair-queries";

describe.skipIf(!hasDb)("Executive Stay: maintenance and repairs", () => {
  let o;
  let a1;
  let a2;
  const t = today();
  beforeAll(async () => {
    o = await setupStayOrganization("Repairs");
    await loginAs(o.head.id);
    a1 = ok(await saveRoom({ departmentId: o.stay.id, name: "Apartment 1", nightlyRate: 30000 })).roomId;
    a2 = ok(await saveRoom({ departmentId: o.stay.id, name: "Apartment 2", nightlyRate: 30000 })).roomId;
  });

  it("a blocking repair puts the apartment under maintenance (no booking) until the last one is done", async () => {
    fails(await reportRepair({ departmentId: o.stay.id, roomId: a1 }), /what needs to be fixed/);
    const leak = ok(await reportRepair({ departmentId: o.stay.id, roomId: a1, title: "Water leak", priority: "URGENT", estimatedCost: 40000, responsibleName: "Plumber Joe", blocksRoom: true }));
    expect(leak.referenceNo).toBe("MR-0001");
    const ac = ok(await reportRepair({ departmentId: o.stay.id, roomId: a1, title: "AC noisy", priority: "LOW", blocksRoom: true }));
    ok(await reportRepair({ departmentId: o.stay.id, roomId: a2, title: "Door handle", priority: "HIGH", estimatedCost: 5000 }));
    expect((await db.room.findUnique({ where: { id: a1 } })).state).toBe("MAINTENANCE");
    fails(await createStay({ departmentId: o.stay.id, roomId: a1, checkInKey: t, checkOutKey: addDaysToKey(t, 1), guestName: "X" }), /under maintenance \(MR-0001: Water leak\)/);

    const open = await listRepairs({ departmentId: o.stay.id, view: "open" });
    expect(open.map((r) => r.title)).toEqual(["Water leak", "Door handle", "AC noisy"]);
    expect(repairTotals(open, [])).toMatchObject({ pending: 3, urgent: 2, estimated: 45000, blocking: 2 });

    ok(await updateRepair({ departmentId: o.stay.id, repairId: leak.repairId, status: "IN_PROGRESS" }));
    fails(await completeRepair({ departmentId: o.stay.id, repairId: leak.repairId, actualCost: 45000, paidFromDrawer: true, idempotencyKey: key() }), /who authorized/);
    const done = ok(await completeRepair({ departmentId: o.stay.id, repairId: leak.repairId, actualCost: 45000, paidFromDrawer: true, authorizedByName: "Mr Boss", idempotencyKey: key() }));
    expect(done.transactionReference).toMatch(/^E-/);
    const expense = await db.transaction.findFirst({ where: { departmentId: o.stay.id, category: "stay-repairs" } });
    expect(expense).toMatchObject({ roomId: a1, counterparty: "Plumber Joe", authorizedByName: "Mr Boss" });
    expect((await db.room.findUnique({ where: { id: a1 } })).state).toBe("MAINTENANCE"); // AC still open and blocking
    fails(await completeRepair({ departmentId: o.stay.id, repairId: leak.repairId, actualCost: 1 }), /is done/);
    fails(await cancelRepair({ departmentId: o.stay.id, repairId: ac.repairId }), /why/);
    ok(await cancelRepair({ departmentId: o.stay.id, repairId: ac.repairId, reason: "Was only dust" }));
    expect((await db.room.findUnique({ where: { id: a1 } })).state).toBe("AVAILABLE");

    const doneList = await listRepairs({ departmentId: o.stay.id, view: "done", fromKey: t, toKey: t });
    expect(repairTotals([], doneList)).toMatchObject({ done: 1, spent: 45000, estimatedOfDone: 40000 });
    expect(doneList[0]).toMatchObject({ actualCost: 45000, repairedOnKey: t, responsibleName: "Plumber Joe" });
  });
});
