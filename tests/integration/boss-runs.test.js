import { beforeAll, describe, expect, it, vi } from "vitest";
import { cookieJar } from "../support/request-context";
import { fails, hasDb, key, loginAs, ok, today, uid } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { effectiveRole } from "@/lib/access";
import { registerBoss, updatePassword } from "@/actions/auth";
import { createEmployee, createOrganization, setDepartmentHead, updateEmployee } from "@/actions/organization";
import { addDish } from "@/actions/menu-stock";
import { recordSale } from "@/actions/sales";
import { recordMoney } from "@/actions/money";
import { recordHandover } from "@/actions/handovers";
import { reviewReport, sendReportToBoss } from "@/actions/daily-report";
import { createStay, saveRoom } from "@/actions/rooms";
import { addDaysToKey } from "@/lib/timezone";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

/**
 * The owner's choice: manage the business himself first and assign department heads later. A
 * department with no head is run by the Boss (he records its day); once he assigns a head, the
 * head runs it and the Boss goes back to overseeing it.
 */
describe.skipIf(!hasDb)("the Boss runs departments that have no head yet", () => {
  const tag = uid();
  let boss;
  let kitchen;
  let stay;
  const roleIn = async (deptId) => effectiveRole(await getCurrentUser(), deptId);

  beforeAll(async () => {
    cookieJar.clear();
    ok(await registerBoss({ name: "Solo Owner", email: `solo-${tag}@test.local`, password: "Baobab-2468" }));
    ok(await createOrganization({ name: `Solo ${tag}`, departments: [{ name: "Kitchen", domain: "RESTAURANT" }, { name: "Guest house", domain: "ROOM_RENTAL" }] }));
    boss = await db.user.findUnique({ where: { email: `solo-${tag}@test.local` } });
    const depts = await db.department.findMany({ where: { organizationId: boss.organizationId } });
    kitchen = depts.find((d) => d.name === "Kitchen");
    stay = depts.find((d) => d.name === "Guest house");
  });

  it("setup without heads: the Boss runs every department", async () => {
    await loginAs(boss.id);
    expect(await roleIn(kitchen.id)).toBe("OWNER");
    expect(await roleIn(stay.id)).toBe("OWNER");
  });

  it("records the restaurant's day like a head: his cash and his report need no one else's check", async () => {
    await loginAs(boss.id, kitchen.id);
    const dish = ok(await addDish({ departmentId: kitchen.id, name: "Ndole", unitPrice: 2500, openingPlates: 10 })).dish;
    ok(await recordSale({ departmentId: kitchen.id, lines: [{ dishId: dish.id, quantity: 4 }], paymentMethod: "CASH", idempotencyKey: key() }));
    const exp = ok(await recordMoney({ departmentId: kitchen.id, type: "EXPENSE", amount: 1000, category: "opex-gas", paymentMethod: "CASH", idempotencyKey: key() }));
    const t = await db.transaction.findFirst({ where: { departmentId: kitchen.id, type: "EXPENSE" } });
    expect(exp).toBeTruthy();
    expect(t.validatedById).toBe(boss.id);
    ok(await recordHandover({ departmentId: kitchen.id, amount: 5000, idempotencyKey: key() }));
    const h = await db.cashHandover.findFirst({ where: { departmentId: kitchen.id } });
    expect(h).toMatchObject({ status: "CONFIRMED", confirmedById: boss.id, userId: boss.id });
    ok(await sendReportToBoss({ departmentId: kitchen.id, countedCash: 4000 }));
    const report = await db.dailyReport.findFirst({ where: { departmentId: kitchen.id } });
    expect(report).toMatchObject({ status: "APPROVED", submittedById: boss.id, reviewedById: boss.id });
    // Nothing to notify himself about.
    expect(await db.notification.count({ where: { userId: boss.id, kind: { in: ["HANDOVER_RECORDED", "REPORT_SUBMITTED"] } } })).toBe(0);
  });

  it("runs the guest house too: apartments and bookings", async () => {
    await loginAs(boss.id, stay.id);
    const roomId = ok(await saveRoom({ departmentId: stay.id, name: "Apartment 1", nightlyRate: 30000 })).roomId;
    const b = ok(await createStay({ departmentId: stay.id, roomId, checkInKey: today(), checkOutKey: addDaysToKey(today(), 2), guestName: "Guest" }));
    expect(await db.roomBooking.count({ where: { departmentId: stay.id } })).toBe(1);
    expect(b).toBeTruthy();
  });

  it("assigning a head hands the department over; the Boss oversees it again", async () => {
    await loginAs(boss.id);
    const email = `solo-head-${tag}@test.local`;
    const head = ok(await createEmployee({ name: "New Head", email, title: "Manager", tempPassword: "Mango-97531", memberships: [{ departmentId: kitchen.id, isPrimary: true }] }));
    expect(await roleIn(kitchen.id)).toBe("ADMIN");
    expect(await roleIn(stay.id)).toBe("OWNER");
    fails(await addDish({ departmentId: kitchen.id, name: "Eru", unitPrice: 2000 }), /role does not allow/);
    fails(await recordHandover({ departmentId: kitchen.id, amount: 500, idempotencyKey: key() }), /./);

    // Today's report (sent by the Boss) locks the day; he returns it so the new head can work today.
    const report = await db.dailyReport.findFirst({ where: { departmentId: kitchen.id } });
    ok(await reviewReport({ reportId: report.id, decision: "RETURNED", note: "Handing over to the new head" }));

    // The head works there (after choosing a password); the Boss can hand the guest house over later too.
    await loginAs(head.id);
    ok(await updatePassword({ currentPassword: "Mango-97531", newPassword: "Own-pass-2468" }));
    ok(await addDish({ departmentId: kitchen.id, name: "Eru", unitPrice: 2000, openingPlates: 3 }));

    // Without an active head (deactivated), the department is the Boss's to run again.
    await loginAs(boss.id);
    ok(await updateEmployee({ employeeId: head.id, isActive: false }));
    expect(await roleIn(kitchen.id)).toBe("OWNER");
    ok(await updateEmployee({ employeeId: head.id, isActive: true }));
    ok(await setDepartmentHead({ departmentId: stay.id, userId: head.id }));
    expect(await roleIn(stay.id)).toBe("ADMIN");
  });
});
