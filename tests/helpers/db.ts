import { prisma } from "@/server/db";

/**
 * Reset between cases. `TRUNCATE … CASCADE` is used instead of `DELETE` because it
 * is one statement, ignores foreign-key order, and cannot leave half a fixture
 * behind when a test aborts.
 *
 * `_prisma_migrations` is preserved: the schema (and its CHECK constraints) is what
 * the tests are asserting against.
 */
let cachedTables: string[] | null = null;

async function publicTables(): Promise<string[]> {
  if (cachedTables) return cachedTables;
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  cachedTables = rows.map((row) => row.tablename);
  return cachedTables;
}

export async function resetDatabase(): Promise<void> {
  const tables = await publicTables();
  if (tables.length === 0) {
    throw new Error("The test database has no tables; run `prisma migrate deploy` against DATABASE_URL_TEST.");
  }
  const list = tables.map((table) => `"${table.replace(/"/g, '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Close the pool so vitest can exit without an open handle. */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
