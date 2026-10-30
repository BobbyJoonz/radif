import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { prisma } from "@/server/db";
import { seedRichDemo } from "@/server/demo/rich";

/**
 * First-run provisioning for a fresh deployment.
 *
 * A managed database (Neon, Supabase, Vercel Postgres) starts empty: no tables,
 * no rows, and `prisma migrate deploy` needs a shell. This module applies the
 * migration SQL with a plain pg client and records each migration in
 * `_prisma_migrations` with its real checksum, so a later `migrate deploy` sees
 * exactly the state Prisma itself would have written.
 *
 * It applies **every pending folder, in order**. The earlier version applied only
 * the first one, which left a freshly provisioned database without the columns
 * added by later migrations — a real `ColumnNotFound` on a brand-new install.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

const BOOKKEEPING = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) NOT NULL PRIMARY KEY,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

type Migration = { name: string; sql: string; checksum: string };

async function pendingMigrations(): Promise<Migration[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const migrations: Migration[] = [];
  for (const folder of folders) {
    const file = path.join(MIGRATIONS_DIR, folder, "migration.sql");
    const sql = await readFile(file, "utf8");
    migrations.push({ name: folder, sql, checksum: createHash("sha256").update(sql).digest("hex") });
  }
  return migrations;
}

export async function schemaExists(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Applies every migration that is not recorded yet. Safe to call repeatedly. */
export async function applyMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const migrations = await pendingMigrations();
  if (migrations.length === 0) return { applied: [], skipped: [] };

  const client = new Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    await client.query(BOOKKEEPING);
    const done = await client.query<{ migration_name: string }>(`SELECT "migration_name" FROM "_prisma_migrations"`);
    const recorded = new Set(done.rows.map((row) => row.migration_name));

    for (const migration of migrations) {
      if (recorded.has(migration.name)) {
        skipped.push(migration.name);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO "_prisma_migrations"
             ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
           VALUES ($1,$2,now(),$3,NULL,NULL,now(),1)
           ON CONFLICT DO NOTHING`,
          [randomUUID(), migration.checksum, migration.name],
        );
        await client.query("COMMIT");
        applied.push(migration.name);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    }
  } finally {
    await client.end();
  }
  return { applied, skipped };
}

/**
 * The demo shop(s). One thin delegation, so a fresh install, a half-provisioned
 * deploy and `?enrich=1` on a live one all get the same rich, idempotent dataset.
 */
export async function bootstrapDemo(): Promise<{ tenant: string; user: string }> {
  await seedRichDemo();
  return { tenant: "tenant_toranj", user: "user_maryam" };
}
