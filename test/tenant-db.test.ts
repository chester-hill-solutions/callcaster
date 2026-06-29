import { beforeEach, describe, expect, test, vi } from "vitest";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

import { sql, type SQL } from "drizzle-orm";
import { WORKSPACE_SCOPED_TABLES, type WorkspaceScopedTableName } from "@/db/workspace-scoped-tables";

// Mirror of the registry keys; kept inline so the fake can be built inside
// vi.hoisted (which cannot import other modules). A test below cross-checks
// this list against the real registry.
const SCOPED_TABLE_NAMES = [
  "campaign", "contact", "audience", "audience_upload", "call", "message",
  "outreach_attempt", "script", "survey", "webhook", "workspace_number",
  "workspace_invite", "transaction_history",
  "households", "inbound_queue", "inbound_queue_member", "inbound_queue_entry",
  "agent_status", "agent_status_event", "handset_session", "workspace_users",
  "workspace_api_key",
] as const;

type Captured = {
  findMany: Record<string, { config: unknown }[]>;
  findFirst: Record<string, { config: unknown }[]>;
  insert: { table: unknown; values: unknown }[];
  update: { table: unknown; set: unknown; where: SQL | undefined }[];
  delete: { table: unknown; where: SQL | undefined }[];
  select: { columns: unknown; table: unknown; where: SQL | undefined }[];
  transaction: { fn: (tx: unknown) => Promise<unknown> }[];
  txExecute: { query: SQL }[];
};

