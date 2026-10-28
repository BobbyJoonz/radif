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
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 chars"),
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

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid server environment:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;

/** Demo mode is the only mode that seeds or replays data. Production refuses. */
export const isDemo = env.APP_MODE === "demo";
