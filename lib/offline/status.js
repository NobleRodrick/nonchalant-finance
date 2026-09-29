/** Life of an operation in the outbox (lib/offline/outbox.js). */
export const STATUS = { PENDING: "pending", SENDING: "sending", APPLIED: "applied", REJECTED: "rejected" };
