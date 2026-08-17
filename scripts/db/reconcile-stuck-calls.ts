/**
 * Reconcile call/message rows stuck in a non-terminal status against Twilio
 * (#1289). One-off backlog drain for the population the periodic
 * `twilio_open_sync` job could not see before its selection-window fix — rows
 * stuck longer than `maxAgeMinutes` had graduated permanently out of the
 * sweep.
 *
 * Dry-run by default: prints every stuck row with its workspace and age.
 * `--apply` runs the SAME code path as the worker job
 * (`triggerTwilioOpenSync`), so status writes go through the guarded
 * canonical processor and billing stays idempotent — this script contains no
 * SQL writes of its own.
 *
 * Usage (bun resolves the `@/` tsconfig paths):
 *   DATABASE_URL=postgresql://… bun run scripts/db/reconcile-stuck-calls.ts
 *   DATABASE_URL=postgresql://… bun run scripts/db/reconcile-stuck-calls.ts --apply
 *
 * Options:
 *   --apply                 actually reconcile (default: report only)
 *   --min-age-minutes <n>   only report/sweep rows older than this (default 120)
 *   --limit <n>             per-workspace per-round sweep size (default 100)
 *   --max-rounds <n>        safety bound on apply rounds (default 10)
 */
// The app's env module soft-validates the full server key set at import
// time; this script only needs DATABASE_URL (workspace Twilio credentials
// come from the workspace rows). Fill the rest with inert placeholders BEFORE
// importing any app module so the run isn't buried in missing-env noise.
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
for (const key of [
  "BETTER_AUTH_SECRET",
  "TWILIO_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_APP_SID",
  "TWILIO_PHONE_NUMBER",
  "BASE_URL",
  "STRIPE_SECRET_KEY",
  "RESEND_API_KEY",
  // Object-storage group: required-env-keys wants either the S3_* set or
  // Railway bucket credentials; satisfy the S3_* arm.
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
]) {
  process.env[key] ??= "reconcile-script-placeholder";
}

const { sql } = await import("drizzle-orm");
const { adminDb } = await import("@/server/admin-db");
const { triggerTwilioOpenSync } = await import("@/lib/twilio-open-sync.server");

const OPEN_CALL_STATUSES = ["queued", "ringing", "in-progress", "initiated"];

function argValue(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  const parsed = Number(process.argv[index + 1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`Invalid value for ${flag}: ${process.argv[index + 1]}`);
    process.exit(1);
  }
  return parsed;
}

const apply = process.argv.includes("--apply");
const minAgeMinutes = argValue("--min-age-minutes", 120);
const limit = argValue("--limit", 100);
const maxRounds = argValue("--max-rounds", 10);

type StuckRow = {
  sid: string;
  workspace: string;
  campaign_id: number | null;
  contact_id: number | null;
  status: string;
  date_created: string;
  age_hours: number;
};

async function listStuckCalls(): Promise<StuckRow[]> {
  const rows = await adminDb.execute(sql`
    select
      c.sid,
      c.workspace,
      c.campaign_id,
      c.contact_id,
      c.status::text as status,
      c.date_created,
      round(extract(epoch from (now() - c.date_created::timestamptz)) / 3600) as age_hours
    from call c
    where c.status::text in (${sql.join(
      OPEN_CALL_STATUSES.map((status) => sql`${status}`),
      sql`, `,
    )})
      and c.date_created::timestamptz < now() - make_interval(mins => ${minAgeMinutes})
    order by c.date_created asc
  `);
  return rows as unknown as StuckRow[];
}

const initial = await listStuckCalls();

if (initial.length === 0) {
  console.log(`No call rows stuck longer than ${minAgeMinutes} minutes. Nothing to do.`);
  process.exit(0);
}

console.log(
  `${initial.length} call row(s) stuck in a non-terminal status for >${minAgeMinutes} minutes:\n`,
);
for (const row of initial) {
  console.log(
    `  ${row.sid}  ws=${row.workspace}  campaign=${row.campaign_id ?? "-"}  contact=${row.contact_id ?? "-"}  status=${row.status}  age=${row.age_hours}h`,
  );
}

if (!apply) {
  console.log("\nDry run (no --apply): nothing was changed.");
  process.exit(0);
}

const workspaces = [...new Set(initial.map((row) => row.workspace))];
console.log(`\nReconciling across ${workspaces.length} workspace(s)…`);

for (let round = 1; round <= maxRounds; round++) {
  const before = (await listStuckCalls()).length;
  if (before === 0) break;
  console.log(`\nRound ${round}: ${before} stuck row(s) remaining.`);

  for (const workspaceId of workspaces) {
    const result = await triggerTwilioOpenSync({
      workspaceId,
      callLimit: limit,
      messageLimit: limit,
      // Prefetch/404-grace window only — selection sweeps all open rows.
      maxAgeMinutes: minAgeMinutes,
    });
    if (result.ok) {
      console.log(`  ${workspaceId}: ${result.message}`);
    } else {
      // Credential problems (or Twilio outage) for one workspace shouldn't
      // stop the rest; its rows will simply still be listed at the end.
      console.error(`  ${workspaceId}: FAILED — ${result.error}`);
    }
  }

  const after = (await listStuckCalls()).length;
  if (after >= before) {
    console.log(
      `\nNo further progress (${after} row(s) remain — likely workspaces with unusable Twilio credentials, or rows younger than the 404 grace). Stopping.`,
    );
    break;
  }
}

const remaining = await listStuckCalls();
console.log(
  remaining.length === 0
    ? "\nAll stuck call rows reconciled."
    : `\n${remaining.length} row(s) still stuck:\n${remaining
        .map((row) => `  ${row.sid}  ws=${row.workspace}  status=${row.status}`)
        .join("\n")}`,
);
process.exit(remaining.length === 0 ? 0 : 2);
