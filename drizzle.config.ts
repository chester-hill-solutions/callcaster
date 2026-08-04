// ─────────────────────────────────────────────────────────────────────────
// DANGER: app/db/schema.ts is hand-synced introspection output, not the
// source of truth. It has zero `.references()` and there is no
// drizzle/meta journal checked in, so `drizzle-kit generate` run against
// this config can produce DESTRUCTIVE DDL (dropped/recreated
// constraints, tables, etc.) instead of a safe incremental migration.
//
// Do NOT run `drizzle-kit generate` (or `push`) against this config to
// produce migrations for real use. New DDL belongs in hand-written SQL
// under client/migrations/*.sql — see docs/migration-delivery-board.md
// item 1.14 for why schema.ts is hand-synced instead of introspected.
// ─────────────────────────────────────────────────────────────────────────
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./app/db/schema.ts", "./app/db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? process.env.BASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
