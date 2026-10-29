import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // not source: the portable PostgreSQL install, the generated Prisma client,
    // the static files and the brand sources
    ".work/**",
    "src/generated/**",
    "public/**",
    "brand/**",
  ]),
]);

export default eslintConfig;
