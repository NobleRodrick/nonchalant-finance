import { db } from "@/lib/prisma";
import { LATEST_MIGRATION } from "@/lib/schema-version";

export const dynamic = "force-dynamic";

/**
 * Is the database reachable, and does it have every migration this code needs?
 * Public on purpose (monitoring, checking a deployment) — it returns no data and no secrets:
 * { ok, database: "reachable" | "unreachable", schema: "current" | "behind" | "unknown", needs, ms }.
 * `schema: "behind"` means: run `npx prisma migrate deploy` from the owner's computer.
 */
export async function GET() {
  const started = Date.now();
  const headers = { "Cache-Control": "no-store" };
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return Response.json({ ok: false, database: "unreachable", schema: "unknown", ms: Date.now() - started }, { status: 503, headers });
  }
  let schema = "unknown";
  try {
    const rows = await db.$queryRaw`
      SELECT 1 FROM "_prisma_migrations"
      WHERE migration_name = ${LATEST_MIGRATION} AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      LIMIT 1`;
    schema = rows.length ? "current" : "behind";
  } catch {
    schema = "unknown"; // no migrations table (a database built without `prisma migrate`, e.g. the test harness)
  }
  const ok = schema !== "behind";
  return Response.json({ ok, database: "reachable", schema, needs: LATEST_MIGRATION, ms: Date.now() - started }, { status: ok ? 200 : 503, headers });
}
