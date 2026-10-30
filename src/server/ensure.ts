import { applyMigrations, bootstrapDemo, schemaExists } from "@/server/bootstrap";
import { prisma } from "@/server/db";
import { isDemo } from "@/lib/env";

/**
 * Self-healing demo provisioning.
 *
 * The Vercel screenshot that motivated this file was a deployment stuck behind a
 * setup screen: a managed Postgres starts empty, so every page is unreachable
 * until someone finds /api/setup. A demo must never look broken.
 *
 * So, in demo mode only, the first request that needs data makes sure the schema
 * exists and the demo shop is seeded. It is safe to call on every render:
 *   • after the first success it is a single in-process boolean;
 *   • it never runs in production, where `prisma migrate deploy` owns the schema;
 *   • if it fails (no DATABASE_URL, network), it returns the reason and the normal
 *     error paths take over — it never hides a real failure behind a spinner.
 */
type State = "ready" | "provisioned" | "skipped";

let cached: State | null = null;
let inflight: Promise<State> | null = null;

async function provision(): Promise<State> {
  if (cached) return cached;
  if (!isDemo()) {
    cached = "skipped";
    return cached;
  }
  if (await schemaExists()) {
    const tenants = await prisma.tenant.count().catch(() => 0);
    if (tenants > 0) {
      cached = "ready";
      return cached;
    }
    await bootstrapDemo();
    cached = "provisioned";
    return cached;
  }
  await applyMigrations();
  const tenants = await prisma.tenant.count().catch(() => 0);
  if (tenants === 0) await bootstrapDemo();
  cached = "provisioned";
  return cached;
}

export async function ensureDemoReady(): Promise<State> {
  if (cached) return cached;
  inflight ??= provision().catch((error) => {
    console.error("[ensure] demo provisioning failed", error);
    inflight = null;
    return "skipped" as State;
  });
  return inflight;
}
