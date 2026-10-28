import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (PPR-style) is off: every screen in this app reads a
  // session and a tenant-scoped database, so the honest model is dynamic
  // rendering, not a cached shell. Turning it off also keeps Suspense
  // boundaries out of the critical path of the queue screen.
  cacheComponents: false,
  partialPrefetching: false,
  // Prisma and its driver must stay out of the bundler's module graph.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // Tailwind is wired through PostCSS (postcss.config.mjs), not a Turbopack
  // CSS rule: the rule also matched *.module.css and silently dropped every
  // CSS module in the app.
};

export default nextConfig;
