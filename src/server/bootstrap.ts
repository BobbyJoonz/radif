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
 * no rows. `prisma migrate deploy` is the correct tool, but it needs the repo and
 * a shell — and the whole point of this route is that a deployment can be brought
 * up from a browser by the person who owns it, without local tooling.
 *
 * Safety, in order:
 *   • it refuses to do anything unless the schema is actually missing (nothing to
 *     damage, nothing to overwrite);
 *   • it refuses outside demo mode;
 *   • it records the migration in `_prisma_migrations` with the real checksum, so
 *     a later `prisma migrate deploy` sees the same state Prisma itself would.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

async function pendingMigration(): Promise<{ name: string; file: string; checksum: string } | null> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const folder = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()[0];
  if (!folder) return null;
  const file = path.join(MIGRATIONS_DIR, folder, "migration.sql");
  const sql = await readFile(file, "utf8");
  return { name: folder, file, checksum: createHash("sha256").update(sql).digest("hex") };
}

export async function schemaExists(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Applies the migration SQL with a plain pg client (multi-statement, one txn). */
export async function applyMigrations(): Promise<{ applied: string[] }> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const migration = await pendingMigration();
  if (!migration) return { applied: [] };

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(await readFile(migration.file, "utf8"));
    // Prisma creates its bookkeeping table itself; a hand-applied migration has
    // to do the same, or the INSERT below (and any later `migrate deploy`) fails.
    await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
    await client.query(
      `INSERT INTO "_prisma_migrations"
         ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
       VALUES ($1,$2,now(),$3,NULL,NULL,now(),1)
       ON CONFLICT DO NOTHING`,
      [randomUUID(), migration.checksum, migration.name],
    );
    await client.query("COMMIT");
    return { applied: [migration.name] };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * The smallest data set that makes the product demonstrable: one shop, an owner,
 * one operator, three conversations with real Persian messages, and the task that
 * the demo script opens on. The full narrative seed stays in prisma/seed.ts.
 */
export async function bootstrapDemo(): Promise<{ tenant: string; user: string }> {
  await seedRichDemo();
  return { tenant: "tenant_toranj", user: "user_maryam" };
}