const hoisted = vi.hoisted(() => {
  const captured: Captured = {
    findMany: {},
    findFirst: {},
    insert: [],
    update: [],
    delete: [],
    select: [],
    transaction: [],
    txExecute: [],
  };
  const TABLES = [
    "campaign", "contact", "audience", "audience_upload", "call", "message",
    "outreach_attempt", "script", "survey", "webhook", "workspace_number",
    "workspace_invite", "transaction_history",
    "households", "inbound_queue", "inbound_queue_member", "inbound_queue_entry",
    "agent_status", "agent_status_event", "handset_session", "workspace_users",
    "workspace_api_key",
  ];
  const query: Record<string, { findMany: (c?: unknown) => Promise<unknown[]>; findFirst: (c?: unknown) => Promise<unknown> }> = {};
  for (const name of TABLES) {
    captured.findMany[name] = [];
    captured.findFirst[name] = [];
    query[name] = {
      findMany: (config?: unknown) => {
        captured.findMany[name].push({ config });
        return Promise.resolve([{ __table: name }]);
      },
      findFirst: (config?: unknown) => {
        captured.findFirst[name].push({ config });
        return Promise.resolve({ __table: name });
      },
    };
  }
  const fakeTx = {
    execute: (q: SQL) => {
      captured.txExecute.push({ query: q });
      return Promise.resolve({ rows: [] });
    },
  };
  const fakeDb = {
    query,
    insert: vi.fn((table: unknown) => ({
      values: (v: unknown) => ({
        returning: () => {
          captured.insert.push({ table, values: v });
          return Promise.resolve([{ __inserted: true }]);
        },
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: (s: unknown) => ({
        where: (w: SQL | undefined) => ({
          returning: () => {
            captured.update.push({ table, set: s, where: w });
            return Promise.resolve([{ __updated: true }]);
          },
        }),
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: (w: SQL | undefined) => ({
        execute: () => {
          captured.delete.push({ table, where: w });
          return Promise.resolve({ rows: [] });
        },
      }),
    })),
    select: vi.fn((columns: unknown) => ({
      from: (table: unknown) => ({
        where: (w: SQL | undefined) => {
          captured.select.push({ columns, table, where: w });
          return Promise.resolve([{ value: 7 }]);
        },
      }),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      captured.transaction.push({ fn });
      return fn(fakeTx);
    }),
  };
  return { fakeDb, captured, fakeTx };
});

vi.mock("@/server/db", () => ({ db: hoisted.fakeDb }));

import { createTenantDb, withAppCurrentUser } from "@/server/tenant-db";

const WORKSPACE_ID = "ws-123";

beforeEach(() => {
  const { captured } = hoisted;
  for (const name of Object.keys(captured.findMany)) {
    captured.findMany[name] = [];
    captured.findFirst[name] = [];
  }
  captured.insert = [];
  captured.update = [];
  captured.delete = [];
  captured.select = [];
  captured.transaction = [];
  captured.txExecute = [];
  hoisted.fakeDb.insert.mockClear();
  hoisted.fakeDb.update.mockClear();
  hoisted.fakeDb.delete.mockClear();
  hoisted.fakeDb.select.mockClear();
  hoisted.fakeDb.transaction.mockClear();
});

function isSQL(value: unknown): value is SQL {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as SQL).queryChunks)
  );
}

/** Recursively search a merged SQL's queryChunks for a sentinel by reference
 * (for `sql` sentinels) or by Param `.value` equality (for `eq` filters). */
function chunksContain(haystack: unknown, needle: unknown): boolean {
  if (haystack === needle) return true;
  if (
    typeof haystack === "object" &&
    haystack !== null &&
    "value" in haystack &&
    (haystack as { value: unknown }).value === needle
  ) {
    return true;
  }
  if (isSQL(haystack)) {
    for (const chunk of haystack.queryChunks) {
      if (chunksContain(chunk, needle)) return true;
    }
  }
  if (Array.isArray(haystack)) {
    for (const chunk of haystack) {
      if (chunksContain(chunk, needle)) return true;
    }
  }
  return false;
}

describe("createTenantDb — registry completeness", () => {
  test("exposes a scoped accessor for every workspace-column table", () => {
    const tdb = createTenantDb(WORKSPACE_ID);
    for (const name of Object.keys(WORKSPACE_SCOPED_TABLES) as WorkspaceScopedTableName[]) {
      expect(tdb[name], `tenant db missing ${name}`).toBeDefined();
      expect(typeof tdb[name].findMany, `${name}.findMany`).toBe("function");
      expect(typeof tdb[name].findFirst, `${name}.findFirst`).toBe("function");
      expect(typeof tdb[name].insert, `${name}.insert`).toBe("function");
      expect(typeof tdb[name].insertMany, `${name}.insertMany`).toBe("function");
      expect(typeof tdb[name].update, `${name}.update`).toBe("function");
      expect(typeof tdb[name].delete, `${name}.delete`).toBe("function");
      expect(typeof tdb[name].count, `${name}.count`).toBe("function");
    }
  });

  test("registry covers exactly the 22 workspace-scoped tables", () => {
    expect(Object.keys(WORKSPACE_SCOPED_TABLES)).toHaveLength(22);
    const registryNames = Object.keys(WORKSPACE_SCOPED_TABLES).sort();
    const inlineNames = [...SCOPED_TABLE_NAMES].sort();
    expect(registryNames).toEqual(inlineNames);
  });
});

describe("createTenantDb — read auto-scoping", () => {
  test("findMany with no where still applies the workspace filter", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    await tdb.campaign.findMany();
    const where = (captured.findMany.campaign.at(-1)!.config as { where?: unknown }).where;
    expect(isSQL(where), "workspace filter is a SQL").toBe(true);
  });

  test("findMany AND-merges a SQL user where with the workspace filter", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    const userWhere = sql`campaign.status = 'running'`;
    await tdb.campaign.findMany({ where: userWhere });
    const merged = (captured.findMany.campaign.at(-1)!.config as { where?: SQL }).where;
    expect(isSQL(merged)).toBe(true);
    expect(chunksContain(merged, userWhere), "merged where contains user clause").toBe(true);
  });

  test("findMany wraps a function-form user where and still AND-merges", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    const sentinel = sql`1=1`;
    await tdb.contact.findMany({ where: () => sentinel });
    const wrapped = (captured.findMany.contact.at(-1)!.config as { where?: unknown }).where;
    expect(typeof wrapped, "function-form where is preserved as a function").toBe("function");
    const evaluated = (wrapped as (a: unknown) => SQL)(undefined);
    expect(isSQL(evaluated)).toBe(true);
    expect(chunksContain(evaluated, sentinel), "evaluated merge contains user clause").toBe(true);
  });

  test("findFirst merges the workspace filter the same way", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    const userWhere = sql`c.id = 5`;
    await tdb.contact.findFirst({ where: userWhere });
    const merged = (captured.findFirst.contact.at(-1)!.config as { where?: SQL }).where;
    expect(isSQL(merged)).toBe(true);
    expect(chunksContain(merged, userWhere)).toBe(true);
  });
});

