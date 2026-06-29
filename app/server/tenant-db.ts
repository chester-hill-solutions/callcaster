import { and, eq, sql, type SQL } from "drizzle-orm";
import { count } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db, type Database } from "./db";
import { WORKSPACE_SCOPED_TABLES, type WorkspaceScopedTableName } from "../db/workspace-scoped-tables";

/**
 * Per-table scoped accessor returned by {@link createTenantDb}.
 *
 * Reads (`findMany`/`findFirst`) delegate to Drizzle's relational query API
 * (`db.query.<table>`) with the workspace predicate AND-merged into the
 * caller's `where`, so all relational opts (`with`, `orderBy`, `columns`,
 * `limit`, `offset`, `extras`) keep their full typing.
 *
 * Writes auto-inject the tenancy column on insert and auto-scope `where` on
 * update/delete. The tenancy column is stripped from `insert`/`update` inputs
 * so a caller can never reassign a row to another workspace.
 */
export type ScopedTableApi<K extends WorkspaceScopedTableName> = {
  findMany: (typeof db.query)[K]["findMany"];
  findFirst: (typeof db.query)[K]["findFirst"];
  insert: (values: ScopedInsert<K>) => Promise<InferSelectModel<TableFor<K>>[]>;
  insertMany: (values: ScopedInsert<K>[]) => Promise<InferSelectModel<TableFor<K>>[]>;
  update: (opts: {
    set: ScopedUpdate<K>;
    where?: SQL;
  }) => Promise<InferSelectModel<TableFor<K>>[]>;
  delete: (opts: { where?: SQL }) => Promise<void>;
  count: (opts?: { where?: SQL }) => Promise<number>;
};

/**
 * Auto-scoped Drizzle facade for a single workspace. Every table in
 * {@link WORKSPACE_SCOPED_TABLES} is filtered by its tenancy column on every
 * query. This is the only tenant-data accessor route code may use (ADR-0004).
 */
export type TenantDb = {
  [K in WorkspaceScopedTableName]: ScopedTableApi<K>;
};

type TableFor<K extends WorkspaceScopedTableName> = (typeof WORKSPACE_SCOPED_TABLES)[K]["table"];
type ColumnNameFor<K extends WorkspaceScopedTableName> =
  (typeof WORKSPACE_SCOPED_TABLES)[K]["workspaceColumn"]["name"];
type ScopedInsert<K extends WorkspaceScopedTableName> = Omit<
  InferInsertModel<TableFor<K>>,
  ColumnNameFor<K>
>;
type ScopedUpdate<K extends WorkspaceScopedTableName> = Partial<
  Omit<InferSelectModel<TableFor<K>>, ColumnNameFor<K>>
>;

type RelationalConfig = { where?: SQL | ((aliases: unknown) => SQL | undefined) } & Record<
  string,
  unknown
>;

type ScopedEntry = { table: PgTable; workspaceColumn: PgColumn };

/**
 * Build a workspace-scoped Drizzle facade. Every read/write against a
 * workspace-column table is auto-filtered by `workspaceId` so route code can
 * never accidentally leak cross-tenant rows. Pass an optional `dbInstance` to
 * scope inside a transaction (e.g. compose with {@link withAppCurrentUser}).
 */
export function createTenantDb(workspaceId: string, dbInstance: Database = db): TenantDb {
  const queryAny = dbInstance.query as unknown as Record<
    WorkspaceScopedTableName,
    { findMany: (config?: RelationalConfig) => Promise<unknown[]>; findFirst: (config?: RelationalConfig) => Promise<unknown> }
  >;

  const api = {} as Record<WorkspaceScopedTableName, unknown>;

  for (const tableName of Object.keys(WORKSPACE_SCOPED_TABLES) as WorkspaceScopedTableName[]) {
    const entry = WORKSPACE_SCOPED_TABLES[tableName] as ScopedEntry;
    const column = entry.workspaceColumn;
    const columnName = column.name;
    const workspaceFilter = eq(column, workspaceId) as unknown as SQL;
    const relational = queryAny[tableName];

    api[tableName] = {
      findMany: (config?: RelationalConfig) =>
        relational.findMany(mergeRelationalConfig(config, workspaceFilter)),
      findFirst: (config?: RelationalConfig) =>
        relational.findFirst(mergeRelationalConfig(config, workspaceFilter)),

      insert: (values: Record<string, unknown>) =>
        dbInstance
          .insert(entry.table)
          .values({ ...values, [columnName]: workspaceId })
          .returning() as Promise<unknown[]>,
      insertMany: (values: Record<string, unknown>[]) =>
        dbInstance
          .insert(entry.table)
          .values(values.map((v) => ({ ...v, [columnName]: workspaceId })))
          .returning() as Promise<unknown[]>,
      update: (opts: { set: Record<string, unknown>; where?: SQL }) =>
        dbInstance
          .update(entry.table)
          .set(opts.set)
          .where(mergePlainWhere(opts.where, workspaceFilter))
          .returning() as Promise<unknown[]>,
      delete: (opts: { where?: SQL }) =>
        dbInstance
          .delete(entry.table)
          .where(mergePlainWhere(opts.where, workspaceFilter))
          .execute()
          .then(() => undefined),
      count: (opts?: { where?: SQL }) =>
        dbInstance
          .select({ value: count() })
          .from(entry.table)
          .where(mergePlainWhere(opts?.where, workspaceFilter))
          .then((rows: { value: number }[]) => rows[0]?.value ?? 0),
    };
  }

  return api as unknown as TenantDb;
}

/**
 * Run `fn` inside a `db.transaction()` with the Postgres session variable
 * `app.current_user_id` set (transaction-local) so SECURITY DEFINER plpgsql
 * RPCs can read the actor via `current_setting('app.current_user_id', true)`.
 * `fn` receives a Drizzle instance bound to the transaction connection — use it
 * (or {@link createTenantDb} composed with it) for any RPCs/queries that must
 * observe the actor setting (ADR-0004, ADR-0006).
 */
export async function withAppCurrentUser<T>(
  userId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    return fn(tx as unknown as Database);
  });
}

function mergeRelationalConfig(config: RelationalConfig | undefined, workspaceFilter: SQL): RelationalConfig {
  const cfg = (config ?? {}) as RelationalConfig;
  const userWhere = cfg.where;
  if (typeof userWhere === "function") {
    return {
      ...cfg,
      where: (aliases: unknown) => {
        const resolved = userWhere(aliases);
        return resolved ? and(workspaceFilter, resolved) : workspaceFilter;
      },
    };
  }
  return { ...cfg, where: userWhere ? (and(workspaceFilter, userWhere) as SQL) : workspaceFilter };
}

function mergePlainWhere(userWhere: SQL | undefined, workspaceFilter: SQL): SQL {
  return userWhere ? (and(workspaceFilter, userWhere) as SQL) : workspaceFilter;
}
