import { NextResponse } from "next/server";
import { applyMigrations, bootstrapDemo, schemaExists } from "@/server/bootstrap";
import { prisma } from "@/server/db";
import { isDemo } from "@/lib/env";

/**
 * POST|GET /api/setup — bring an empty deployment up in one request.
 *
 * This is provisioning, not a feature: it exists so the person who deployed the
 * app can create the schema and the demo shop from a browser, without a shell or
 * a database client. It is deliberately narrow:
 *
 *   • demo mode only — a production shop must run `prisma migrate deploy`;
 *   • it refuses to touch a database that already has the schema (409), so it can
 *     never overwrite real rows;
 *   • it records the migration exactly as Prisma would, so `migrate deploy` later
 *     agrees with the state.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run() {
  if (!isDemo()) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Setup is demo-mode only. Run `prisma migrate deploy` in production." } },
      { status: 403 },
    );
  }

  const hasSchema = await schemaExists();
  if (hasSchema) {
    // A deploy can land with the tables already created (a build step ran
    // `prisma migrate deploy`) but the demo shop never seeded. That is a
    // half-provisioned deployment, not a ready one.
    const tenants = await prisma.tenant.count();
    if (tenants > 0) {
      return NextResponse.json({
        ok: true,
        data: { state: "ready", tenants, note: "already provisioned; nothing to do" },
      });
    }
    const demo = await bootstrapDemo();
    return NextResponse.json({
      ok: true,
      data: {
        state: "seeded",
        tenants: await prisma.tenant.count(),
        demo,
        signIn: { email: "maryam@toranj.demo", password: "radif-demo-1405" },
      },
    });
  }
  const { applied } = await applyMigrations();
  const hasTenant = (await prisma.tenant.count()) > 0;
  const created = hasTenant ? null : await bootstrapDemo();

  return NextResponse.json({
    ok: true,
    data: {
      schema: "created",
      appliedMigrations: applied,
      demo: created,
      signIn: created ? { email: "maryam@toranj.demo", password: "radif-demo-1405" } : null,
      next: "Open /fa/login and sign in, then open /fa.",
    },
  });
}

export async function GET() {
  try {
    return await run();
  } catch (error) {
    console.error("[setup] failed", error);
    return NextResponse.json(
      { ok: false, error: { code: "setup_failed", message: error instanceof Error ? error.message : "unknown" } },
      { status: 500 },
    );
  }
}

export const POST = GET;
