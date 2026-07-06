#!/usr/bin/env node
/* eslint-env node */
/**
 * Apply Drizzle SQL migrations to a fresh Postgres (compose dev stack).
 * Usage: DATABASE_URL=postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster node scripts/e2e/bootstrap-compose-db.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster";

const steps = [
  "drizzle/0000_baseline.sql",
  "drizzle/0001_auth_uid_shim.sql",
  "drizzle/0002_workspace_events.sql",
  "drizzle/0003_job.sql",
  "drizzle/0004_better_auth.sql",
  "drizzle/0005_two_factor.sql",
  "drizzle/0006_app_schema_tail.sql",
  "scripts/e2e/bootstrap-compose-cleanup.sql",
  "client/migrations/20260704000004_apply_ledger_entry_and_sync_credits.sql",
];

console.log(`[e2e-bootstrap] target=${databaseUrl.replace(/:[^:@]+@/, ":***@")}`);

for (const step of steps) {
  const file = path.join(rootDir, step);
  console.log(`[e2e-bootstrap] applying ${step}`);
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", file], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`[e2e-bootstrap] failed on ${step}`);
    process.exit(result.status ?? 1);
  }
}

console.log("[e2e-bootstrap] complete");
