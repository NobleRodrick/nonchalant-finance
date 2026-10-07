/**
 * Operations of shops, bars, pressings, car washes and other activities (lib/operations/registry.js
 * for the definition format; docs/TRADE_AND_SERVICES_PLAN.md for the rules). The sales & stock
 * operations serve SHOP, BAR and OTHER; the job-ticket operations PRESSING, CAR_WASH and OTHER.
 */
import { PERMISSIONS } from "@/lib/permissions";
import { TRADE_DOMAINS, SERVICE_DOMAINS } from "@/lib/domains/trade";
import { adjustStock, archiveProduct, saveProduct } from "@/lib/trade/product-service";
import { recordTradeSale } from "@/lib/trade/sale-service";
import { addToTab, cancelTab, closeTab, openTab, removeTabLine } from "@/lib/trade/tab-service";
import { recordTradePurchase, voidTradePurchase } from "@/lib/trade/purchase-service";
import { movePackaging, savePackaging } from "@/lib/trade/packaging-service";
import { payBillCore } from "@/lib/accounting/bills";
import { archiveServiceItem, saveServiceItem, saveWorker } from "@/lib/services/catalog-service";
import { cancelTicket, compensateTicket, createTicket, markNotified, payWorker, recordTicketPayment, recordTicketRefund, stepTicket, updateTicket } from "@/lib/services/ticket-service";
import { saveServiceSettings } from "@/lib/services/settings";
import { saveClient } from "@/lib/clients/client-service";
import { saveProfile } from "@/lib/business-profile";
import { recordCashCount } from "@/lib/departments/cash-count-service";
import { toDateKey } from "@/lib/timezone";
import { writeIn } from "./helpers";

const T = (permission) => writeIn(TRADE_DOMAINS, permission);
const S = (permission) => writeIn(SERVICE_DOMAINS, permission);
const ALL = [...new Set([...TRADE_DOMAINS, ...SERVICE_DOMAINS])];

