/**
 * After a load test (scripts/load-test.mjs) on the disposable test database: no rental item is held beyond what
 * is usable on any day, no booking is paid more than its price. Prints the counts as JSON.
 *   TEST_DATABASE_URL=… node scripts/load-check-rental.mjs
 */
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await c.connect();
const over = await c.query(`
  with days as (select generate_series(current_date - 1, current_date + 70, interval '1 day')::date d),
  held as (
    select l."itemId" as "itemId", d.d, sum(l.quantity) q
    from rental_order_lines l join rental_orders o on o.id = l."orderId" join days d on d.d between o."dispatchDate" and o."returnDate"
    where o.status in ('CONFIRMED','PREPARING') and l.kind = 'ITEM' group by l."itemId", d.d)
  select i.name, h.d, h.q, i.owned from held h join rental_items i on i.id = h."itemId" where h.q > i.owned - i.damaged - i."inRepair" - i.missing`);
const pay = await c.query(`
  select o."referenceNo", o."agreedPrice", sum(case when t.type='BOOKING_PAYMENT' then t.amount else -t.amount end) paid
  from rental_orders o join transactions t on t."rentalOrderId" = o.id and t.status <> 'VOIDED' and t.type in ('BOOKING_PAYMENT','BOOKING_REFUND')
  group by o.id having sum(case when t.type='BOOKING_PAYMENT' then t.amount else -t.amount end) > o."agreedPrice"`);
const counts = await c.query(`select count(*) orders, (select count(*) from audit_events where action='RENTAL_DOUBLE_BOOKING_REFUSED') refused, (select count(*) from transactions where type='BOOKING_PAYMENT' and "rentalOrderId" is not null) payments from rental_orders`);
console.log(JSON.stringify({ overbookedItemDays: over.rowCount, overpaidOrders: pay.rowCount, ...counts.rows[0] }));
await c.end();
