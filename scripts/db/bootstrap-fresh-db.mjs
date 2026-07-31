#!/usr/bin/env node
/* eslint-env node */
/**
 * Bootstrap a FRESH production/staging Postgres to the full v2 schema, then
 * seed both migration ledgers so `db:ledger:check --require-db` gates cleanly.
 *
 * This is the production twin of scripts/e2e/bootstrap-compose-db.mjs:
 * - same ordered apply list (drizzle baseline + client/migrations interleave),
 *   except the E2E-only reset/cleanup files are replaced by the real
 *   `20260704000005_drop_legacy_triggers.sql` migration (the baseline dump
 *   still contains the legacy Supabase trigger functions that
 *   db-health.server.ts hard-fails on).
 * - refuses non-empty databases: this tool NEVER migrates existing data. If
 *   the target has an AUTH_migrations schema or a public.workspace table it
 *   aborts (override only with --force, for a re-run after a partial apply).
 * - after applying, records every client/migrations version in
 *   AUTH_migrations.schema_migrations (the deploy-gate ledger) and every
 *   applied filename in public.client_migration_bootstrap (the
 *   RUN_CLIENT_MIGRATIONS_ON_BOOT tracker) so all future tooling agrees the
 *   database is current.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/db/bootstrap-fresh-db.mjs
 *   DATABASE_URL=postgresql://... node scripts/db/bootstrap-fresh-db.mjs --force
 *
 * Then verify:
 *   DATABASE_URL=postgresql://... npm run db:ledger:check -- --require-db
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "[bootstrap-fresh-db] DATABASE_URL is required (no default — this targets real environments).",
  );
  process.exit(1);
}
const force = process.argv.includes("--force");

/**
 * Ordered apply list. Keep in lockstep with scripts/e2e/bootstrap-compose-db.mjs
 * (same interleave, minus its compose-only reset/cleanup steps; legacy trigger
 * removal here uses the real client migration instead).
 */
const steps = [
  "drizzle/0000_baseline.sql",
  "drizzle/0001_auth_uid_shim.sql",
  "drizzle/0002_workspace_events.sql",
  "drizzle/0003_job.sql",
  "drizzle/0004_better_auth.sql",
  "drizzle/0005_two_factor.sql",
  "drizzle/0006_app_schema_tail.sql",
  "client/migrations/20260704000005_drop_legacy_triggers.sql",
  "client/migrations/20260704000004_apply_ledger_entry_and_sync_credits.sql",
  "client/migrations/20260708000000_transaction_history_workspace_created_idx.sql",
  "client/migrations/20260708010000_message_workspace_campaign_date_idx.sql",
  "client/migrations/20260709000000_add_message_scheduled_at.sql",
  "client/migrations/20260709100000_contact_line_type.sql",
  "client/migrations/20260710000000_workspace_number_twilio_sid.sql",
  "client/migrations/20260710010000_campaign_send_window.sql",
  "client/migrations/20260710020000_fix_apply_ledger_entry_enum_cast.sql",
  "client/migrations/20260711000000_money_columns_integer_and_ledger_hardening.sql",
  "client/migrations/20260711130000_call_and_workspace_users_perf_indexes.sql",
  "client/migrations/20260713120000_workspace_audit_event.sql",
  "client/migrations/20260714120000_rate_limit_bucket.sql",
  "client/migrations/20260714130000_retire_pg_cron_http_job_routes.sql",
  "drizzle/0007_workspace_api_key_scopes.sql",
  "drizzle/0008_chs_workspace_membership.sql",
  "client/migrations/20260714140000_fix_create_new_workspace_role_cast.sql",
  "client/migrations/20260715120000_workspace_audio_metadata.sql",
  "client/migrations/20260715140000_drop_legacy_rls.sql",
  "client/migrations/20260715150000_slice_12_1_transcription_coaching_schema.sql",
  "client/migrations/20260716120000_fix_handle_campaign_queue_entry_queue_state.sql",
  "client/migrations/20260716130000_fix_remaining_queue_dial_rpcs.sql",
  "client/migrations/20260716140000_fix_dequeue_contact_bigint.sql",
  "client/migrations/20260722100000_households_backfill.sql",
  "client/migrations/20260722110000_contact_other_data_jsonb.sql",
  "client/migrations/20260722120000_fix_stale_status_queue_rpcs.sql",
  "client/migrations/20260730120000_idempotency_record.sql",
  "client/migrations/20260731120000_create_claim_next_queue_contact.sql",
  "client/migrations/20260731130000_create_acd_inbound_queue_functions.sql",
];

/**
 * client/migrations files whose effect the drizzle baseline already contains
 * (the baseline was dumped after they ran on the review DB). They are NOT
 * applied, but their versions ARE seeded into the ledger below — the ledger
 * gate keys on every file in the directory.
 */
