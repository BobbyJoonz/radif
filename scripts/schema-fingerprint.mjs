#!/usr/bin/env node
/**
 * Schema fingerprint — a reproducible drift check without the Prisma CLI.
 *
 * `prisma migrate diff` needs a shadow database and a working CLI; this reads the
 * catalogue directly, so it can answer one question anywhere a `pg` client runs:
 * *does a database built by replaying prisma/migrations have the same structure as
 * the database the app is actually using?*
 *
 *   node scripts/schema-fingerprint.mjs                       # fingerprints DATABASE_URL
 *   node scripts/schema-fingerprint.mjs --compare <other-url>  # exits 1 on any difference
 *
 * It covers tables, columns (type, nullability, default), primary keys, unique
 * indexes, foreign keys and check constraints — the things a drop-and-restore
 * migration chain is most likely to lose.
 */
import { createHash } from "node:crypto";
import { Client } from "pg";

function urlFrom(argv) {
  const index = argv.indexOf("--compare");
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  return process.env.DATABASE_URL;
}

const QUERY = `
  with cols as (
    select c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod)
             || ':' || case when a.attnotnull then 'not-null' else 'null' end
             || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') as line
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
  ), cons as (
    select conrelid::regclass::text || ':' || conname || ':' || pg_get_constraintdef(oid) as line
    from pg_constraint
    where connamespace = 'public'::regnamespace
  ), idx as (
    select indexname || ':' || indexdef as line
    from pg_indexes where schemaname = 'public'
  )
  select line from cols
  union all select line from cons
  union all select line from idx
  order by 1
`;

async function fingerprint(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(QUERY);
    const lines = rows.map((row) => row.line);
    return {
      count: lines.length,
      hash: createHash("sha256").update(lines.join("\n")).digest("hex"),
      lines,
    };
  } finally {
    await client.end();
  }
}

const primaryUrl = process.env.DATABASE_URL;
if (!primaryUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}

const primary = await fingerprint(primaryUrl);
const otherUrl = urlFrom(process.argv);

if (!otherUrl) {
  console.log(`schema lines: ${primary.count}`);
  console.log(`fingerprint:  ${primary.hash}`);
  process.exit(0);
}

const other = await fingerprint(otherUrl);
console.log(`base:    ${primary.count} lines  ${primary.hash}`);
console.log(`compare: ${other.count} lines  ${other.hash}`);

if (primary.hash === other.hash) {
  console.log("identical: the replay of prisma/migrations matches the live schema");
  process.exit(0);
}

const base = new Set(primary.lines);
const target = new Set(other.lines);
const onlyInBase = [...base].filter((line) => !target.has(line));
const onlyInTarget = [...target].filter((line) => !base.has(line));

console.error("DRIFT");
for (const line of onlyInBase.slice(0, 40)) console.error(`  only in ${new URL(primaryUrl).pathname.slice(1)}: ${line}`);
for (const line of onlyInTarget.slice(0, 40)) console.error(`  only in ${new URL(otherUrl).pathname.slice(1)}: ${line}`);
process.exit(1);
