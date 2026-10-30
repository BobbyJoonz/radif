import { applyMigrations, bootstrapDemo, schemaExists } from "@/server/bootstrap";
import { prisma } from "@/server/db";
import { isDemo, missingRequiredEnv } from "@/lib/env";

/**
 * Self-healing demo provisioning.
 *
 * A managed Postgres starts empty, so a fresh deployment is unreachable until a
 * human finds /api/setup. A demo must not look broken: in demo mode the first
 * request that needs data makes sure the schema exists and the demo shop is
 * seeded. Memoised per process, never runs in production, and returns "skipped"
 * on failure so the normal error paths still report the real problem.
 */
type State = "ready" | "provisioned" | "skipped";

let cached: State | null = null;
let inflight: Promise<State> | null = null;

async function provision(): Promise<State> {
  if (!isDemo()) return (cached = "skipped");
  if (await schemaExists()) {
    const tenants = await prisma.tenant.count().catch(() => 0);
    if (tenants > 0) return (cached = "ready");
    await bootstrapDemo();
    return (cached = "provisioned");
  }
  await applyMigrations();
  if ((await prisma.tenant.count().catch(() => 0)) === 0) await bootstrapDemo();
  return (cached = "provisioned");
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

/** A truthful state for the gate: can this deployment render the app, and if
 *  not, is the missing piece the environment or the database? */
export async function diagnoseDemo(): Promise<{ ok: boolean; reason?: "env" | "database"; missing: string[] }> {
  const missing = missingRequiredEnv();
  if (missing.length > 0) return { ok: false, reason: "env", missing };
  try {
    await ensureDemoReady();
    return { ok: true, missing: [] };
  } catch {
    return { ok: false, reason: "database", missing: [] };
  }
}
