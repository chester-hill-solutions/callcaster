import { db } from "./db";

/**
 * Admin (unscoped) Drizzle client for cross-workspace operations: the Bun job
 * worker, pg_cron-driven handlers, billing reconciliation, and internal
 * migration tooling.
 *
 * **Module boundary (ADR-0004):** this client MUST NOT be imported from route
 * modules. Route code uses {@link createTenantDb} from `@/server/tenant-db` for
 * tenant data and `@/db/schema` for column references. The
 * `no-restricted-imports` ESLint rule on `app/routes/**` enforces this.
 */
export const adminDb = db;
