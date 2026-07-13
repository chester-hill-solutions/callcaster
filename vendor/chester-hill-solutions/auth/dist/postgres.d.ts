import type postgres from "postgres";
import type { PostgresActorOptions } from "./types.js";
/**
 * Runs `fn` inside a postgres.js transaction with a transaction-local `set_config`.
 * Defaults to `app.current_user_id` for SECURITY DEFINER RPCs that read actor context.
 */
export declare function withPostgresActorContext<T>(sql: postgres.Sql, options: PostgresActorOptions, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T>;
/** Convenience wrapper for the common `app.current_user_id` actor setting. */
export declare function withAppCurrentUser<T>(sql: postgres.Sql, userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T>;
