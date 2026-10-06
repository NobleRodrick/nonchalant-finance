/**
 * The documents of an event rental booking (pure: titles, what each shows, default terms).
 * Each is a printable page (save as PDF from the print dialog).
 */
export const DOCUMENT_KINDS = {
  quotation: { title: "Quotation", lead: "Thank you for your interest. Here is our offer for your event.", payments: false, terms: "payment", signatures: false },
  confirmation: { title: "Booking confirmation", lead: "We confirm your booking. The items below are reserved for your event.", payments: true, terms: "payment", signatures: false },
  invoice: { title: "Invoice", lead: null, payments: true, terms: "payment", signatures: false },
  contract: { title: "Rental agreement", lead: "Between the business and the customer named below, for the items and services listed.", payments: true, terms: "contract", signatures: true },
  receipt: { title: "Receipt", lead: null, payments: true, terms: null, signatures: false },
};

export const DEFAULT_PAYMENT_TERMS = "A deposit confirms the booking. The balance is due before the items leave, unless agreed otherwise in writing. Payments by Mobile Money or bank transfer carry their transaction reference.";

export const DEFAULT_CONTRACT_TERMS = [
  "1. The items remain the property of the business. They are used only at the event and place stated, between the dispatch and return dates.",
  "2. The customer checks the items when they are delivered and is responsible for them until they are returned.",
  "3. Items are counted when they come back. Items damaged, broken or missing are charged at their replacement value, or at the cost of their repair.",
  "4. Items returned after the return date may be charged for the extra days.",
  "5. A booking cancelled by the customer: the deposit may be kept to cover the costs already incurred.",
  "6. Services (decoration, transport, set-up) are provided as described above. Any change is agreed in writing.",
].join("\n");
