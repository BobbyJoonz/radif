import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/server/db";
import { authSecret, env } from "@/lib/env";

/**
 * Standard auth library, no hand-rolled session or crypto (the brief forbids
 * inventing one). Email + password only: the demo accounts in prisma/seed.ts
 * are the only credentials shipped, and they are created only in demo mode.
 *
 * Roles are NOT stored on the user. They live on Membership, scoped per tenant,
 * because the same person can be an owner in one shop and an operator in another.
 *
 * Constructed **lazily**. Next evaluates route modules while collecting page
 * data, and a deployment can be missing a runtime secret at that moment; a module
 * that throws on import turns every route into an empty 500, while a lazy one
 * lets `/api/health` name the problem and lets the setup screen render.
 */
/**
 * Where this deployment actually lives. Vercel exposes the deployment host, so a
 * fresh deploy works without anyone hand-setting BETTER_AUTH_URL; the env var
 * still wins when it is present (custom domain, local dev).
 */
function resolveBaseURL(): string {
  const explicit = process.env.BETTER_AUTH_URL;
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

function buildAuth() {
  const baseURL = resolveBaseURL();
  const origins = [
    baseURL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.BETTER_AUTH_URL ?? null,
  ].filter((value): value is string => Boolean(value));

  return betterAuth({
    appName: "Radif",
    baseURL,
    trustedOrigins: origins,
    secret: authSecret(),
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
}

export type Auth = ReturnType<typeof buildAuth>;

let instance: Auth | null = null;

export function getAuth(): Auth {
  if (instance) return instance;
  instance = buildAuth();
  return instance;
}

/** Lazy handle so `import { auth }` has no side effect. */
export const auth = new Proxy({} as Auth, {
  get(_target, property) {
    const target = getAuth() as unknown as Record<string | symbol, unknown>;
    const value = target[property];
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export type AuthSession = Auth["$Infer"]["Session"];
