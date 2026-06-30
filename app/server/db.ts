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

/** Connection pool for queries (uses pgbouncer-friendly URL if separate). */
const queryClient = postgres(DATABASE_URL as string, { prepare: false, max: 10 });

/** Direct connection for LISTEN/NOTIFY (no pgbouncer). */
const directClient = postgres((DATABASE_DIRECT_URL as string) ?? (DATABASE_URL as string), { prepare: false, max: 5 });

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
