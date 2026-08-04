import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import * as authSchema from "../db/auth-schema";

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_DIRECT_URL = process.env.DATABASE_DIRECT_URL ?? DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required. Set it to the Railway Postgres connection string.",
  );
}

/**
 * Server-side statement budget, in milliseconds.
 *
 * The web app, the admin client and every tenant client share one ten-
 * connection pool, and the job worker draws from it too. Without a cap, a
 * single query against a missing index or a lock it will never get holds its
 * connection indefinitely; ten of those and the whole process stops serving —
 * including `/readyz`, so the healthcheck cannot even report the problem.
 *
 * 30s is far above anything legitimate here. The heaviest write path, CSV
 * audience upload, inserts in chunks of 40 rows
 * (`AUDIENCE_UPLOAD_CHUNK_SIZE`), and no request path intentionally runs a
 * long query. Overridable for the rare operational case that needs more,
 * without becoming another required environment variable.
 */
const STATEMENT_TIMEOUT_MS = Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 30_000);

/**
 * A transaction left open holds its locks and its connection. This bounds the
 * damage from a code path that opens one and then awaits something slow
 * (a provider call, say) without committing.
 */
const IDLE_IN_TRANSACTION_TIMEOUT_MS = Number(
  process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS ?? 60_000,
);

/**
 * Shared pool options. Fail closed under contention rather than queue forever
 * (CI/local may see faster connect failures — that is intentional).
 * Values are seconds (postgres.js conventions), except `connection`, which is
 * a set of Postgres GUCs applied to every session in the pool.
 */
const poolOpts = {
  prepare: false,
  connect_timeout: 10,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connection: {
    statement_timeout: STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
  },
} as const;

/** Connection pool for queries (uses pgbouncer-friendly URL if separate). */
const queryClient = postgres(DATABASE_URL as string, { ...poolOpts, max: 10 });

/** Direct connection for LISTEN/NOTIFY (no pgbouncer). */
const directClient = postgres(
  (DATABASE_DIRECT_URL as string) ?? (DATABASE_URL as string),
  { ...poolOpts, max: 5 },
);

/** Drizzle instance for all ORM queries. */
export const db = drizzle(queryClient, { schema: { ...schema, ...authSchema } });

/** Drizzle instance on the direct connection (for LISTEN/NOTIFY, SSE). */
export const dbDirect = drizzle(directClient, { schema: { ...schema, ...authSchema } });

/** Raw postgres clients for advanced operations (LISTEN, COPY, etc.). */
export const pool = queryClient;
export const directPool = directClient;

// The unscoped admin client lives in `./admin-db` behind a route-unimportable
// module boundary (ADR-0004). Route code must use `createTenantDb` instead.
export type Database = typeof db;
export type DbClient = Database;
