import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A leading underscore is this project's signal for a deliberately unused
      // binding (a seam parameter in a provider adapter, for instance).
      // global-error.tsx and setup-screen.tsx link to /api/* and to a full page
      // load on purpose: they are what renders when the router itself failed.
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
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
