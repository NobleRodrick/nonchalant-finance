/**
 * Human-readable document numbers ("S-0142"), per department and document type.
 * Allocation is a single atomic UPSERT … RETURNING inside the caller's transaction, so two
 * cashiers posting at the same moment always get different consecutive numbers.
 */
export const DOC_TYPES = {
  SALE: "S",
  PURCHASE: "P",
  EXPENSE: "E",
  OTHER_EXPENSE: "X",
  RENT_INCOME: "R",
  OTHER_INCOME: "I",
  DISCOUNT: "K",
  DEBT: "D",
  DEBT_PAYMENT: "Y",
  CASH_HANDOVER: "H",
  STOCK_ADDED: "A",
  CORRECTION: "C",
  DAILY_REPORT: "DR",
  BOOKING: "B",
  BOOKING_PAYMENT: "RC",
  BOOKING_REFUND: "RF",
  BOOKING_CHARGE: "CH",
  ROOM_STAY: "RB",
  ASSET_MOVEMENT: "AM",
  REPAIR: "MR",
};

export const DOC_TYPE_LABELS = {
  S: "Sale",
  P: "Purchase",
  E: "Expense",
  X: "Other expense",
  R: "Rent income",
  I: "Other income",
  K: "Discount",
  D: "Debt",
  Y: "Debt repayment",
  H: "Cash handover",
  A: "Stock added",
  C: "Stock correction",
  DR: "Daily report",
  B: "Booking",
  RC: "Booking payment receipt",
  RF: "Booking refund",
  CH: "Booking charge",
  RB: "Room stay",
  AM: "Asset movement",
  MR: "Repair",
};

export function formatReference(docType, value) {
  return `${docType}-${String(value).padStart(4, "0")}`;
}

/** Allocates the next number. `tx` is the Prisma transaction client. */
export async function nextReference(tx, departmentId, docType) {
  const rows = await tx.$queryRaw`
    INSERT INTO "document_sequences" ("id", "departmentId", "docType", "nextValue")
    VALUES (gen_random_uuid()::text, ${departmentId}, ${docType}, 2)
    ON CONFLICT ("departmentId", "docType")
    DO UPDATE SET "nextValue" = "document_sequences"."nextValue" + 1
    RETURNING "nextValue"`;
  const next = Number(rows[0].nextValue);
  return formatReference(docType, next - 1);
}

/** Printed form including the department code: "RST · S-0142". */
export function printedReference(departmentCode, referenceNo) {
  if (!referenceNo) return "—";
  return departmentCode ? `${departmentCode} · ${referenceNo}` : referenceNo;
}
