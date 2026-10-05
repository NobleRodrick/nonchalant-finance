-- Sign-in security (additive). Existing sessions are signed out once: refresh tokens are now
-- stored as SHA-256 hashes, so the rows written before (plain tokens) are removed.
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

DELETE FROM "refresh_tokens";
