/**
 * Crates and empty bottles of a bar (emballages / consignes). Crates come in full with purchases
 * (lib/trade/purchase-service.js); here: empties given back to the supplier (deposit refunded),
 * customers taking bottles away (deposit received) and bringing them back (deposit refunded),
 * breakage (the deposit is lost: a cost), and counts of the empties on hand. Deposits are never
 * income or expense: they sit in 4094 (paid to suppliers) and 4194 (received from customers).
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { assertCanPost } from "@/lib/posting-guard";
import { DOC_TYPES } from "@/lib/documents/sequence";
import { PAID_METHODS, createTransaction, departmentDrawer } from "@/lib/finance/posting-service";
import { francs, text, whole } from "@/lib/property/input";
import { packagingBalances } from "./stock-math";

export async function savePackaging(tx, ctx, input) {
  const name = text(input.name, 80);
  if (!name) throw invalid("Name the crate, e.g. “SABC crate (12)”.");
  const data = { name, supplierName: text(input.supplierName, 120), deposit: francs(input.deposit, "The deposit of a crate", { required: true }), bottleDeposit: francs(input.bottleDeposit, "The deposit of a bottle"), isActive: input.isActive === undefined ? true : Boolean(input.isActive) };
  const clash = await tx.tradePackaging.findFirst({ where: { departmentId: ctx.department.id, name: { equals: name, mode: "insensitive" }, ...(input.id ? { NOT: { id: input.id } } : {}) } });
  if (clash) throw conflict(`"${name}" already exists.`);
  const p = input.id
    ? await tx.tradePackaging.update({ where: { id: (await packagingOf(tx, ctx.department, input.id)).id }, data })
    : await tx.tradePackaging.create({ data: { ...data, departmentId: ctx.department.id } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: input.id ? "PACKAGING_UPDATED" : "PACKAGING_CREATED", entityType: "TradePackaging", entityId: p.id, after: data });
  return { packagingId: p.id };
}

async function packagingOf(tx, department, id) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trade-packaging:${id || "-"}`}))`;
  const p = await tx.tradePackaging.findFirst({ where: { id: id || "-", departmentId: department.id } });
  if (!p) throw notFound("Crate not found in this bar.");
  return p;
}

export async function balancesOf(tx, packagingId) {
  const moves = await tx.packagingMovement.findMany({ where: { packagingId, voidedAt: null }, select: { kind: true, quantity: true, amount: true } });
  return packagingBalances(moves);
}

const KINDS = {
  RETURNED: { label: "Empties returned to the supplier", money: "in", category: "packaging-deposit-back" },
  CUSTOMER_OUT: { label: "Bottles taken by a customer", money: "in", category: "packaging-deposit" },
  CUSTOMER_BACK: { label: "Bottles brought back by a customer", money: "out", category: "packaging-deposit-refund" },
  BROKEN: { label: "Crates broken or lost", money: null },
  COUNT: { label: "Empties counted", money: null },
};

/**
 * One crate movement: kind RETURNED | CUSTOMER_OUT | CUSTOMER_BACK (in bottles) | BROKEN | COUNT.
 * Deposits move money (cash, MoMo, bank) unless `noDeposit` (crates lent without deposit).
 */
export async function movePackaging(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const k = KINDS[input.kind];
  if (!k) throw invalid("Choose what happened to the crates.");
  const p = await packagingOf(tx, department, input.packagingId);
  const b = await balancesOf(tx, p.id);
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  let quantity;
  if (input.kind === "COUNT") {
    const counted = whole(input.counted, "The crates counted", { min: 0 });
    if (counted === null) throw invalid("Enter the crates counted.");
    quantity = counted - b.onHand;
    if (!quantity) throw invalid(`The register already shows ${counted} crate(s) here.`);
  } else {
    quantity = whole(input.quantity, "The quantity", { min: 1 });
    if (!quantity) throw invalid("Enter how many.");
  }
  if (input.kind === "RETURNED" && quantity > b.owedToSuppliers) throw conflict(`Only ${b.owedToSuppliers} crate(s) are owed back to suppliers.`);
  if (input.kind === "CUSTOMER_BACK" && quantity > b.bottlesWithCustomers) throw conflict(`Customers hold only ${b.bottlesWithCustomers} bottle(s).`);
  if (input.kind === "BROKEN" && quantity > b.onHand) throw conflict(`Only ${b.onHand} crate(s) are here.`);
  const unit = ["CUSTOMER_OUT", "CUSTOMER_BACK"].includes(input.kind) ? p.bottleDeposit : p.deposit;
  const amount = input.kind === "COUNT" || input.noDeposit ? 0 : quantity * unit;
  const reason = text(input.note, 300);
  if (["BROKEN", "COUNT"].includes(input.kind) && !reason) throw invalid("Say what happened.");
  let transaction = null;
  if (k.money && amount) {
    const method = input.paymentMethod || "CASH";
    if (!PAID_METHODS.includes(method)) throw invalid("Choose how the deposit was paid.");
    const account = await departmentDrawer(tx, { user, departmentId: department.id });
    transaction = await createTransaction(tx, { user, department, docType: k.money === "in" ? DOC_TYPES.BOOKING_PAYMENT : DOC_TYPES.BOOKING_REFUND, data: { type: k.money === "in" ? "BOOKING_PAYMENT" : "BOOKING_REFUND", amount, paymentMethod: method, counterparty: text(input.partyName, 120) || p.supplierName, reference: text(input.reference, 80), description: `${k.label}: ${quantity} × ${p.name}`, category: k.category, date, accountId: account.id } });
  }
  const m = await tx.packagingMovement.create({ data: { departmentId: department.id, packagingId: p.id, kind: input.kind, quantity, amount: input.kind === "BROKEN" ? quantity * p.deposit : amount, partyName: text(input.partyName, 120), transactionId: transaction?.id || null, date, note: reason, createdById: user.id } });
  await recordAudit(tx, { user, departmentId: department.id, action: `PACKAGING_${input.kind}`, entityType: "TradePackaging", entityId: p.id, after: { quantity, amount: m.amount, note: reason } });
  return { movementId: m.id, quantity, amount: m.amount, referenceNo: transaction?.referenceNo || null };
}
