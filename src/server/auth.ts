import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";

/**
 * Standard auth library, no hand-rolled session or crypto (the brief forbids
 * inventing one). Email + password only: the demo accounts in prisma/seed.ts
 * are the only credentials shipped, and they are created only in demo mode.
 *
 * Roles are NOT stored on the user. They live on Membership, scoped per
 * tenant, because the same person can be an owner in one shop and an operator
 * in another.
 */
export const auth = betterAuth({
  appName: "Radif",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    useSecureCookies: env.APP_MODE === "production",
    cookiePrefix: "radif",
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: env.RATE_LIMIT_LOGIN_PER_MIN,
  },
});

export type AuthSession = typeof auth.$Infer.Session;
