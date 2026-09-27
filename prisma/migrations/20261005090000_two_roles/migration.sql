-- Two roles only: the Boss (ADMIN) and department heads (HEAD). Everyone the Boss adds is a
-- department head of every department they are assigned to; their job title is free text.
-- Existing people keep their old role as their title (Manager, Accountant, Cashier).

-- 1. Title given by the Boss
ALTER TABLE "users" ADD COLUMN "title" TEXT;
UPDATE "users" SET "title" = CASE "role"::text
    WHEN 'MANAGER' THEN 'Manager'
    WHEN 'ACCOUNTANT' THEN 'Accountant'
    WHEN 'STAFF' THEN 'Cashier'
    ELSE NULL END
WHERE "title" IS NULL;

-- 2. Roles: ADMIN stays the Boss, everyone else becomes HEAD
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'HEAD');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'ADMIN' ELSE 'HEAD' END)::"UserRole_new";
ALTER TABLE "user_departments" DROP COLUMN "roleOverride";
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'HEAD';
COMMIT;

-- 3. The single-head column of the previous step is replaced by the assignments themselves
ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_headUserId_fkey";
ALTER TABLE "departments" DROP COLUMN IF EXISTS "headUserId";
