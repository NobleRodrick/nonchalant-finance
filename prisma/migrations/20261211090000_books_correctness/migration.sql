-- Exact value of each product's stock (average cost = value ÷ quantity; the last unit out takes the
-- remainder). Starts from the sum of the product's movement values, which is what the books hold.
ALTER TABLE "trade_products" ADD COLUMN "stockValue" INTEGER NOT NULL DEFAULT 0;

UPDATE "trade_products" p
SET "stockValue" = COALESCE((SELECT SUM(m."value") FROM "trade_movements" m WHERE m."productId" = p."id"), 0)
WHERE p."kind" <> 'SERVICE';
