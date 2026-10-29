import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Server-side configuration. One schema, parsed once, so a misconfigured
 * deployment fails at boot with a readable message instead of half-working.
 *
 * Nothing here is ever imported by a client component: no secret reaches the
 * browser bundle, and `DECISION_PROVIDER` / `INGESTION_MODE` are read on the
 * server only.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Optional in the schema: authSecret() decides, and in demo mode it derives one.
  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
  CHANNEL_TOKEN_ENC_KEY: z.string().optional(),

  APP_MODE: z.enum(["demo", "production"]).default("demo"),
  INGESTION_MODE: z.enum(["replay", "file", "live"]).default("replay"),
  DECISION_PROVIDER: z.enum(["mock", "typesafe"]).default("mock"),
  DRAFT_PROVIDER: z.enum(["none", "template"]).default("none"),
  OUTBOUND_MODE: z.enum(["preview", "live"]).default("preview"),
  LIVE_AUTOMATION_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  TYPESAFE_MODEL: z.string().default("jev-1.14.0"),
  TYPESAFE_API_KEY: z.string().optional(),

  WORKER_POLL_MS: z.coerce.number().int().min(100).default(1000),
  RATE_LIMIT_LOGIN_PER_MIN: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_IMPORT_PER_MIN: z.coerce.number().int().min(1).default(5),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Parsed on first use, not on import. A build machine has no runtime secrets,
 * and a module that throws at import time would take the whole build down with
 * it; the failure belongs at the first request that actually needs a secret.
 */
/**
 * Vercel/CI builds run without runtime secrets, and Next evaluates route modules
 * while collecting page data. A build must not fail because a database URL is a
 * runtime-only secret — but a *server* must never start with a placeholder, so
 * this substitution is scoped to the build phase only.
 */
const BUILD_PLACEHOLDER: Partial<Record<keyof z.infer<typeof EnvSchema>, string>> = {
  DATABASE_URL: "postgresql://build:build@127.0.0.1:5432/build",
  BETTER_AUTH_SECRET: "build-phase-placeholder-not-used-at-runtime",
  BETTER_AUTH_URL: "http://localhost:3000",
  CHANNEL_TOKEN_ENC_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

export function getEnv(): Env {
  if (cached) return cached;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const source = isBuildPhase ? { ...BUILD_PLACEHOLDER, ...process.env } : process.env;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}

/** `env.DATABASE_URL` still reads naturally; the parse happens on first access. */
export const env: Env = new Proxy({} as Env, {
  get(_target, key: string) {
    return getEnv()[key as keyof Env];
  },
});

/** Demo mode is the only mode that seeds or replays data. Production refuses. */
export function isDemo(): boolean {
  return (process.env.APP_MODE ?? "demo") === "demo";
}

/**
 * The secret Better Auth signs cookies with.
 *
 * Order of preference:
 *   1. `BETTER_AUTH_SECRET` (what production must use);
 *   2. in **demo mode only**, a deterministic secret derived from DATABASE_URL —
 *      stable across serverless instances, so sign-in works on a deploy that has
 *      a database but no secret yet. It is not a random key, so it is *not* a
 *      production choice: `APP_MODE=production` refuses it outright.
 */
export function authSecret(): string {
  const explicit = process.env.BETTER_AUTH_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  const databaseUrl = process.env.DATABASE_URL;
  if (isDemo() && databaseUrl) {
    return createHash("sha256").update(`radif-demo-secret|${databaseUrl}`).digest("hex");
  }
  throw new Error("BETTER_AUTH_SECRET is required (set it in the deployment environment).");
}

/** Where the signing secret came from — reported by /api/health, never the value. */
export function authSecretSource(): "explicit" | "derived-demo" | "missing" {
  const explicit = process.env.BETTER_AUTH_SECRET;
  if (explicit && explicit.length >= 16) return "explicit";
  if (isDemo() && process.env.DATABASE_URL) return "derived-demo";
  return "missing";
}

/**
 * The variables a *serving* process cannot work without, by name only. Pages call
 * this before touching auth or the database so a half-configured deployment shows
 * a setup screen with the exact missing names instead of a 500.
 */
export function missingRequiredEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  // In demo mode the signing secret is derived, so only production needs it set.
  if (authSecretSource() === "missing") missing.push("BETTER_AUTH_SECRET");
  return missing;
}
