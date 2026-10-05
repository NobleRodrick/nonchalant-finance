/**
 * Operations of restaurant departments: sales, purchases, menu and stock, debts and the daily
 * report (see lib/operations/registry.js for the definition format; money in / out, voids and
 * cash to the Boss are shared by every type: lib/operations/common.js).
 */
import { PERMISSIONS, roleHasPermission } from "@/lib/permissions";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { linkAttachments } from "@/lib/attachments";
import { serialize } from "@/lib/serialize";
import { isDateKey, startOfDateKey, toDateKey, formatDateKey } from "@/lib/timezone";
import { nextReference, DOC_TYPES } from "@/lib/documents/sequence";
import { notifyBosses } from "@/lib/notifications";
import { sendReportSubmittedEmail } from "@/lib/email";
import { buildDailyReport, reportTotals, LOCKED_STATUSES } from "@/lib/reports/daily-report";
import { postSale, postPurchase, postOpeningDebt, postRepayment, cancelOpeningDebt, resolveDebtor } from "@/lib/finance/posting-service";
import {
  createDish, updateDish, archiveDish, restoreDish, addStock, correctCount, setOpeningStock, voidStockMovement,
} from "@/lib/restaurant/stock-service";
import { list, text, writeIn } from "./helpers";

const W = writeIn("RESTAURANT");
const MANAGE_STOCK = { permission: PERMISSIONS.INVENTORY_MANAGE, ...W };
const MANAGE_DEBTS = { permission: PERMISSIONS.DEBTS_MANAGE, ...W };

function parseCounted(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) throw invalid("Counted cash must be a whole number of francs (0 or more).");
  return n;
}

function reportDay(input, timeZone, now) {
  const today = toDateKey(now, timeZone);
  const key = isDateKey(input?.dateKey) ? input.dateKey : today;
  if (key > today) throw invalid("You cannot report on a future day.");
  return key;
}

/**
 * Saves the report of a day. DRAFT keeps it editable (counted cash, notes); SUBMITTED sends it
 * to the Boss: the full report is frozen as a snapshot, one inventory row is written per dish,
 * the day is locked and the Boss is notified.
 */
async function saveReport(tx, ctx, input, status) {
  const { user, department, timeZone, now } = ctx;
  const dateKey = reportDay(input, timeZone, now);
  const reportDate = startOfDateKey(dateKey, timeZone);
  const counted = parseCounted(input?.countedCash);
  const notes = text(input?.notes);
  if (status === "SUBMITTED" && counted === null) throw invalid("Count the cash in the drawer and enter it before sending the report.");

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`report:${department.id}:${dateKey}`}))`;
  const existing = await tx.dailyReport.findUnique({ where: { departmentId_reportDate: { departmentId: department.id, reportDate } } });
  if (existing && LOCKED_STATUSES.includes(existing.status)) {
    throw conflict(`This day's report was already sent (${existing.status.toLowerCase()}). The Boss must return it before it can change.`);
  }
  const model = await buildDailyReport({ organizationId: user.organizationId, departmentId: department.id, dateKey, timeZone, countedCash: counted, client: tx });
  const totals = reportTotals(model);
  const snapshotJson = serialize({ ...model, notes, status, submittedBy: status === "SUBMITTED" ? { id: user.id, name: user.name } : null });
  const version = existing ? existing.version + (status === "SUBMITTED" && existing.status === "RETURNED" ? 1 : 0) : 1;
  const referenceNo = existing?.referenceNo || (status === "SUBMITTED" ? await nextReference(tx, department.id, DOC_TYPES.DAILY_REPORT) : null);
  // The Boss sends the report of a department he runs himself: there is nobody to review it, so
  // it is approved at once (he can still return it to correct the day).
  const ownReport = status === "SUBMITTED" && ctx.role === "OWNER";
  const data = {
    status: ownReport ? "APPROVED" : status,
    ...(ownReport ? { reviewedById: user.id, reviewedAt: new Date() } : {}),
    version,
    referenceNo,
    schemaVersion: model.schemaVersion,
    notes,
    snapshotJson,
    totalsJson: serialize(totals),
    submittedById: status === "SUBMITTED" ? user.id : existing?.submittedById || null,
    submittedAt: status === "SUBMITTED" ? new Date() : existing?.submittedAt || null,
  };
  const report = existing
    ? await tx.dailyReport.update({ where: { id: existing.id }, data })
    : await tx.dailyReport.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id, reportDate } });

  if (status === "SUBMITTED") {
    await tx.inventorySnapshot.deleteMany({ where: { dailyReportId: report.id } });
    if (model.stock.rows.length) {
      await tx.inventorySnapshot.createMany({
        data: model.stock.rows.map((r) => ({
          organizationId: user.organizationId,
          departmentId: department.id,
          dailyReportId: report.id,
          snapshotDate: reportDate,
          itemType: "DISH",
          menuItemId: r.dishId,
          name: r.name,
          unit: "plate",
          openingQuantity: r.opening,
          addedQuantity: r.added,
          usedQuantity: r.sold,
          wastedQuantity: r.spoiled,
          adjustedQuantity: r.corrected,
          closingQuantity: r.closing,
          unitCost: r.unitPrice,
          closingValue: r.value,
        })),
      });
    }
    if (!ownReport) await notifyBosses(tx, {
      organizationId: user.organizationId,
      departmentId: department.id,
      kind: "REPORT_SUBMITTED",
      title: `${department.name}: report of ${formatDateKey(dateKey)} sent${version > 1 ? ` (version ${version})` : ""}`,
      body: `Money in ${totals.moneyIn} · Money out ${totals.moneyOut} · Result ${totals.result} FCFA${totals.variance ? ` · Cash variance ${totals.variance}` : ""}`,
      href: `/boss/daily-reports/${report.id}`,
    });
  }
  await recordAudit(tx, {
    user,
    departmentId: department.id,
    action: status === "SUBMITTED" ? "DAILY_REPORT_SENT" : "DAILY_REPORT_SAVED",
    entityType: "DailyReport",
    entityId: report.id,
    before: existing ? { status: existing.status, version: existing.version } : undefined,
    after: { status, version, dateKey, totals },
  });
  return { id: report.id, reportId: report.id, dateKey, status: report.status, version: report.version, referenceNo: report.referenceNo, totals };
}

