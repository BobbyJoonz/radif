import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (PPR-style) is off: every screen in this app reads a
  // session and a tenant-scoped database, so the honest model is dynamic
  // rendering, not a cached shell. Turning it off also keeps Suspense
  // boundaries out of the critical path of the queue screen.
  cacheComponents: false,
  // unmatched URLs must land on the branded dark 404, not Next's white one
  experimental: { globalNotFound: true },
  partialPrefetching: false,
  // Prisma and its driver must stay out of the bundler's module graph.
  // /api/setup applies the migration SQL at runtime; Vercel must ship the file.
  outputFileTracingIncludes: {
    "/api/setup": ["./prisma/migrations/**"],
  },
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  images: {
    // The product's largest raster is a 1200px brand lockup; generating 2048 and
    // 3840 variants for a 26px logo is pure waste.
    deviceSizes: [640, 750, 828, 1080, 1200, 1600, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ["image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // Tailwind is wired through PostCSS (postcss.config.mjs), not a Turbopack
  // CSS rule: the rule also matched *.module.css and silently dropped every
  // CSS module in the app.
};

export default nextConfig;
