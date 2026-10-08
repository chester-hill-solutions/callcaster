import { and, eq, sql, type SQL , InferInsertModel, InferSelectModel } from "drizzle-orm";
import { count } from "drizzle-orm";
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
} & {
  execute: (query: SQL) => Promise<unknown[]>;
};

type TableFor<K extends WorkspaceScopedTableName> = (typeof WORKSPACE_SCOPED_TABLES)[K]["table"];
/**
 * The tenancy column's name as a **literal**, taken from the registry's
 * `workspaceColumnName` rather than from `workspaceColumn.name`.
 *
 * Drizzle types a column's `name` as `string`, so reading it here widened the
 * key to `string` and `Omit<InferInsertModel<T>, string>` collapsed to `{}` —
 * meaning `ScopedInsert` and `ScopedUpdate` accepted *any* object and no
 * workspace-scoped write was type-checked at all. Three production writes
 * carrying ISO strings into `timestamptz` columns shipped past `tsc` that way
 * (#2242). `test/tenant-db.test.ts` asserts the literal matches
 * `workspaceColumn.name` for every table, so it cannot drift.
 */
type ColumnNameFor<K extends WorkspaceScopedTableName> =
  (typeof WORKSPACE_SCOPED_TABLES)[K]["workspaceColumnName"];
/**
 * The tenancy column is removed with a **mapped type**, not `Omit`.
 *
 * `Omit<InferInsertModel<TableFor<K>>, ColumnNameFor<K>>` looks equivalent and
 * is not: both sides are double indexed accesses through the generic `K`, and
 * TypeScript defers them. Asked directly, `ColumnNameFor<"contact">` reports
 * `string`, so `Exclude<keyof T, string>` should leave nothing — but `Omit`
 * returned a single leftover key instead of the 24 the table actually has. The
 * write boundary was therefore still effectively open, and `tsc` reported real
 * columns as "does not exist in type `ScopedInsert<...>`".
 *
 * Filtering key-by-key with `as` forces evaluation per key and resolves
 * correctly. Measured with the compiler API, not assumed.
 */
type ScopedInsert<K extends WorkspaceScopedTableName> = {
  [P in keyof InferInsertModel<TableFor<K>> as P extends ColumnNameFor<K>
    ? never
    : P]: InferInsertModel<TableFor<K>>[P];
};
/**
 * The `set` for a tenant-scoped update.
 *
 * Every column keeps its model type; `SQL` is admitted alongside it because
 * that is Drizzle's own `PgUpdateSetSource` (`SQL | column values`) and the
 * guards in `message-db.server.ts` depend on it to enforce a status transition
 * atomically inside the UPDATE. This is the driver's documented fragment
 * escape, not a widening — `set: { body: 123 }` still fails.
 *
 * `insert` deliberately does **not** admit `SQL`: Drizzle has no fragment form
 * for insert values.
 */
type ScopedUpdate<K extends WorkspaceScopedTableName> = Partial<{
  [P in keyof InferSelectModel<TableFor<K>> as P extends ColumnNameFor<K> ? never : P]:
    | InferSelectModel<TableFor<K>>[P]
    | SQL;
}>;

type RelationalConfig = { where?: SQL | ((aliases: unknown) => SQL | undefined) } & Record<
  string,
  unknown
>;

type ScopedEntry = { table: PgTable; workspaceColumn: PgColumn };

/**
 * `ScopedUpdate` omits the tenancy column at compile time only; a caller
 * holding a loosely typed object could still reassign a row to another
 * workspace. Drop the column before the update reaches Drizzle.
 */
function withoutTenancyColumn(
  values: Record<string, unknown>,
  columnName: string,
): Record<string, unknown> {
  if (!(columnName in values)) return values;
  const rest = { ...values };
  delete rest[columnName];
  return rest;
}

/**
 * Compile-time contract for the write boundary (#2242). **Never executed** —
 * `npm run typecheck` is the assertion.
 *
 * It lives here rather than in `test/` because tsconfig excludes test files by
 * glob, so a `@ts-expect-error` in a suite is never checked by anything. A
 * guard that nothing runs is a comment.
 *
 * Each `@ts-expect-error` fails the **build** if the error it describes stops
 * being an error, so the boundary cannot silently reopen. That is how this file
 * is tested — there is no runtime half, deliberately: a runtime check would
 * need a real database, and a mocked client is exactly what hid the original
 * defect.
 *
 * What it is guarding: `insert` was declared `(values: ScopedInsert<K>)` and
 * implemented as `(values: Record<string, unknown>)`, and `ColumnNameFor`
 * resolved to `string`, so the boundary accepted any object. Three production
 * writes carried ISO strings into `timestamptz` columns past `tsc`; postgres.js
 * encodes a `Date` bind by calling `.toISOString()`, so the inbound-SMS webhook
 * returned 400 on every inbound text. e2e caught it.
 */
function writeBoundaryContract(tdb: TenantDb): void {
  // The exact #2241 defect: `message.date_created` is `timestamp` in
  // `mode: "date"`, so the value has to be a `Date`.
  // @ts-expect-error string is not assignable to Date
  void tdb.message.insert({ sid: "SM1", date_created: "2026-01-01T00:00:00.000Z" });

  // @ts-expect-error not a column of `contact`
  void tdb.contact.insert({ firstname: "Ada", definitely_not_a_column: 1 });

  // The tenancy column is auto-injected, so a caller cannot supply it. That is
  // what keeps a row from being moved into another workspace.
  // @ts-expect-error `workspace` is stripped from the insert type
  void tdb.contact.insert({ firstname: "Ada", workspace: "somebody-elses-workspace" });

  // @ts-expect-error `message.body` is text
  void tdb.message.update({ set: { body: 123 } });

  // The counterpart, and just as load-bearing: a SQL fragment in `set` is
  // Drizzle's own documented form, and the status guards in
  // `message-db.server.ts` depend on it to enforce a transition atomically
  // inside the UPDATE. Removing this makes the guards silently broken.
  void tdb.message.update({ set: { status: sql`lower(status)` } });

  // `contact.created_at` is `NOT NULL DEFAULT now()` in every real database.
  // The model declares that default, so omitting the column is correct. Before
  // the default was declared the boundary demanded it here, and 11 call sites
  // were pushed toward writing a value they had no reason to supply.
  void tdb.contact.insert({ firstname: "Ada", surname: "Lovelace" });
}
void writeBoundaryContract;

/**
 * Build a workspace-scoped Drizzle facade. Every read/write against a
 * workspace-column table is auto-filtered by `workspaceId` so route code can
 * never accidentally leak cross-tenant rows. Pass an optional `dbInstance` to
 * scope inside a transaction (e.g. compose with {@link withAppCurrentUser}).
 */
export function createTenantDb(workspaceId: string, dbInstance: Pick<Database, "query" | "insert" | "update" | "delete" | "select" | "execute"> = db): TenantDb {
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
          .set(withoutTenancyColumn(opts.set, columnName))
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

  (api as Record<string, unknown>).execute = (query: SQL) => dbInstance.execute(query);

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