const coveredByBaseline = new Set([
  "20260704000000_update_pg_cron_to_remix_routes.sql",
  "20260704000002_unique_workspace_api_key_prefix.sql",
  "20260704000003_extend_job_table.sql",
  "20260705000100_add_call_user_id.sql",
  "20260705000200_acd_duplicate_offer_guard.sql",
  "20260705000200_add_campaign_queue_workspace.sql",
  "20260705000200_survey_response_unique_result_id.sql",
  "20260706120000_auth_two_factor.sql",
  "20260713150000_workspace_api_key_scopes.sql",
  "20260713180000_chs_workspace_membership.sql",
  "20260722130000_contact_support_level_and_voter_list.sql",
]);

const allMigrationFiles = readdirSync(path.join(rootDir, "client/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort();

// Same drift guard as the compose bootstrap: a migration wired into neither
// list is a mistake that would silently diverge this tool from the schema.
const listed = new Set(
  steps
    .filter((step) => step.startsWith("client/migrations/"))
    .map((step) => path.basename(step)),
);
const unwired = allMigrationFiles.filter(
  (file) => !listed.has(file) && !coveredByBaseline.has(file),
);
if (unwired.length > 0) {
  console.error(
    "[bootstrap-fresh-db] migrations exist in client/migrations/ but are wired into neither\n" +
      "`steps` nor `coveredByBaseline` in this file:\n" +
      unwired.map((file) => `  ${file}`).join("\n") +
      "\n\nAppend each to `steps` (in filename order), or to `coveredByBaseline` if\n" +
      "the drizzle/ baseline already contains its effect. Update the compose\n" +
      "bootstrap (scripts/e2e/bootstrap-compose-db.mjs) in the same commit.",
  );
  process.exit(1);
}

function versionFromFilename(name) {
  const match = name.match(/^(\d+)_/);
  if (!match) throw new Error(`Unexpected migration filename: ${name}`);
  return match[1];
}

const redactedUrl = databaseUrl.replace(/:[^:@]+@/, ":***@");

async function assertFreshDatabase(sql) {
  const [{ exists: hasLedger }] = await sql`
    select exists (
      select 1 from information_schema.schemata
      where schema_name in ('AUTH_migrations', 'auth_migrations')
    ) as exists
  `;
  const [{ exists: hasWorkspace }] = await sql`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'workspace'
    ) as exists
  `;
  if (hasLedger || hasWorkspace) {
    if (force) {
      console.warn(
        "[bootstrap-fresh-db] target is NOT empty but --force was passed — continuing.",
      );
      return;
    }
    console.error(
      `[bootstrap-fresh-db] REFUSING: target ${redactedUrl} is not an empty database ` +
        `(ledger schema present: ${hasLedger}; public.workspace present: ${hasWorkspace}).\n` +
        "This tool only bootstraps FRESH databases. It never migrates existing data.\n" +
        "If you are re-running after a partial apply on a scratch database, pass --force.",
    );
    process.exit(1);
  }
}

async function seedLedgers(sql) {
  // Deploy-gate ledger: one row per client/migrations version.
  for (const file of allMigrationFiles) {
    const version = versionFromFilename(file);
    await sql`
      insert into AUTH_migrations.schema_migrations (version)
      values (${version})
      on conflict (version) do nothing
    `;
  }
  // Boot-tracker ledger: one row per filename, so a future
  // RUN_CLIENT_MIGRATIONS_ON_BOOT=1 boot treats everything as applied.
  await sql.unsafe(`
    create table if not exists public.client_migration_bootstrap (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  for (const file of allMigrationFiles) {
    await sql`
      insert into public.client_migration_bootstrap (filename)
      values (${file})
      on conflict (filename) do nothing
    `;
  }
  console.log(
    `[bootstrap-fresh-db] ledgers seeded: ${allMigrationFiles.length} versions in ` +
      "AUTH_migrations.schema_migrations and public.client_migration_bootstrap",
  );
}

async function main() {
  console.log(`[bootstrap-fresh-db] target=${redactedUrl}`);

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    await assertFreshDatabase(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }

  for (const step of steps) {
    const file = path.join(rootDir, step);
    console.log(`[bootstrap-fresh-db] applying ${step}`);
    const result = spawnSync(
      "psql",
      [databaseUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", file],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      console.error(`[bootstrap-fresh-db] failed on ${step}`);
      process.exit(result.status ?? 1);
    }
  }

  const ledgerSql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    await seedLedgers(ledgerSql);
  } finally {
    await ledgerSql.end({ timeout: 5 });
  }

  // Verify inline rather than printing a command to copy — a bootstrap that
  // is never ledger-checked is exactly how a deployed database drifts.
  console.log("[bootstrap-fresh-db] verifying ledger…");
  const check = spawnSync(
    "node",
    [path.join(rootDir, "scripts/db/check-migration-ledger.mjs"), "--require-db"],
    { stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } },
  );
  if (check.status !== 0) {
    console.error(
      "[bootstrap-fresh-db] LEDGER CHECK FAILED — the database is bootstrapped but " +
        "does not match the repo. Do not deploy against it.",
    );
    process.exit(check.status ?? 1);
  }

  console.log("[bootstrap-fresh-db] complete — schema applied and ledger verified.");
}

main();
