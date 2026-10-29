import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { prisma } from "@/server/db";

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
  const { hashPassword } = await import("better-auth/crypto");
  const password = await hashPassword("radif-demo-1405");
  const now = Date.now();
  const minutesAgo = (m: number) => new Date(now - m * 60_000);

  const tenant = await prisma.tenant.create({
    data: {
      id: "tenant_toranj",
      slug: "toranj",
      nameFa: "آتلیهٔ ترنج",
      nameEn: "Atelier Toranj",
      timezone: "Asia/Tehran",
      currency: "IRR",
      isDemo: true,
      settings: { create: { demoMode: true } },
    },
  });

  await prisma.user.create({
    data: { id: "user_maryam", name: "مریم رستمی", email: "maryam@toranj.demo", emailVerified: true },
  });
  await prisma.account.create({
    data: { id: "acct_user_maryam", accountId: "user_maryam", providerId: "credential", userId: "user_maryam", password },
  });
  await prisma.membership.create({ data: { id: "mem_maryam", tenantId: tenant.id, userId: "user_maryam", role: "owner" } });

  await prisma.channelConnection.create({
    data: {
      id: "conn_toranj_replay",
      tenantId: tenant.id,
      channel: "replay",
      accountRef: "toranj.studio",
      displayName: "آتلیهٔ ترنج",
      status: "ready",
      lastSyncAt: minutesAgo(2),
    },
  });

  const people = [
    { id: "cust_negar", name: "نگار احمدی", handle: "negar.ahmadi", conv: "conv_negar", text: "واریز کردم، کد رهگیری رو می‌فرستید؟ آدرسم هم عوض شده، هنوز نفرستادید؟" },
    { id: "cust_shirin", name: "شیرین کیانی", handle: "shirin.kiani", conv: "conv_shirin", text: "سلام، روسری گل‌دار رو می‌خوام. ۱۲۰۰ حساب کردم، درسته؟" },
    { id: "cust_hossein", name: "حسین مرادی", handle: "hossein.moradi", conv: "conv_hossein", text: "شال ترنج موجوده؟ قیمتش چنده؟" },
  ];

  for (const [index, person] of people.entries()) {
    await prisma.customer.create({ data: { id: person.id, tenantId: tenant.id, displayName: person.name } });
    await prisma.customerIdentity.create({
      data: {
        id: `id_${person.id}`,
        tenantId: tenant.id,
        customerId: person.id,
        connectionId: "conn_toranj_replay",
        kind: "instagram_username",
        externalRef: person.handle,
      },
    });
    await prisma.conversation.create({
      data: {
        id: person.conv,
        tenantId: tenant.id,
        connectionId: "conn_toranj_replay",
        customerId: person.id,
        channelRef: `DEMO-CONV-${114 + index}`,
        lastMessageAt: minutesAgo(26 + index * 20),
        unrepliedCount: 1,
      },
    });
    await prisma.message.create({
      data: {
        id: `DEMO-MSG-${9001 + index}`,
        tenantId: tenant.id,
        conversationId: person.conv,
        direction: "inbound",
        source: "replay",
        externalRef: `DEMO-MSG-${9001 + index}`,
        senderRef: person.handle,
        text: person.text,
        occurredAt: minutesAgo(26 + index * 20),
        analysisState: "done",
      },
    });
  }

  await prisma.task.createMany({
    data: [
      {
        id: "task_bootstrap_pay",
        tenantId: tenant.id,
        type: "payment_reconcile",
        status: "open",
        priority: "P1",
        title: "تطبیق پرداخت — نگار احمدی",
        reasonCode: "payment_mismatch",
        reasonText: "اعلام پرداخت بررسی‌نشده پیش از ارسال",
        dueAt: minutesAgo(60 * 26),
        customerId: "cust_negar",
        messageId: "DEMO-MSG-9001",
        dedupeKey: "payment:conv_negar",
      },
      {
        id: "task_bootstrap_amount",
        tenantId: tenant.id,
        type: "draft_review",
        status: "open",
        priority: "P1",
        title: "بررسی مبلغ — شیرین کیانی",
        reasonCode: "amount_without_unit",
        reasonText: "مبلغ بدون واحد روشن",
        dueAt: minutesAgo(60 * 4),
        customerId: "cust_shirin",
        messageId: "DEMO-MSG-9002",
        dedupeKey: "draft:conv_shirin",
      },
      {
        id: "task_bootstrap_reply",
        tenantId: tenant.id,
        type: "customer_reply",
        status: "open",
        priority: "P2",
        title: "پاسخ موجودی شال",
        reasonCode: "product_question",
        reasonText: "پرسش قیمت و موجودی",
        dueAt: minutesAgo(-60 * 18),
        customerId: "cust_hossein",
        messageId: "DEMO-MSG-9003",
        dedupeKey: "reply:conv_hossein",
      },
    ],
  });

  return { tenant: tenant.id, user: "user_maryam" };
}
