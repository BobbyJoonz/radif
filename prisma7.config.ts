// Prisma CLI configuration (Prisma ORM 7).
// The datasource URL lives here, not in schema.prisma, and .env is loaded
// explicitly — that is the Prisma 7 contract.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
