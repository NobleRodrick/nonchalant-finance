/**
 * The newest database migration this code needs. A unit test keeps it equal to the last folder in
 * prisma/migrations, so it cannot be forgotten when a migration is added.
 * Read by GET /api/health/db to tell whether `npx prisma migrate deploy` was run on production.
 */
export const LATEST_MIGRATION = "20261201090000_production_farm_salon";
