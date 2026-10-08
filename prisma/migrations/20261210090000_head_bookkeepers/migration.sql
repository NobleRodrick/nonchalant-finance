-- Department heads the Boss authorizes to keep the books (whole company or their departments only).
CREATE TYPE "CompanyMemberScope" AS ENUM ('COMPANY', 'DEPARTMENTS');

ALTER TABLE "company_members"
  ADD COLUMN "scope" "CompanyMemberScope" NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "grantedById" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
