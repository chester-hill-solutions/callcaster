import { describe, expect, test } from "vitest";

import type { TenantDb } from "@/server/tenant-db";
import {
  addInboundQueueMember,
  createInboundQueue,
  updateInboundQueue,
} from "@/lib/inbound-queue-db.server";

type Row = Record<string, unknown>;

type Captured = {
  inserts: Row[];
  updates: Row[];
};

/**
 * The write boundary for the inbound-queue tables.
 *
 * `inbound_queue.created_at`/`updated_at`, `inbound_queue_member.created_at` and
 * the six temporal columns on `inbound_queue_entry` are `timestamp with time
 * zone` in the database and were declared `text()` in Drizzle until this slice
 * (#2213). With `mode: "date"` the write contract is a `Date`; an ISO string
 * only reached the column before because Postgres coerced it.
 *
 * The entry columns themselves are written by the claim/complete/abandon RPCs,
 * so there is no TypeScript write to pin here — the drift guard covers those.
 */
function fakeTdb(captured: Captured): TenantDb {
  return {
    inbound_queue: {
      findFirst: async () => ({ id: 1 }),
      insert: async (values: Row) => {
        captured.inserts.push(values);
        return [values];
      },
      update: async ({ set }: { set: Row }) => {
        captured.updates.push(set);
        return [{ id: 1, ...set }];
      },
    },
    inbound_queue_member: {
      insert: async (values: Row) => {
        captured.inserts.push(values);
        return [values];
      },
    },
    workspace_member: {
      findFirst: async () => ({ user_id: "u1", role_id: "caller" }),
    },
    execute: async () => [{ id: "u1" }],
  } as unknown as TenantDb;
}

function captured(): Captured {
  return { inserts: [], updates: [] };
}

describe("inbound queue timestamps are Dates at the write boundary", () => {
  test("creating a queue writes Dates for created_at and updated_at", async () => {
    const state = captured();

    await createInboundQueue({
      workspaceId: "w1",
      name: "Support",
      tdb: fakeTdb(state),
    });

    expect(state.inserts[0]).toMatchObject({
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    });
  });

  test("updating a queue writes a Date", async () => {
    const state = captured();

    await updateInboundQueue({
      workspaceId: "w1",
      id: 1,
      updates: { name: "Renamed" },
      tdb: fakeTdb(state),
    });

    expect(state.updates[0]).toMatchObject({ updated_at: expect.any(Date) });
  });

  test("adding a member writes a Date", async () => {
    const state = captured();

    await addInboundQueueMember({
      workspaceId: "w1",
      queueId: 1,
      userId: "u1",
      tdb: fakeTdb(state),
    });

    expect(state.inserts[0]).toMatchObject({ created_at: expect.any(Date) });
  });
});