export const TRADE_OPERATIONS = {
  // ─── Products and stock ───────────────────────────────────────────────────
  /** A product (with its opening count and cost) or its details: barcode, prices, unit, crate. */
  "trade.product.save": { label: "Product", dated: true, access: T(PERMISSIONS.INVENTORY_MANAGE), run: saveProduct },
  /** No longer sold (history kept), or back. */
  "trade.product.archive": { label: "Product archived", access: T(PERMISSIONS.ITEMS_ARCHIVE), run: archiveProduct },
  /** A physical count, or goods lost (broken, expired, stolen): with a reason. */
  "trade.stock.adjust": { label: "Stock corrected", dated: true, access: T(PERMISSIONS.INVENTORY_MANAGE), run: adjustStock },

  // ─── Sales and tabs ───────────────────────────────────────────────────────
  /** A sale at the counter (products by name or barcode), paid or on credit. */
  "trade.sale.record": { label: "Sale", money: true, dated: true, access: T(PERMISSIONS.SALES_CREATE), run: recordTradeSale },
  "trade.tab.open": { label: "Tab opened", dated: true, access: T(PERMISSIONS.SALES_CREATE), run: openTab },
  "trade.tab.add": { label: "Round served", dated: true, access: T(PERMISSIONS.SALES_CREATE), run: addToTab },
  "trade.tab.remove": { label: "Line taken off a tab", access: T(PERMISSIONS.SALES_CREATE), run: removeTabLine },
  "trade.tab.close": { label: "Tab paid", money: true, dated: true, access: T(PERMISSIONS.SALES_CREATE), run: closeTab },
  "trade.tab.cancel": { label: "Tab cancelled", dated: true, access: T(PERMISSIONS.RECORDS_VOID), run: cancelTab },

  // ─── Purchases, suppliers, crates ─────────────────────────────────────────
  /** Goods bought (paid now, or on credit: a supplier bill), crates in and empties back (bar). */
  "trade.purchase.record": { label: "Purchase of goods", money: true, dated: true, access: T(PERMISSIONS.PURCHASES_CREATE), timeout: 30000, run: recordTradePurchase },
  "trade.purchase.void": { label: "Purchase voided", access: T(PERMISSIONS.RECORDS_VOID), timeout: 30000, run: voidTradePurchase },
  /** A supplier's bill of this department paid (all or part). */
  "trade.bill.pay": {
    label: "Supplier paid",
    money: true,
    dated: true,
    access: T(PERMISSIONS.PURCHASES_CREATE),
    async run(tx, ctx, input) {
      const company = await tx.company.findUnique({ where: { id: ctx.department.companyId } });
      const dateKey = toDateKey(ctx.date || ctx.now, ctx.timeZone);
      return payBillCore(tx, { user: ctx.user, company, timeZone: ctx.timeZone, departmentId: ctx.department.id }, { ...input, dateKey: input.dateKey || dateKey });
    },
  },
  "trade.packaging.save": { label: "Crate", access: writeIn(["BAR"], PERMISSIONS.INVENTORY_MANAGE), run: savePackaging },
  /** Empties back to the supplier, bottles taken / brought back by customers, breakage, counts. */
  "trade.packaging.move": { label: "Crates", money: true, dated: true, access: writeIn(["BAR"], PERMISSIONS.SALES_CREATE), run: movePackaging },

  // ─── Price list, workers, settings ────────────────────────────────────────
  "services.item.save": { label: "Price list", access: S(PERMISSIONS.SERVICES_MANAGE), run: saveServiceItem },
  "services.item.archive": { label: "Service archived", access: S(PERMISSIONS.ITEMS_ARCHIVE), run: archiveServiceItem },
  "services.worker.save": { label: "Washer", access: S(PERMISSIONS.SERVICES_MANAGE), run: saveWorker },
  "services.settings.save": { label: "Price list options", access: S(PERMISSIONS.SERVICES_MANAGE), run: saveServiceSettings },

  // ─── Tickets ──────────────────────────────────────────────────────────────
  /** Drop-off / arrival: items or services, express, tag numbers, plate, payment at once. */
  "services.ticket.create": { label: "Ticket", money: true, dated: true, access: S(PERMISSIONS.SERVICES_TICKET), run: createTicket },
  "services.ticket.update": { label: "Ticket changed", access: S(PERMISSIONS.SERVICES_TICKET), run: updateTicket },
  /** start | ready | collect (with the payment of the balance, or on the customer's credit). */
  "services.ticket.step": { label: "Ticket updated", money: true, dated: true, access: S(PERMISSIONS.SERVICES_TICKET), run: stepTicket },
  "services.ticket.cancel": { label: "Ticket cancelled", dated: true, access: S(PERMISSIONS.SERVICES_TICKET), run: cancelTicket },
  "services.payment.record": { label: "Payment", money: true, dated: true, access: S(PERMISSIONS.SERVICES_TICKET), run: recordTicketPayment },
  "services.refund.record": { label: "Refund", money: true, dated: true, access: S(PERMISSIONS.SERVICES_TICKET), run: recordTicketRefund },
  "services.ticket.compensate": { label: "Compensation", money: true, dated: true, access: S(PERMISSIONS.EXPENSES_CREATE), run: compensateTicket },
  "services.ticket.notified": { label: "Customer told", access: S(PERMISSIONS.SERVICES_TICKET), run: markNotified },
  "services.worker.pay": { label: "Washer paid", money: true, dated: true, access: S(PERMISSIONS.EXPENSES_CREATE), run: payWorker },

  // ─── Shared ───────────────────────────────────────────────────────────────
  "trade.client.save": { label: "Customer", access: writeIn(ALL, PERMISSIONS.SALES_CREATE), run: saveClient },
  "trade.profile.save": { label: "Business details", access: writeIn(ALL, PERMISSIONS.INVENTORY_MANAGE), run: saveProfile },
  "trade.cash.count": { label: "Cash count", dated: true, access: writeIn(ALL, PERMISSIONS.HANDOVER_CREATE), run: recordCashCount },
};
