#!/usr/bin/env node
/* eslint-env node */
/**
 * Apply Drizzle SQL migrations to a fresh Postgres (compose dev stack).
 * Usage: DATABASE_URL=postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster node scripts/e2e/bootstrap-compose-db.mjs
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster";

const steps = [
  "scripts/e2e/bootstrap-compose-reset.sql",
  "drizzle/0000_baseline.sql",
  "drizzle/0001_auth_uid_shim.sql",
  "drizzle/0002_workspace_events.sql",
  "drizzle/0003_job.sql",
  "drizzle/0004_better_auth.sql",
  "drizzle/0005_two_factor.sql",
  "drizzle/0006_app_schema_tail.sql",
  "scripts/e2e/bootstrap-compose-cleanup.sql",
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
  "client/migrations/20260731150000_reset_stale_inbound_offers.sql",
  "client/migrations/20260731160000_workspace_number_rental_lifecycle.sql",
  "client/migrations/20260803120000_fix_queue_rpcs_on_queue_state.sql",
  "client/migrations/20260803130000_claim_next_queue_contact_attempt_count.sql",
  "client/migrations/20260803140000_workspace_number_rental_warned_cycle.sql",
  "client/migrations/20260805120000_atomic_manual_dial_claims.sql",
  "client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql",
  "client/migrations/20260807130000_manual_dial_claim_attempt_count.sql",
];

/**
 * `client/migrations/*.sql` files that this bootstrap deliberately skips because
 * the `drizzle/*.sql` baseline above already contains their effect. Anything in
 * the directory that is in neither list is a mistake — see the guard below.
 */
const coveredByBaseline = new Set([
  // Created by drizzle/0002_workspace_events.sql on the baseline lineage;
  // the migration exists so the non-baseline lineage (dev) also gets it.
  "20260731140000_create_workspace_events.sql",
  "20260704000000_update_pg_cron_to_remix_routes.sql",
  "20260704000002_unique_workspace_api_key_prefix.sql",
  "20260704000003_extend_job_table.sql",
  "20260704000005_drop_legacy_triggers.sql",
  "20260705000100_add_call_user_id.sql",
  "20260705000200_acd_duplicate_offer_guard.sql",
  "20260705000200_add_campaign_queue_workspace.sql",
  "20260705000200_survey_response_unique_result_id.sql",
  "20260706120000_auth_two_factor.sql",
  "20260713150000_workspace_api_key_scopes.sql",
  "20260713180000_chs_workspace_membership.sql",
  "20260722130000_contact_support_level_and_voter_list.sql",
]);

/**
 * Fail loudly when a migration is added to client/migrations/ but not wired in
 * here. Otherwise the compose database silently drifts from app/db/schema.ts and
 * E2E fails far away from the cause: adding `workspace.coaching_config` without
 * appending its migration turned every bare `select()` on `workspace` into
 * `column "coaching_config" does not exist`.
 */
const listed = new Set(
  steps
    .filter((step) => step.startsWith("client/migrations/"))
    .map((step) => path.basename(step)),
);
const unwired = readdirSync(path.join(rootDir, "client/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .filter((file) => !listed.has(file) && !coveredByBaseline.has(file))
  .sort();

if (unwired.length > 0) {
  console.error(
    "[e2e-bootstrap] migrations exist in client/migrations/ but are wired into neither\n" +
      "`steps` nor `coveredByBaseline` in this file:\n" +
      unwired.map((file) => `  ${file}`).join("\n") +
      "\n\nAppend each to `steps` (in filename order), or to `coveredByBaseline` if\n" +
      "the drizzle/ baseline already contains its effect.",
  );
  process.exit(1);
}

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
