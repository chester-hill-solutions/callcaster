import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { logger } from "@/lib/logger.server";

/**
 * Opt-in, forward-only replay of `client/migrations/*.sql` at boot.
 *
 * Why this exists: the Docker entrypoint only starts the app — it never applies
 * the raw SQL migrations. Persistent environments (dev/staging/production) had
 * their ledger applied once by hand, but every ephemeral PR-preview environment
 * gets a fresh database that has none of them, so the app crashes on the
 * `assertRequiredDbFunctions` guard ("Required database function is missing:
 * apply_ledger_entry_and_sync_credits"). This heals a fresh database before the
 * guard runs.
 *
 * Safety — three independent interlocks so this can never touch the wrong DB:
 *   1. Off by default. Only runs when RUN_CLIENT_MIGRATIONS_ON_BOOT is "1"/"true".
 *      Every Railway environment (dev, staging, production) sets it via
 *      .railway/environments/*.ts, so a merged migration reaches each database
 *      on the next deploy of that environment (#1477). Local and test runs
 *      leave it unset.
 *   2. Legacy-database refusal. The v2 migrations DROP the Supabase-era
 *      `transaction_history_update_credits` trigger, which on the legacy
 *      customer-prod database IS the live credits mechanism. If that trigger
 *      (or any banned legacy trigger) is present, this is not a v2 database and
 *      we abort without running anything.
 *   3. Per-file isolation. Each file runs on its own; a failure is logged and
 *      skipped (with ROLLBACK so an aborted BEGIN from that file does not
 *      poison the shared connection), never left half-applied across files,
 *      and the downstream `assertRequiredDbFunctions` guard remains the hard
 *      gate on readiness.
 */

const MIGRATIONS_DIRNAME = path.join("client", "migrations");
const TRACKING_TABLE = "client_migration_bootstrap";
/**
 * Session advisory lock key held for the whole bootstrap pass. Two instances
 * booting at once (overlapping deploy, extra replica) would otherwise both
 * read the same pending set and run the same DDL concurrently; the second
 * waits here, then sees the first's tracking rows and skips them.
 */
const BOOTSTRAP_LOCK_KEY = 7264030120;

/**
 * Presence of any of these legacy triggers means the target is a Supabase-era
 * database where the forward migrations here would be destructive. Mirrors the
 * banned-trigger list asserted by db-health.server.ts.
 */
const LEGACY_SENTINEL_TRIGGERS = [
  "add_contact_to_queues_trigger",
  "campaign_is_active_change_trigger",
  "campaign_schedule_change_trigger",
  "outreach_trigger",
  "transaction_history_update_credits",
  "trigger_inherit_parent_call_data",
];

export type BootstrapResult =
  | { ran: false; reason: "disabled" | "no-database-url" }
  | { ran: false; reason: "legacy-database"; triggers: string[] }
  | { ran: true; applied: string[]; skipped: string[] };

export function bootstrapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.RUN_CLIENT_MIGRATIONS_ON_BOOT;
  return value === "1" || value === "true";
}

/** Sort client migrations by filename — the version prefix is time-ordered. */
function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * Apply any not-yet-recorded client migrations to DATABASE_URL. Keyed by
 * filename (not version) so the three grandfathered files that share version
 * `20260705000200` are each tracked independently. Idempotent: already-applied
 * files are recorded in {@link TRACKING_TABLE} and skipped on later boots, and
 * the migration SQL itself is written to be re-runnable.
 */
export async function applyClientMigrationsOnBoot(options: {
  env?: NodeJS.ProcessEnv;
  rootDir: string;
}): Promise<BootstrapResult> {
  const env = options.env ?? process.env;

  if (!bootstrapEnabled(env)) {
    return { ran: false, reason: "disabled" };
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    logger.error(
      "RUN_CLIENT_MIGRATIONS_ON_BOOT is set but DATABASE_URL is missing — cannot bootstrap the database",
    );
    return { ran: false, reason: "no-database-url" };
  }

  const dir = path.join(options.rootDir, MIGRATIONS_DIRNAME);
  const files = listMigrationFiles(dir);
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  let locked = false;

  try {
    await sql`select pg_advisory_lock(${BOOTSTRAP_LOCK_KEY})`;
    locked = true;

    const legacyTriggers = await sql<{ tgname: string }[]>`
      select tgname
      from pg_trigger
      where tgname = any(${LEGACY_SENTINEL_TRIGGERS})
    `;
    if (legacyTriggers.length > 0) {
      const triggers = legacyTriggers.map((row) => row.tgname);
      logger.error(
        "client-migration bootstrap refused: legacy Supabase-era trigger(s) present — refusing to migrate what looks like a legacy database",
        { triggers },
      );
      return { ran: false, reason: "legacy-database", triggers };
    }

    await sql.unsafe(`
      create table if not exists public.${TRACKING_TABLE} (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedRows = await sql<{ filename: string }[]>`
      select filename from public.client_migration_bootstrap
    `;
    const alreadyApplied = new Set(appliedRows.map((row) => row.filename));

    const applied: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        skipped.push(file);
        continue;
      }
      const content = readFileSync(path.join(dir, file), "utf8");
      try {
        // Simple-protocol so multi-statement files with their own BEGIN/COMMIT
        // and dollar-quoted function bodies execute as written.
        await sql.unsafe(content).simple();
        await sql`
          insert into public.client_migration_bootstrap (filename)
          values (${file})
          on conflict (filename) do nothing
        `;
        applied.push(file);
        logger.info("client-migration bootstrap applied", { file });
      } catch (error) {
        // Migration SQL often opens its own BEGIN. A mid-file error leaves this
        // shared connection (max: 1) in "aborted transaction" until ROLLBACK —
        // without that, every later file fails with 25P02.
        try {
          await sql.unsafe("ROLLBACK").simple();
        } catch {
          // No open transaction — connection already idle.
        }
        // A file that conflicts with the drizzle baseline (already present) or
        // otherwise fails is logged and skipped, not recorded. The db-health
        // guard downstream is the hard gate on whether boot proceeds.
        skipped.push(file);
        logger.error("client-migration bootstrap skipped a file", {
          file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("client-migration bootstrap complete", {
      appliedCount: applied.length,
      skippedCount: skipped.length,
    });
    return { ran: true, applied, skipped };
  } finally {
    if (locked) {
      try {
        await sql`select pg_advisory_unlock(${BOOTSTRAP_LOCK_KEY})`;
      } catch (error) {
        logger.warn("client-migration bootstrap could not release its lock", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await sql.end({ timeout: 5 });
  }
}
