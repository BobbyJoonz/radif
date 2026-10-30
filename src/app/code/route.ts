import { NextResponse } from "next/server";

/**
 * The public entry point to the source.
 *
 * Brief §19 asks for a reviewable codebase; the site says so out loud instead of
 * hiding it in a README. One stable URL on our own domain, configured by env so a
 * fork points at its own repository.
 */
const REPO = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/BobbyJoonz/radif";

export function GET() {
  return NextResponse.redirect(REPO, { status: 302 });
}
