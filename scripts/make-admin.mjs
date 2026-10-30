/**
 * Promote (or create) a platform administrator.
 *
 *   node scripts/make-admin.mjs ops@radif.demo
 *
 * Platform administration is a flag on the user, not a shop membership: the account
 * gets no tenant and therefore no shop content. When the email already exists the
 * script only sets the flag; when it does not, it creates a credential account with
 * the demo password (development only — never run this against production data).
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/server/db.ts";

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/make-admin.mjs <email>");
  process.exit(1);
}

const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } });
if (existing) {
  await prisma.user.update({ where: { id: existing.id }, data: { platformAdmin: true } });
  console.log("promoted", email);
} else if (process.env.APP_MODE === "production") {
  console.error("refusing to create an account in production");
  process.exit(1);
} else {
  const password = await hashPassword("radif-demo-1405");
  const user = await prisma.user.create({
    data: { id: randomUUID(), name: "مدیر پلتفرم", email, emailVerified: true, platformAdmin: true },
  });
  await prisma.account.create({
    data: { id: randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password },
  });
  console.log("created", email, "with password radif-demo-1405");
}
await prisma.$disconnect();
