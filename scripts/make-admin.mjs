/**
 * Promote (or create) a platform administrator.
 *
 *   node scripts/make-admin.mjs ops@radif.demo
 *
 * Platform administration is a flag on the user, not a shop membership: the account
 * gets no tenant, so it cannot read a shop's messages, addresses or phones. Uses `pg`
 * directly (the app's Prisma client is TS-only and full of path aliases, which a
 * standalone script should not inherit).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/make-admin.mjs <email>");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const found = await client.query('SELECT "id" FROM "User" WHERE "email" = $1', [email]);
  if (found.rowCount > 0) {
    await client.query('UPDATE "User" SET "platformAdmin" = true, "updatedAt" = now() WHERE "email" = $1', [email]);
    console.log("promoted", email);
  } else {
    if (process.env.APP_MODE === "production") throw new Error("refusing to create an account in production");
    const password = await hashPassword(process.env.DEMO_PASSWORD ?? "radif-demo-1405");
    const id = randomUUID();
    await client.query(
      'INSERT INTO "User" ("id","name","email","emailVerified","platformAdmin","createdAt","updatedAt","locale") VALUES ($1,$2,$3,true,true,now(),now(),\'fa\')',
      [id, "مدیر پلتفرم", email],
    );
    await client.query(
      'INSERT INTO "Account" ("id","accountId","providerId","userId","password","createdAt","updatedAt") VALUES ($1,$2,\'credential\',$2,$3,now(),now())',
      [randomUUID(), id, password],
    );
    console.log("created", email, "(password:", process.env.DEMO_PASSWORD ?? "radif-demo-1405", ")");
  }
} finally {
  await client.end();
}
