import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { isDemo } from "@/lib/env";
import { handler, ok } from "@/server/http";

/**
 * GET /api/guest?role=owner|operator|customer — a demo session per persona.
 *
 * Owner and operator get a real account for that role (two different people in
 * the same shop), so the permission difference is the product's own, not a mock.
 * The customer persona has no account by design (phase 4 is not built), so it
 * returns the read-only demo view instead of credentials.
 *
 * Two failure modes are made legible instead of a generic 500:
 *   • the database is asleep          → retried once
 *   • the schema is behind the code  → 503 "schema_outdated" + the repair URL
 */
export const dynamic = "force-dynamic";

const DEMO_PASSWORD = "radif-demo-1405";

function isMissingColumn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /column .* does not exist|ColumnNotFound|P2022/i.test(message);
}

async function withDbRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (first) {
    if (isMissingColumn(first)) throw first;
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      return await run();
    } catch {
      throw first;
    }
  }
}

export const GET = handler(async (request: Request) => {
  if (!isDemo()) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Guest demo is available in demo mode only." } },
      { status: 403 },
    );
  }

  const roleParam = new URL(request.url).searchParams.get("role");
  const role = roleParam === "owner" || roleParam === "operator" ? roleParam : null;

  try {
    if (roleParam === "customer") {
      const customer = await withDbRetry(() =>
        prisma.customer.findFirst({
          where: { tenantId: "tenant_toranj", id: "cust_negar" },
          select: { id: true, displayName: true },
        }),
      );
      if (!customer) {
        return NextResponse.json(
          { ok: false, error: { code: "no_demo_data", message: "Run /api/setup?enrich=1 first." } },
          { status: 409 },
        );
      }
      return ok({ kind: "customer", customer: customer.displayName, href: "/fa/demo/customer" });
    }

    const members = await withDbRetry(() =>
      prisma.membership.findMany({
        where: { tenant: { isDemo: true }, ...(role ? { role } : {}) },
        include: { user: true, tenant: true },
        take: 20,
      }),
    );

    if (members.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "no_demo_account", message: "Run /api/setup?enrich=1 to create the demo shops." } },
        { status: 409 },
      );
    }

    const pick = members[Math.floor(Math.random() * members.length)];
    return ok({
      kind: "account",
      email: pick.user.email,
      password: DEMO_PASSWORD,
      role: pick.role,
      shop: pick.tenant.slug,
      locale: pick.user.locale,
    });
  } catch (error) {
    if (isMissingColumn(error)) {
      // A deploy whose migrations have not been applied yet: the code knows a
      // column the database does not have. Say so, and point at the one URL that
      // fixes it, instead of "unexpected error".
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "schema_outdated",
            message: "دیتابیس یک مایگریشن عقب است؛ برای ترمیم، «ترمیم دیتابیس» را بزنید.",
            repairHref: "/api/setup?enrich=1",
          },
        },
        { status: 503 },
      );
    }
    console.error("[guest] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: { code: "database_unavailable", message: "دیتابیس در دسترس نیست؛ کمی بعد دوباره تلاش کنید." },
      },
      { status: 503 },
    );
  }
});
