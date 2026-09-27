import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { setDepartmentHead, updateEmployee, createEmployee } from "@/actions/organization";
import { addDish } from "@/actions/menu-stock";
import { recordSale } from "@/actions/sales";
import { recordHandover } from "@/actions/handovers";
import { sendReportToBoss } from "@/actions/daily-report";
import { requestCash } from "@/actions/cash-requests";

/**
 * Two roles: the Boss who created the business, and department heads. Everyone the Boss adds
 * is a department head of every department they are assigned to (one or several). Their title
 * (Accountant, Manager …) is free text chosen and edited by the Boss.
 */
describe.skipIf(!hasDb)("two roles: the Boss and department heads (titles are free text)", () => {
  let o;
  beforeAll(async () => {
    o = await setupOrganization("Heads");
  });

  it("everyone the Boss added is a department head with the title he gave", async () => {
    const people = await db.user.findMany({ where: { organizationId: o.org.id }, select: { role: true, title: true, name: true }, orderBy: { name: "asc" } });
    expect(people.find((p) => p.name.startsWith("Boss")).role).toBe("ADMIN");
    const heads = people.filter((p) => p.role !== "ADMIN");
    expect(heads.every((p) => p.role === "HEAD")).toBe(true);
    expect(heads.map((p) => p.title).sort()).toEqual(["Accountant", "Cashier", "Manager", "Supervisor"]);
  });

  it("the Boss adds a head with a title and several departments; the head works in each", async () => {
    await loginAs(o.boss.id);
    const email = `head2-${Date.now()}@test.local`;
    const created = ok(await createEmployee({ name: "Two Places", email, title: "Accountant", tempPassword: "Temp98765", memberships: [{ departmentId: o.deptA.id, isPrimary: true }, { departmentId: o.deptB.id }] }));
    expect(created).toMatchObject({ role: "HEAD", title: "Accountant" });
    fails(await createEmployee({ name: "Nowhere", email: `n-${Date.now()}@test.local`, title: "Manager", tempPassword: "Temp98765", memberships: [] }), /at least one department/);

    await loginAs(created.id);
    for (const dept of [o.deptA, o.deptB]) {
      const dish = ok(await addDish({ departmentId: dept.id, name: `Dish ${dept.name}`, unitPrice: 1000, openingPlates: 5 })).dish;
      ok(await recordSale({ departmentId: dept.id, lines: [{ dishId: dish.id, quantity: 2 }], paymentMethod: "CASH", idempotencyKey: key() }));
      ok(await recordHandover({ departmentId: dept.id, amount: 1000, idempotencyKey: key() }));
      ok(await sendReportToBoss({ departmentId: dept.id, countedCash: 1000 }));
    }
    fails(await addDish({ departmentId: o.laundry.id, name: "X", unitPrice: 100 }), /not assigned/);
  });

  it("the Boss edits the title and the departments; the role stays department head", async () => {
    await loginAs(o.boss.id);
    ok(await updateEmployee({ employeeId: o.cashier.id, title: "  Head   waiter ", memberships: [{ departmentId: o.deptA.id, isPrimary: true }, { departmentId: o.deptB.id }] }));
    const u = await db.user.findUnique({ where: { id: o.cashier.id }, include: { memberships: true } });
    expect(u).toMatchObject({ role: "HEAD", title: "Head waiter" });
    expect(u.memberships.map((m) => m.departmentId).sort()).toEqual([o.deptA.id, o.deptB.id].sort());
    const note = await db.notification.findFirst({ where: { userId: o.cashier.id, kind: "DEPARTMENT_HEAD", departmentId: o.deptB.id } });
    expect(note.title).toBe("You are now a head of Restaurant B");
    fails(await updateEmployee({ employeeId: o.cashier.id, role: "ADMIN" }), /Roles cannot be changed/);
    fails(await updateEmployee({ employeeId: o.cashier.id, memberships: [] }), /at least one department/);
    ok(await updateEmployee({ employeeId: o.cashier.id, title: "" }));
    expect((await db.user.findUnique({ where: { id: o.cashier.id } })).title).toBeNull();
  });

  it("from a department card the Boss adds and removes heads; a head keeps at least one department", async () => {
    await loginAs(o.boss.id);
    ok(await setDepartmentHead({ departmentId: o.laundry.id, userId: o.manager.id }));
    expect(await db.userDepartment.count({ where: { userId: o.manager.id } })).toBe(2);
    ok(await setDepartmentHead({ departmentId: o.laundry.id, userId: o.manager.id, remove: true }));
    expect(await db.userDepartment.count({ where: { userId: o.manager.id } })).toBe(1);
    fails(await setDepartmentHead({ departmentId: o.deptA.id, userId: o.manager.id, remove: true }), /heads only Restaurant A/);
    fails(await setDepartmentHead({ departmentId: o.deptA.id, userId: o.boss.id }), /oversees every department/);
    await loginAs(o.manager.id);
    fails(await setDepartmentHead({ departmentId: o.laundry.id, userId: o.manager.id }), /Boss/);
  });

  it("the Boss's cash request reaches every head of the department, for each department they head", async () => {
    await loginAs(o.boss.id);
    ok(await requestCash({ departmentIds: [o.deptA.id, o.deptB.id], fromKey: "2026-01-01", toKey: "2026-01-01" }));
    const toCashier = await db.notification.findMany({ where: { userId: o.cashier.id, kind: "CASH_REQUESTED" } });
    expect(toCashier.map((n) => n.departmentId).sort()).toEqual([o.deptA.id, o.deptB.id].sort()); // heads A and B
    const toManager = await db.notification.findMany({ where: { userId: o.manager.id, kind: "CASH_REQUESTED" } });
    expect(toManager.map((n) => n.departmentId)).toEqual([o.deptA.id]);
  });

  it("a deactivated head cannot sign in or be assigned; people of another business are out of reach", async () => {
    await loginAs(o.boss.id);
    ok(await updateEmployee({ employeeId: o.accountant.id, isActive: false }));
    fails(await setDepartmentHead({ departmentId: o.deptB.id, userId: o.accountant.id }), /deactivated/);
    ok(await updateEmployee({ employeeId: o.accountant.id, isActive: true }));
    const other = await setupOrganization("OtherHeads");
    fails(await setDepartmentHead({ departmentId: o.deptA.id, userId: other.manager.id }), /not found/);
    fails(await setDepartmentHead({ departmentId: other.deptA.id, userId: o.manager.id }), /not found/);
  });
});
