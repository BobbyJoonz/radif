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
    // `prisma generate` only reads the schema; a placeholder keeps CI/Vercel
    // builds working when DATABASE_URL is a runtime-only secret.
    url: process.env["DATABASE_URL"] ?? "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder",
  },
});