export const RESTAURANT_OPERATIONS = {
  // ─── Sales ────────────────────────────────────────────────────────────────
  "sale.record": {
    label: "Sale",
    money: true,
    dated: true,
    access: { permission: PERMISSIONS.SALES_CREATE, ...W },
    async run(tx, ctx, input) {
      const r = await postSale(tx, {
        ...ctx,
        lines: list(input.lines),
        paymentMethod: input.paymentMethod || "CASH",
        discountAmount: input.discountAmount || 0,
        discountReason: input.discountReason,
        debtorId: input.debtorId || null,
        debtor: input.debtor || null,
        reference: input.reference,
        idempotencyKey: ctx.key,
      });
      return {
        referenceNo: r.transaction.referenceNo,
        transactionId: r.transaction.id,
        debtReference: r.debt?.referenceNo || null,
        debtId: r.debt?.id || null,
        debtorId: r.debt?.debtorId || null,
        totals: r.totals || null,
      };
    },
  },

  "purchase.record": {
    label: "Purchase",
    money: true,
    dated: true,
    access: { permission: PERMISSIONS.PURCHASES_CREATE, ...W },
    async run(tx, ctx, input) {
      const stockAdds = list(input.stockAdds).filter((s) => s?.dishId && Number(s?.plates));
      if (stockAdds.length && !roleHasPermission(ctx.role, PERMISSIONS.INVENTORY_MANAGE)) throw forbidden("Only the department head can add plates to stock.");
      const r = await postPurchase(tx, {
        ...ctx,
        supplier: input.supplier,
        lines: list(input.lines),
        amount: input.amount,
        category: input.category,
        paymentMethod: input.paymentMethod || "CASH",
        reference: input.reference,
        notes: input.notes,
        stockAdds,
        idempotencyKey: ctx.key,
      });
      await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: r.transaction.id, departmentId: ctx.department.id });
      return { referenceNo: r.transaction.referenceNo, transactionId: r.transaction.id };
    },
  },

  // ─── Menu & stock ─────────────────────────────────────────────────────────
  "dish.create": {
    label: "New dish",
    access: MANAGE_STOCK,
    async run(tx, ctx, input) {
      const r = await createDish(tx, { ...ctx, input });
      return { dish: r.dish, dishId: r.dish.id, movement: r.movement };
    },
  },
  "dish.update": {
    label: "Dish changed",
    access: MANAGE_STOCK,
    async run(tx, ctx, input) {
      const dish = await updateDish(tx, { ...ctx, input });
      return { dish, dishId: dish.id };
    },
  },
  "dish.remove": {
    label: "Dish removed",
    access: MANAGE_STOCK,
    async run(tx, ctx, input) {
      const dish = await archiveDish(tx, { ...ctx, dishId: input.dishId });
      return { dish, dishId: dish.id };
    },
  },
  "dish.restore": {
    label: "Dish restored",
    access: MANAGE_STOCK,
    async run(tx, ctx, input) {
      const dish = await restoreDish(tx, { ...ctx, dishId: input.dishId });
      return { dish, dishId: dish.id };
    },
  },

  /**
   * Adds plates to a dish. Optionally creates the dish inline (name + unit price) and records
   * the purchase that paid for the stock, all in one transaction.
   */
  "stock.add": {
    label: "Stock added",
    money: true,
    dated: true,
    access: MANAGE_STOCK,
    async run(tx, ctx, input) {
      const bought = Boolean(input.bought);
      if (bought && !Number(input.amountPaid)) throw invalid("Enter the amount paid for this stock.");
      let dishId = input.dishId;
      let created = null;
      if (!dishId && input.newDish) {
        created = await createDish(tx, { ...ctx, input: { ...input.newDish, openingPlates: 0 } });
        dishId = created.dish.id;
      }
      if (!dishId) throw invalid("Choose a dish.");
      if (bought) {
        const r = await postPurchase(tx, {
          ...ctx,
          supplier: input.supplier,
          amount: Number(input.amountPaid),
          category: "purchase-ready",
          paymentMethod: input.paymentMethod || "CASH",
          reference: input.reference,
          notes: input.note,
          stockAdds: [{ dishId, plates: input.plates }],
          idempotencyKey: ctx.key,
        });
        await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: r.transaction.id, departmentId: ctx.department.id });
        return { movement: r.stockAdds[0], movementId: r.stockAdds[0]?.id, purchase: r.transaction, transactionId: r.transaction.id, referenceNo: r.transaction.referenceNo, createdDish: created?.dish || null, dishId };
      }
      const r = await addStock(tx, { ...ctx, dishId, platesAdded: input.plates, note: input.note });
      return { movement: r.movement, movementId: r.movement.id, purchase: null, referenceNo: r.movement.referenceNo, createdDish: created?.dish || null, dishId };
    },
  },

  /** Sets a dish to the counted number of plates (correction or spoiled plates). */
  "stock.correct": {
    label: "Count corrected",
    dated: true,
    access: MANAGE_STOCK,
    async run(tx, ctx, input) {
      const r = await correctCount(tx, { ...ctx, dishId: input.dishId, counted: input.counted, reasonType: input.reasonType, reasonText: input.reasonText });
      return { movement: r.movement, movementId: r.movement.id, referenceNo: r.movement.referenceNo, expected: r.expected, delta: r.delta, dishId: input.dishId };
    },
  },

  /** Sets the opening stock of a day for one or more dishes (with a reason). */
  "stock.opening": {
    label: "Opening stock",
    access: MANAGE_STOCK,
    async run(tx, ctx, input) {
      const dateKey = isDateKey(input.dateKey) ? input.dateKey : toDateKey(ctx.now, ctx.timeZone);
      if (dateKey > toDateKey(ctx.now, ctx.timeZone)) throw invalid("You cannot set the opening stock of a future day.");
      const entries = list(input.entries);
      if (!entries.length) throw invalid("Enter at least one opening quantity.");
      return setOpeningStock(tx, { ...ctx, dateKey, entries, reason: input.reason });
    },
  },

  /** Voids a stock addition or a correction (writes the opposite movement). */
  "stock.void": {
    label: "Stock record voided",
    access: MANAGE_STOCK,
    async run(tx, ctx, input) {
      const r = await voidStockMovement(tx, { ...ctx, movementId: input.movementId, reason: input.reason });
      return { movementId: input.movementId, movement: r.movement };
    },
  },

  // ─── Debts ────────────────────────────────────────────────────────────────
  /**
   * A customer took food on credit outside the POS. With dishes, plates leave stock like a sale;
   * without dishes, an amount of "unlisted items". Either way it is a sale and a debt.
   */
  "debt.record": {
    label: "Debt",
    money: true,
    dated: true,
    access: MANAGE_DEBTS,
    async run(tx, ctx, input) {
      const lines = list(input.lines).filter((l) => l?.dishId && Number(l?.quantity));
      const r = await postSale(tx, {
        ...ctx,
        lines,
        unlisted: lines.length ? null : { amount: input.amount, description: input.description },
        paymentMethod: "CREDIT",
        debtorId: input.debtorId || null,
        debtor: input.debtor || null,
        dueDate: input.dueDate || null,
        debtSource: "MANUAL",
        idempotencyKey: ctx.key,
      });
      return { referenceNo: r.debt?.referenceNo, saleReference: r.transaction.referenceNo, transactionId: r.transaction.id, debtId: r.debt?.id || null, debtorId: r.debt?.debtorId || null };
    },
  },

  /** A debt that existed before the app (no sale today, no cash). */
  "debt.old": {
    label: "Old debt",
    dated: true,
    access: MANAGE_DEBTS,
    async run(tx, ctx, input) {
      const r = await postOpeningDebt(tx, { ...ctx, debtorId: input.debtorId || null, debtor: input.debtor || null, amount: input.amount, description: input.description, dueDate: input.dueDate || null });
      return { referenceNo: r.debt.referenceNo, debtId: r.debt.id, debtorId: r.debt.debtorId };
    },
  },

  /** A customer pays back all or part of a debt. */
  "debt.repay": {
    label: "Repayment",
    money: true,
    dated: true,
    access: { permission: PERMISSIONS.DEBTS_REPAY, ...W },
    async run(tx, ctx, input) {
      if (!input.debtId) throw invalid("Choose the debt being repaid.");
      const r = await postRepayment(tx, { ...ctx, debtId: input.debtId, amount: input.amount, paymentMethod: input.paymentMethod || "CASH", reference: input.reference, idempotencyKey: ctx.key });
      return { referenceNo: r.transaction.referenceNo, transactionId: r.transaction.id, debtId: input.debtId };
    },
  },

  /** Cancels an old debt recorded by mistake (debts from sales are cancelled by voiding the sale). */
  "debt.cancel": {
    label: "Debt cancelled",
    access: MANAGE_DEBTS,
    async run(tx, ctx, input) {
      const debt = await cancelOpeningDebt(tx, { ...ctx, debtId: input.debtId, reason: input.reason });
      return { debtId: debt.id, referenceNo: debt.referenceNo };
    },
  },

  /** Adds or updates a customer in the department's directory. */
  "debtor.save": {
    label: "Customer",
    access: { permission: PERMISSIONS.DEBTS_REPAY, ...W },
    async run(tx, ctx, input) {
      if (input.id) {
        const existing = await tx.debtor.findFirst({ where: { id: input.id, departmentId: ctx.department.id } });
        if (!existing) throw notFound("Customer not found.");
        const name = String(input.name || "").trim();
        if (name.length < 2) throw invalid("Enter the customer's name.");
        const d = await tx.debtor.update({ where: { id: existing.id }, data: { name, phone: String(input.phone || "").trim() || null, notes: String(input.notes || "").trim() || null } });
        return { ...d, debtorId: d.id };
      }
      const d = await resolveDebtor(tx, { ...ctx, debtor: { name: input.name, phone: input.phone } });
      return { ...d, debtorId: d.id };
    },
  },


  // ─── Daily report ─────────────────────────────────────────────────────────
  "report.save": {
    label: "Report saved",
    timeout: 30000,
    access: { permission: PERMISSIONS.REPORTS_SUBMIT, ...W },
    run: (tx, ctx, input) => saveReport(tx, ctx, input, "DRAFT"),
  },
  "report.send": {
    label: "Report sent",
    timeout: 30000,
    access: { permission: PERMISSIONS.REPORTS_SUBMIT, ...W },
    run: (tx, ctx, input) => saveReport(tx, ctx, input, "SUBMITTED"),
    async after(ctx, result) {
      await sendReportSubmittedEmail({ organizationId: ctx.user.organizationId, department: ctx.department, dateKey: result.dateKey, totals: result.totals, reportId: result.reportId });
    },
  },
};
