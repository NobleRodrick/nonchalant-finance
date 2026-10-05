/**
 * Every write a department head makes, as named operations. The same definition serves the
 * server actions (forms, tests) and the offline outbox (app/api/sync), so a sale recorded
 * offline follows exactly the rules of a sale recorded online.
 *
 * A definition:
 *   access      department permission check (object, or function of the input)
 *   scope       "department" (default) or "organization"
 *   dated       the record carries a business date (input.dateKey / the device's occurredAt)
 *   money       writes a money record whose idempotency key is on the transaction as well
 *   departmentOf(input, user)   department of a record addressed by id (voids)
 *   run(tx, ctx, input)         the change, inside the operation's database transaction;
 *                               returns the result (ids a later operation may refer to)
 *   after(ctx, result, input)   side effects after commit (e-mails)
 */
import { BOSS_OPERATIONS } from "./boss";
import { COMMON_OPERATIONS } from "./common";
import { RESTAURANT_OPERATIONS } from "./restaurant";
import { VENUE_OPERATIONS } from "./venue";
import { ROOMS_OPERATIONS } from "./rooms";

/** Every operation, by kind. Each department type keeps its own file; kinds are unique. */
const OPERATIONS = {};
for (const group of [BOSS_OPERATIONS, COMMON_OPERATIONS, RESTAURANT_OPERATIONS, VENUE_OPERATIONS, ROOMS_OPERATIONS]) {
  for (const [kind, def] of Object.entries(group)) {
    if (OPERATIONS[kind]) throw new Error(`Operation "${kind}" is defined twice.`);
    OPERATIONS[kind] = def;
  }
}

export const OPERATION_KINDS = Object.keys(OPERATIONS);

export function getOperation(kind) {
  return Object.prototype.hasOwnProperty.call(OPERATIONS, kind) ? OPERATIONS[kind] : null;
}
