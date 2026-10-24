import { beforeEach, describe, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const WS_A = "11111111-1111-1111-1111-111111111111";
const WS_B = "22222222-2222-2222-2222-222222222222";

const mocks = vi.hoisted(() => ({
  /** The WHERE clause of every campaign_queue write this test drives. */
  whereSql: [] as string[],
  whereParams: [] as unknown[][],
}));

const pgDialect = new PgDialect({ casing: { escapeName: (n: string) => `"${n}"` } });
const render = (clause: unknown) => pgDialect.sqlToQuery(clause as SQL);

/**
 * A chainable stand-in for the unscoped Drizzle client. `where` records the
 * clause it was handed and then behaves like a resolved, empty result, so the
 * write path runs without a database and the assertion is about the statement
 * the helper actually built.
 */
function makeDb() {
  const chain = {
    from: () => chain,
    set: () => chain,
    where: (clause: unknown) => {
      const { sql, params } = render(clause);
      mocks.whereSql.push(sql);
      mocks.whereParams.push(params);
      const resolved = Promise.resolve([]) as Promise<unknown[]> & {
        returning: () => Promise<unknown[]>;
      };
      resolved.returning = async () => [];
      return resolved;
    },
  };
  return {
    select: () => chain,
    update: () => chain,
    insert: () => chain,
    execute: vi.fn(async () => []),
  };
}

vi.mock("@/server/db", () => ({ db: makeDb() }));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => makeDb()),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitQueueEvent: vi.fn(async () => undefined),
  publishWorkspaceEvent: vi.fn(async () => undefined),
}));

/**
 * The by-id dequeue must not accept a workspace-less call. The predicate is
 * the only thing that keeps a by-id write inside the caller's tenant, so the
 * requirement is enforced by the type, not by a runtime check that a later
 * change could quietly drop.
 */
type DequeueArgs = Parameters<
  (typeof import("@/lib/campaign-queue-db.server"))["dequeueQueueEntry"]
>[0];
// @ts-expect-error a by-id dequeue without a workspaceId must not compile
const _workspaceIsRequired: DequeueArgs = {
  by: { id: 1 },
  userId: "u1",
  reason: "r",
};

describe("campaign_queue writes are workspace-scoped", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.whereSql = [];
    mocks.whereParams = [];
  });

  test("a by-id dequeue only ever touches a row of the caller's workspace", async () => {
    const mod = await import("@/lib/campaign-queue-db.server");

    await mod.dequeueQueueEntry({
      by: { id: 7 },
      userId: "user-a",
      reason: "test dequeue",
      workspaceId: WS_A,
    });

    expect(mocks.whereSql.length).toBeGreaterThan(0);
    const sql = mocks.whereSql[0];
    const params = mocks.whereParams[0];
    // The workspace predicate is part of the statement, not an optional
    // argument: the row id alone must never select a row.
    expect(sql).toContain('"campaign_queue"."workspace"');
    expect(sql).toContain('"campaign_queue"."id"');
    expect(params).toContain(WS_A);
    // The caller's workspace is the only tenant in the predicate.
    expect(params).not.toContain(WS_B);
  });

  test("recording a failed attempt is scoped to the caller's workspace", async () => {
    const mod = await import("@/lib/campaign-queue-db.server");

    await mod.recordQueueAttemptFailure({
      queueId: 7,
      error: "boom",
      workspaceId: WS_A,
    });

    expect(mocks.whereSql.length).toBeGreaterThan(0);
    const sql = mocks.whereSql[0];
    expect(sql).toContain('"campaign_queue"."workspace"');
    expect(sql).toContain('"campaign_queue"."id"');
    expect(mocks.whereParams[0]).toContain(WS_A);
  });

  test("a by-id dequeue without a workspace is refused", async () => {
    const mod = await import("@/lib/campaign-queue-db.server");

    // The type already requires a workspace; this is the runtime guard behind
    // it, so a workspace-less dequeue can never select a row of any tenant.
    await expect(
      mod.dequeueQueueEntry({
        by: { id: 7 },
        userId: "user-a",
        reason: "test dequeue",
      } as never),
    ).rejects.toThrow(/workspaceId is required/);
    expect(mocks.whereSql).toEqual([]);
  });
});
