/**
 * Compares the Prisma schema with a database built from prisma/migrations: every model's table,
 * every scalar field's column (and nullability), every enum's values. Catches a hand-written
 * migration that does not match schema.prisma. Usage: TEST_DATABASE_URL=… node scripts/check-schema-drift.mjs
 */
import pg from "pg";
import fs from "node:fs";

const SCALARS = new Set(["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes"]);

/** Models (table, columns with nullability) and enums of prisma/schema.prisma. */
function readSchema(file = "prisma/schema.prisma") {
  // Comments are dropped first: a brace in a comment would end a model block early.
  const text = fs.readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
  const enums = new Map();
  for (const m of text.matchAll(/^enum (\w+) \{([^}]*)\}/gm)) {
    enums.set(m[1], m[2].split("\n").map((l) => l.replace(/\/\/.*$/, "").trim().split(/\s+/)[0]).filter(Boolean));
  }
  const models = [];
  for (const m of text.matchAll(/^model (\w+) \{([^}]*)\}/gm)) {
    const body = m[2];
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] || m[1];
    const columns = [];
    for (const line of body.split("\n")) {
      const f = line.replace(/\/\/.*$/, "").trim().match(/^(\w+)\s+(\w+)(\?|\[\])?(.*)$/);
      if (!f || f[3] === "[]") continue;
      if (!SCALARS.has(f[2]) && !enums.has(f[2])) continue; // a relation
      columns.push({ name: f[4].match(/@map\("([^"]+)"\)/)?.[1] || f[1], nullable: f[3] === "?" });
    }
    models.push({ name: m[1], table, columns });
  }
  return { models, enums };
}

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");
const client = new pg.Client({ connectionString: url });
await client.connect();
const problems = [];
try {
  const { rows: cols } = await client.query(
    `SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public'`
  );
  const byTable = new Map();
  for (const c of cols) {
    if (!byTable.has(c.table_name)) byTable.set(c.table_name, new Map());
    byTable.get(c.table_name).set(c.column_name, c.is_nullable === "YES");
  }
  const schema = readSchema();
  for (const model of schema.models) {
    const columns = byTable.get(model.table);
    if (!columns) {
      problems.push(`missing table ${model.table} (model ${model.name})`);
      continue;
    }
    for (const c of model.columns) {
      if (!columns.has(c.name)) problems.push(`missing column ${model.table}.${c.name}`);
      else if (columns.get(c.name) !== c.nullable) problems.push(`nullability differs: ${model.table}.${c.name}`);
    }
  }
  const { rows: enums } = await client.query(
    `SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid ORDER BY e.enumsortorder`
  );
  const dbEnums = new Map();
  for (const e of enums) dbEnums.set(e.typname, [...(dbEnums.get(e.typname) || []), e.enumlabel]);
  for (const [name, values] of schema.enums) {
    const db = dbEnums.get(name);
    if (!db) problems.push(`missing enum ${name}`);
    else for (const v of values) if (!db.includes(v)) problems.push(`enum ${name} lacks ${v}`);
  }
} finally {
  await client.end();
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Schema and migrations match.");
