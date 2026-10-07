-- Shop, bar, pressing, car wash and other activities (docs/TRADE_AND_SERVICES_PLAN.md). Additive:
-- products, stock movements, sale lines, bar tabs, purchases, crates and deposits; price lists,
-- job tickets, workers; links from money records.

CREATE TYPE "TradeProductKind" AS ENUM ('GOODS', 'SERVICE');
CREATE TYPE "TradeMovementKind" AS ENUM ('OPENING', 'PURCHASE', 'SALE', 'RETURN', 'COUNT', 'LOSS', 'PURCHASE_VOID');
CREATE TYPE "TradeTabStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
CREATE TYPE "PackagingMoveKind" AS ENUM ('RECEIVED', 'RETURNED', 'CUSTOMER_OUT', 'CUSTOMER_BACK', 'BROKEN', 'COUNT');
CREATE TYPE "ServiceTicketStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'READY', 'COLLECTED', 'CANCELLED');
CREATE TYPE "CommissionType" AS ENUM ('NONE', 'PERCENT', 'FIXED');

CREATE TABLE "trade_products" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "kind" "TradeProductKind" NOT NULL DEFAULT 'GOODS',
    "salePrice" INTEGER NOT NULL,
    "costPrice" INTEGER NOT NULL DEFAULT 0,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lowStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packagingId" TEXT,
    "unitsPerPack" INTEGER NOT NULL DEFAULT 1,
    "supplierName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "trade_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trade_movements" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "TradeMovementKind" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transactionId" TEXT,
    "tabLineId" TEXT,
    "purchaseId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trade_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trade_sale_lines" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "unitCost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trade_sale_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trade_tabs" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "TradeTabStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "transactionId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "trade_tabs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trade_tab_lines" (
    "id" TEXT NOT NULL,
    "tabId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    CONSTRAINT "trade_tab_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trade_purchases" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierRef" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "goodsTotal" INTEGER NOT NULL,
    "depositTotal" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "supplierBillId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "voidReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trade_purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trade_purchase_lines" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    CONSTRAINT "trade_purchase_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trade_packagings" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supplierName" TEXT,
    "deposit" INTEGER NOT NULL,
    "bottleDeposit" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trade_packagings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "packaging_movements" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "packagingId" TEXT NOT NULL,
    "kind" "PackagingMoveKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "partyName" TEXT,
    "transactionId" TEXT,
    "purchaseId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "packaging_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_items" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "basePrice" INTEGER NOT NULL DEFAULT 0,
    "prices" JSONB,
    "unit" TEXT NOT NULL DEFAULT 'item',
    "commissionType" "CommissionType" NOT NULL DEFAULT 'NONE',
    "commissionValue" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_workers" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_workers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_tickets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "clientId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "vehiclePlate" TEXT,
    "vehicleType" TEXT,
    "status" "ServiceTicketStatus" NOT NULL DEFAULT 'RECEIVED',
    "express" BOOLEAN NOT NULL DEFAULT false,
    "surchargePct" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "tagNo" TEXT,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "promisedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_ticket_lines" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "itemId" TEXT,
    "variant" TEXT,
    "label" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "workerId" TEXT,
    "commission" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "service_ticket_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trade_products_departmentId_code_key" ON "trade_products"("departmentId", "code");
CREATE UNIQUE INDEX "trade_products_departmentId_barcode_key" ON "trade_products"("departmentId", "barcode");
CREATE INDEX "trade_products_departmentId_name_idx" ON "trade_products"("departmentId", "name");
CREATE INDEX "trade_movements_departmentId_date_idx" ON "trade_movements"("departmentId", "date");
CREATE INDEX "trade_movements_productId_date_idx" ON "trade_movements"("productId", "date");
CREATE INDEX "trade_movements_transactionId_idx" ON "trade_movements"("transactionId");
CREATE INDEX "trade_sale_lines_transactionId_idx" ON "trade_sale_lines"("transactionId");
CREATE INDEX "trade_sale_lines_departmentId_productId_idx" ON "trade_sale_lines"("departmentId", "productId");
CREATE UNIQUE INDEX "trade_tabs_transactionId_key" ON "trade_tabs"("transactionId");
CREATE UNIQUE INDEX "trade_tabs_departmentId_referenceNo_key" ON "trade_tabs"("departmentId", "referenceNo");
CREATE INDEX "trade_tabs_departmentId_status_idx" ON "trade_tabs"("departmentId", "status");
CREATE INDEX "trade_tab_lines_tabId_idx" ON "trade_tab_lines"("tabId");
CREATE UNIQUE INDEX "trade_purchases_departmentId_referenceNo_key" ON "trade_purchases"("departmentId", "referenceNo");
CREATE INDEX "trade_purchases_departmentId_date_idx" ON "trade_purchases"("departmentId", "date");
CREATE INDEX "trade_purchase_lines_purchaseId_idx" ON "trade_purchase_lines"("purchaseId");
CREATE UNIQUE INDEX "trade_packagings_departmentId_name_key" ON "trade_packagings"("departmentId", "name");
CREATE INDEX "packaging_movements_departmentId_date_idx" ON "packaging_movements"("departmentId", "date");
CREATE INDEX "packaging_movements_packagingId_idx" ON "packaging_movements"("packagingId");
CREATE UNIQUE INDEX "service_items_departmentId_name_key" ON "service_items"("departmentId", "name");
CREATE UNIQUE INDEX "service_workers_departmentId_name_key" ON "service_workers"("departmentId", "name");
CREATE UNIQUE INDEX "service_tickets_departmentId_referenceNo_key" ON "service_tickets"("departmentId", "referenceNo");
CREATE INDEX "service_tickets_departmentId_status_idx" ON "service_tickets"("departmentId", "status");
CREATE INDEX "service_tickets_departmentId_receivedAt_idx" ON "service_tickets"("departmentId", "receivedAt");
CREATE INDEX "service_tickets_departmentId_collectedAt_idx" ON "service_tickets"("departmentId", "collectedAt");
CREATE INDEX "service_tickets_departmentId_vehiclePlate_idx" ON "service_tickets"("departmentId", "vehiclePlate");
CREATE INDEX "service_ticket_lines_ticketId_idx" ON "service_ticket_lines"("ticketId");
CREATE INDEX "service_ticket_lines_workerId_idx" ON "service_ticket_lines"("workerId");

ALTER TABLE "trade_products" ADD CONSTRAINT "trade_products_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trade_products" ADD CONSTRAINT "trade_products_packagingId_fkey" FOREIGN KEY ("packagingId") REFERENCES "trade_packagings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "trade_movements" ADD CONSTRAINT "trade_movements_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trade_movements" ADD CONSTRAINT "trade_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "trade_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trade_sale_lines" ADD CONSTRAINT "trade_sale_lines_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trade_sale_lines" ADD CONSTRAINT "trade_sale_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "trade_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trade_tabs" ADD CONSTRAINT "trade_tabs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trade_tabs" ADD CONSTRAINT "trade_tabs_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "trade_tab_lines" ADD CONSTRAINT "trade_tab_lines_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "trade_tabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trade_tab_lines" ADD CONSTRAINT "trade_tab_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "trade_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trade_purchases" ADD CONSTRAINT "trade_purchases_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trade_purchase_lines" ADD CONSTRAINT "trade_purchase_lines_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "trade_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trade_purchase_lines" ADD CONSTRAINT "trade_purchase_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "trade_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trade_packagings" ADD CONSTRAINT "trade_packagings_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_movements" ADD CONSTRAINT "packaging_movements_packagingId_fkey" FOREIGN KEY ("packagingId") REFERENCES "trade_packagings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "packaging_movements" ADD CONSTRAINT "packaging_movements_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_workers" ADD CONSTRAINT "service_workers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "venue_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_ticket_lines" ADD CONSTRAINT "service_ticket_lines_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "service_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_ticket_lines" ADD CONSTRAINT "service_ticket_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_ticket_lines" ADD CONSTRAINT "service_ticket_lines_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "service_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Money records of a purchase, a ticket or a worker's commission
ALTER TABLE "transactions" ADD COLUMN "tradePurchaseId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "serviceTicketId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "serviceWorkerId" TEXT;
CREATE INDEX "transactions_tradePurchaseId_idx" ON "transactions"("tradePurchaseId");
CREATE INDEX "transactions_serviceTicketId_idx" ON "transactions"("serviceTicketId");
CREATE INDEX "transactions_serviceWorkerId_date_idx" ON "transactions"("serviceWorkerId", "date");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tradePurchaseId_fkey" FOREIGN KEY ("tradePurchaseId") REFERENCES "trade_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_serviceTicketId_fkey" FOREIGN KEY ("serviceTicketId") REFERENCES "service_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_serviceWorkerId_fkey" FOREIGN KEY ("serviceWorkerId") REFERENCES "service_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rules the database keeps too
ALTER TABLE "trade_products" ADD CONSTRAINT "trade_products_amounts_check" CHECK ("salePrice" >= 0 AND "costPrice" >= 0 AND "lowStock" >= 0 AND "unitsPerPack" >= 1 AND ("kind" = 'SERVICE' OR "quantity" >= 0));
ALTER TABLE "trade_sale_lines" ADD CONSTRAINT "trade_sale_lines_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "total" >= 0 AND "discount" >= 0);
ALTER TABLE "trade_tab_lines" ADD CONSTRAINT "trade_tab_lines_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0);
ALTER TABLE "trade_purchases" ADD CONSTRAINT "trade_purchases_check" CHECK ("goodsTotal" >= 0 AND "depositTotal" >= 0);
ALTER TABLE "trade_purchase_lines" ADD CONSTRAINT "trade_purchase_lines_check" CHECK ("quantity" > 0 AND "unitCost" >= 0);
ALTER TABLE "trade_packagings" ADD CONSTRAINT "trade_packagings_check" CHECK ("deposit" >= 0 AND "bottleDeposit" >= 0);
ALTER TABLE "packaging_movements" ADD CONSTRAINT "packaging_movements_check" CHECK ("amount" >= 0 AND ("kind" = 'COUNT' OR "quantity" > 0));
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_check" CHECK ("basePrice" >= 0 AND "commissionValue" >= 0 AND ("commissionType" <> 'PERCENT' OR "commissionValue" <= 100));
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_check" CHECK ("total" >= 0 AND "discount" >= 0 AND "surchargePct" BETWEEN 0 AND 300);
ALTER TABLE "service_ticket_lines" ADD CONSTRAINT "service_ticket_lines_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "commission" >= 0);