describe("createTenantDb — write auto-scoping", () => {
  test("insert auto-injects the `workspace` column for workspace-keyed tables", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    await tdb.campaign.insert({ title: "GOTV", status: "draft" } as never);
    const last = captured.insert.at(-1)!;
    expect((last.values as Record<string, unknown>).workspace).toBe(WORKSPACE_ID);
    expect((last.values as Record<string, unknown>).title).toBe("GOTV");
  });

  test("insert auto-injects the `workspace_id` column for workspace_id-keyed tables", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    await tdb.inbound_queue.insert({ name: "Main" } as never);
    const last = captured.insert.at(-1)!;
    expect((last.values as Record<string, unknown>).workspace_id).toBe(WORKSPACE_ID);
  });

  test("insertMany injects the tenancy column on every row", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    await tdb.message.insertMany([{ body: "a" }, { body: "b" }] as never);
    const rows = captured.insert.at(-1)!.values as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.workspace === WORKSPACE_ID)).toBe(true);
  });

  test("update AND-scopes where with the workspace filter", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    const userWhere = sql`c.id = 9`;
    await tdb.campaign.update({ set: { status: "paused" } as never, where: userWhere });
    const last = captured.update.at(-1)!;
    expect(isSQL(last.where)).toBe(true);
    expect(chunksContain(last.where, userWhere), "update where contains user clause").toBe(true);
    expect((last.set as Record<string, unknown>).status).toBe("paused");
  });

  test("update with no user where still scopes by workspace", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    await tdb.campaign.update({ set: { status: "archived" } as never });
    const last = captured.update.at(-1)!;
    expect(isSQL(last.where), "update with no where still gets workspace filter").toBe(true);
  });

  test("delete AND-scopes where with the workspace filter", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    const userWhere = sql`c.id = 3`;
    await tdb.campaign.delete({ where: userWhere });
    const last = captured.delete.at(-1)!;
    expect(isSQL(last.where)).toBe(true);
    expect(chunksContain(last.where, userWhere)).toBe(true);
  });

  test("count scopes by workspace and returns the numeric value", async () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    const n = await tdb.campaign.count();
    const last = captured.select.at(-1)!;
    expect(isSQL(last.where)).toBe(true);
    expect(n).toBe(7);
  });
});

describe("createTenantDb — instance scoping", () => {
  test("uses the provided dbInstance (e.g. a transaction) instead of the module db", async () => {
    const { captured } = hoisted;
    const txQuery: Record<string, { findMany: (c?: unknown) => Promise<unknown[]> }> = {
      campaign: {
        findMany: (c?: unknown) => {
          captured.findMany.campaign.push({ config: c });
          return Promise.resolve([{ __tx: true }]);
        },
      },
    };
    const txDb = {
      query: txQuery,
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      select: vi.fn(),
      transaction: vi.fn(),
    } as unknown as Parameters<typeof createTenantDb>[1];
    const tdb = createTenantDb(WORKSPACE_ID, txDb);
    const rows = await tdb.campaign.findMany();
    expect(rows).toEqual([{ __tx: true }]);
  });
});

describe("withAppCurrentUser", () => {
  test("runs fn inside db.transaction and sets app.current_user_id (transaction-local)", async () => {
    const { captured, fakeTx } = hoisted;
    const result = await withAppCurrentUser("user-42", async (tx) => {
      expect(tx).toBe(fakeTx);
      return "done";
    });
    expect(result).toBe("done");
    expect(captured.transaction).toHaveLength(1);
    expect(captured.txExecute).toHaveLength(1);
    // The execute query is `SELECT set_config('app.current_user_id', $1, true)`.
    const setConfigChunk = captured.txExecute[0].query.queryChunks.find((c) =>
      String((c as { value?: unknown })?.value ?? c).includes("set_config"),
    );
    expect(setConfigChunk, "transaction executed set_config(...)").toBeDefined();
  });
});

describe("createTenantDb — workspace filter correctness", () => {
  test("the workspace filter is eq(<tenancy column>, workspaceId)", () => {
    const { captured } = hoisted;
    const tdb = createTenantDb(WORKSPACE_ID);
    void tdb.inbound_queue.findMany();
    const where = (captured.findMany.inbound_queue.at(-1)!.config as { where: SQL }).where;
    expect(isSQL(where)).toBe(true);
    // eq(column, value) renders as a SQL whose chunks include the workspaceId
    // (wrapped in a Param chunk whose `.value` is the workspace id).
    expect(chunksContain(where, WORKSPACE_ID)).toBe(true);
  });
});
