import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
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
// The drizzle baseline (app schema) lives outside client/migrations; on a fresh
// ephemeral DB it must run FIRST (client migrations ALTER tables the baseline
// creates). Tracked separately so a partially-bootstrapped DB converges.
const BASELINE_DIRNAME = path.join("drizzle");
const BASELINE_TRACKING_TABLE = "drizzle_baseline_bootstrap";
// E2E seed marker: one row (version) proving the fixtures ran. Seeding is a
// separate opt-in (E2E_SEED_ON_BOOT) that only fires for ephemeral previews.
const E2E_SEED_TRACKING_TABLE = "e2e_seed_bootstrap";
const E2E_SEED_SCRIPT = path.join("scripts", "e2e", "seed-database.mjs");
// Managed (non-ephemeral) Railway environments. The image sets NODE_ENV=prod
// everywhere, so RAILWAY_ENVIRONMENT_NAME is the truthful selector.
const MANAGED_ENV_NAMES = new Set(["production", "staging", "dev"]);
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
  | {
      ran: true;
      applied: string[];
      skipped: string[];
      /** Drizzle baseline files applied because the app schema was missing. */
      baselineApplied: string[];
      /** Whether the E2E fixtures were seeded (false/true) or skipped (null). */
      seedApplied: boolean | null;
      seedSkippedReason?: "not-requested" | "managed-environment" | "already-applied";
    };

export function bootstrapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.RUN_CLIENT_MIGRATIONS_ON_BOOT;
  return value === "1" || value === "true";
}

/**
 * E2E fixture seeding is a second opt-in layered on the ephemeral bootstrap
 * (E2E_SEED_ON_BOOT). It only ever fires for unmanaged Railway preview
 * environments — never local, dev, staging, or production.
 */
export function e2eSeedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.E2E_SEED_ON_BOOT;
  return value === "1" || value === "true";
}

function isManagedEnvironment(env: NodeJS.ProcessEnv): boolean {
  const name = env.RAILWAY_ENVIRONMENT_NAME?.trim();
  return !name || MANAGED_ENV_NAMES.has(name);
}

/** Sort client migrations by filename — the version prefix is time-ordered. */
function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * Spawn the E2E seed script with bun. The production image carries
 * `scripts/e2e` and the seed only depends on bundled deps (`postgres`,
 * `better-auth/crypto`), so this runs identically in a preview container.
 * Returns the child exit code; 0 means the fixtures landed.
 */
function runE2eSeed(rootDir: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      "bun",
      ["run", path.join(rootDir, E2E_SEED_SCRIPT)],
      { cwd: rootDir, stdio: "inherit" },
    );
    child.once("error", (error) => {
      logger.error("e2e seed process could not start", {
        message: error.message,
      });
      resolve(1);
    });
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
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

    // ── Drizzle baseline (app schema) ─────────────────────────────────
    // Fresh ephemeral DBs (PR previews) start with NO app schema — not even
    // auth_user — so sign-in fails before any user precedes it. When the
    // schema is absent, replay the drizzle baseline FIRST: the client
    // migrations below ALTER tables the baseline creates, so order matters.
    // Managed environments (dev/staging/prod) already have the schema and
    // skip this entirely.
    const baselineApplied: string[] = [];
    const schemaCells = await sql<{ t: string | null }[]>`
      select to_regclass('public.workspace') as t
    `;
    const schemaPresent = Boolean(schemaCells[0]?.t);
    if (!schemaPresent) {
      const baselineDir = path.join(options.rootDir, BASELINE_DIRNAME);
      const baselineFiles = readdirSync(baselineDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();

      await sql.unsafe(`
        create table if not exists public.${BASELINE_TRACKING_TABLE} (
          filename text primary key,
          applied_at timestamptz not null default now()
        )
      `);
      const baselineRows = await sql<{ filename: string }[]>`
        select filename from public.drizzle_baseline_bootstrap
      `;
      const baselineAppliedSet = new Set(baselineRows.map((row) => row.filename));

      for (const file of baselineFiles) {
        if (baselineAppliedSet.has(file)) continue;
        // psql meta-commands (pg_dump emits a `\restrict` header line) are not
        // valid SQL — strip any line whose first non-space char is a backslash
        // before sending the file over the wire protocol.
        const raw = readFileSync(path.join(baselineDir, file), "utf8");
        const content = raw
          .split("\n")
          .filter((line) => !/^\s*\\/.test(line))
          .join("\n");
        try {
          await sql.unsafe(content).simple();
          await sql`
            insert into public.drizzle_baseline_bootstrap (filename)
            values (${file})
            on conflict (filename) do nothing
          `;
          baselineApplied.push(file);
          logger.info("drizzle baseline applied", { file });
        } catch (error) {
          try {
            await sql.unsafe("ROLLBACK").simple();
          } catch {
            // No open transaction — connection already idle.
          }
          logger.error("drizzle baseline skipped a file", {
            file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
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

    // ── E2E seed (ephemeral previews only) ────────────────────────────
    // Opt-in E2E_SEED_ON_BOOT layered on the ephemeral bootstrap. A preview
    // with fixtures is directly testable (known accounts, workspace, IVR
    // campaign); a preview without them is exactly the bare-schema sign-in
    // failure this whole module exists to prevent. Never runs for managed
    // environments or where the fixtures already applied.
    let seedApplied: boolean | null = null;
    let seedSkippedReason:
      | "not-requested"
      | "managed-environment"
      | "already-applied"
      | undefined;
    if (e2eSeedEnabled(env) && !isManagedEnvironment(env)) {
      const seedTable = await sql<{ t: string | null }[]>`
        select to_regclass('public.e2e_seed_bootstrap') as t
      `;
      if (seedTable[0]?.t) {
        seedSkippedReason = "already-applied";
      } else {
        const exitCode = await runE2eSeed(options.rootDir);
        if (exitCode === 0) {
          await sql.unsafe(`
            create table if not exists public.e2e_seed_bootstrap (
              version text not null,
              applied_at timestamptz not null default now()
            )
          `);
          await sql`
            insert into public.e2e_seed_bootstrap (version)
            values ('1')
            on conflict (version) do nothing
          `;
          seedApplied = true;
        } else {
          // Seeding is best-effort: a failed seed must not block the app boot
          // (the preview stays usable via signup). Leave no marker so a later
          // boot retries it.
          seedApplied = false;
        }
      }
    } else if (e2eSeedEnabled(env)) {
      seedSkippedReason = "managed-environment";
    } else {
      seedSkippedReason = "not-requested";
    }

    return {
      ran: true,
      applied,
      skipped,
      baselineApplied,
      seedApplied,
      ...(seedSkippedReason ? { seedSkippedReason } : {}),
    };
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
