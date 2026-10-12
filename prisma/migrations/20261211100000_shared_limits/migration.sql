-- Attempt counters shared by every server instance (sign-in lockout, abuse limits).
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "rate_limits_resetAt_idx" ON "rate_limits"("resetAt");
