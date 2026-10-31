import { NextResponse } from "next/server";
import { drainQueue, queueStats } from "@/server/worker/drain";

/**
 * The queue's heartbeat, callable from a scheduler.
 *
 * GET  — stats only (safe to poll, no work done).
 * POST / GET?drain=1 — process what is waiting, bounded by a time budget.
 *
 * Auth: WORKER_DRAIN_SECRET, accepted as `Authorization: Bearer …` (Vercel Cron
 * sends CRON_SECRET this way) or `?key=…`. With no secret configured the route is
 * closed in production and open in demo mode only — a public "do work" endpoint on
 * a real deployment would be a denial-of-service gift.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.WORKER_DRAIN_SECRET ?? process.env.CRON_SECRET ?? null;
  const url = new URL(request.url);
  if (!secret) return process.env.APP_MODE !== "production" && (process.env.APP_MODE ?? "demo") === "demo";
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return url.searchParams.get("key") === secret;
}

export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: { code: "forbidden" } }, { status: 403 });
  const url = new URL(request.url);
  const stats = await queueStats();
  if (url.searchParams.get("drain") !== "1") return NextResponse.json({ ok: true, data: { stats, mode: "read" } });

  const result = await drainQueue();
  return NextResponse.json({ ok: true, data: { mode: "drain", result, stats: await queueStats() } });
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: { code: "forbidden" } }, { status: 403 });
  const result = await drainQueue();
  return NextResponse.json({ ok: true, data: { result, stats: await queueStats() } });
}
