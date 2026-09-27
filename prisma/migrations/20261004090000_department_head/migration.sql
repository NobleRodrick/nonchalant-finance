-- Department head: the person the Boss puts in charge of a department (any job role).
-- Additive. Existing departments take their first active member whose role there is MANAGER.

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "headUserId" TEXT;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_headUserId_fkey" FOREIGN KEY ("headUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill
UPDATE "departments" d
SET "headUserId" = pick."userId"
FROM (
  SELECT DISTINCT ON (ud."departmentId") ud."departmentId", ud."userId"
  FROM "user_departments" ud
  JOIN "users" u ON u."id" = ud."userId"
  WHERE ud."isActive" AND u."isActive" AND COALESCE(ud."roleOverride"::text, u."role"::text) = 'MANAGER'
  ORDER BY ud."departmentId", ud."isPrimary" DESC, ud."createdAt" ASC
) pick
WHERE d."id" = pick."departmentId" AND d."headUserId" IS NULL;
