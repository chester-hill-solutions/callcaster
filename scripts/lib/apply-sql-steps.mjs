import { readFileSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

/**
 * Apply a list of .sql files in order, over the driver the repo already
 * depends on.
 *
 * Both bootstrap scripts used to `spawnSync("psql", ...)`. That made a
 * PostgreSQL *client binary* a hard requirement for creating a test database,
 * and its absence is a silent trap: `spawnSync` on a missing binary returns a
 * non-zero status, so the script reported "failed on
 * bootstrap-compose-reset.sql" and pointed at the SQL rather than at the real
 * cause. Nothing in this repo needs the binary — `postgres` is already a direct
 * dependency, and the only thing the driver cannot parse is psql's own
 * meta-command syntax.
 *
 * `drizzle/0000_baseline.sql` is pg_dump output and opens with
 *
 *     \restrict <token>
 *
 * and closes with `\unrestrict <token>`. Those are psql meta-commands, not
 * SQL, and a driver rejects them with a syntax error near "\". They are
 * pg_dump's copy-safety markers and carry no meaning for the server, so
 * dropping those lines is the whole compatibility story. Anything else in these
 * files — dollar-quoted plpgsql bodies, `SECURITY DEFINER`, triggers,
 * `FOR UPDATE SKIP LOCKED` — is ordinary SQL the driver executes unchanged.
 *
 * `COPY ... FROM stdin` with inline data would *not* work this way, so this
 * helper fails loudly if it meets one rather than silently truncating.
 */

/** Lines that are psql meta-commands rather than SQL. */
const PSQL_META_COMMAND = /^\s*\\[A-Za-z]/;

function stripPsqlMetaCommands(sql) {
  return sql
    .split("\n")
    .filter((line) => !PSQL_META_COMMAND.test(line))
    .join("\n");
}

export async function applySqlSteps({
  databaseUrl,
  steps,
  rootDir,
  label,
  log = console.log,
  logError = console.error,
}) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  /**
   * Re-asserted before EVERY step, not once at connect.
   *
   * The migration files rely on a `search_path`, exactly as they do under psql
   * — `drizzle/0002_workspace_events.sql` creates tables with no schema
   * qualification. Setting it once is not enough: the first step
   * (`bootstrap-compose-reset.sql`) runs `DROP SCHEMA public CASCADE`, and
   * Postgres removes a dropped schema from the session's search_path. The
   * later `CREATE SCHEMA public` recreates the schema but does NOT put it back
   * in the path, so every unqualified CREATE after the reset fails with
   * "no schema has been selected to create in". Re-asserting per step is what
   * makes these files mean the same thing over either client.
   */
  const setSearchPath = () => sql`select set_config('search_path', '"$user", public', false)`;

  try {
    for (const step of steps) {
      const file = path.join(rootDir, step);
      const raw = readFileSync(file, "utf8");
      if (/\bcopy\b[\s\S]{0,200}\bfrom\s+stdin/i.test(raw)) {
        throw new Error(
          `${step} uses COPY ... FROM stdin, which cannot be applied through a ` +
            `driver. Run it with psql, or convert the data to INSERTs.`,
        );
      }
      log(`[${label}] applying ${step}`);
      await setSearchPath();
      try {
        await sql.unsafe(stripPsqlMetaCommands(raw));
      } catch (error) {
        logError(`[${label}] failed on ${step}`);
        logError(`[${label}] ${error instanceof Error ? error.message : error}`);
        throw error;
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  log(`[${label}] complete`);
}

/**
 * Is the database accepting connections and answering queries?
 *
 * The two callers used `spawnSync("psql", [url, "-tAc", "select 1"])` as a
 * readiness probe, which carries the same trap as the bootstrap did: a missing
 * client binary makes the probe fail for a reason that has nothing to do with
 * Postgres, and the caller then reports "Postgres never became ready" after
 * spinning. Asking the server over the driver the repo already depends on
 * cannot fail for that reason.
 */
export async function isDatabaseReady(databaseUrl) {
  let sql;
  try {
    sql = postgres(databaseUrl, { max: 1, connect_timeout: 3, onnotice: () => {} });
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql?.end({ timeout: 1 }).catch(() => {});
  }
}
