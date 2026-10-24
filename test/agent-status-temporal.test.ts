import { describe, expect, test } from "vitest";

import type { TenantDb } from "@/server/tenant-db";
import {
  heartbeatAgentStatus,
  updateAgentStatus,
} from "@/lib/agent-status.server";

type Row = Record<string, unknown>;

type Captured = {
  existing: Row | null;
  inserts: Row[];
  updates: Row[];
  events: Row[];
};

/**
 * The write boundary for the agent-presence tables.
 *
 * These columns are `timestamp with time zone` in the database and were
 * declared `text()` in Drizzle until this slice. With `mode: "date"` the
 * contract is a `Date` on write: the old declaration accepted an ISO string and
 * it still reached the column, because Postgres coerces the literal. These
 * tests pin the type the model now promises, so a revert to `text()` fails here
 * as well as at the drift guard.
 */
function fakeTdb(captured: Captured): TenantDb {
  return {
    agent_status: {
      findFirst: async () => captured.existing ?? undefined,
      update: async ({ set }: { set: Row }) => {
        captured.updates.push(set);
        return [{ ...(captured.existing ?? {}), ...set }];
      },
      insert: async (values: Row) => {
        captured.inserts.push(values);
        return [values];
      },
    },
    agent_status_event: {
      insert: async (values: Row) => {
        captured.events.push(values);
        return [values];
      },
    },
  } as unknown as TenantDb;
}

function captured(existing: Row | null = null): Captured {
  return { existing, inserts: [], updates: [], events: [] };
}

const startedAt = new Date("2026-10-01T12:00:00.000Z");

function existingRow(overrides: Row = {}): Row {
  return {
    workspace_id: "w1",
    user_id: "u1",
    status: "available",
    status_started_at: startedAt,
    last_heartbeat_at: startedAt,
    updated_at: startedAt,
    ...overrides,
  };
}

describe("agent presence timestamps are Dates at the write boundary", () => {
  test("a first transition writes Dates for the row and its event", async () => {
    const state = captured(null);
    const result = await updateAgentStatus(
      "w1",
      "u1",
      "available",
      undefined,
      fakeTdb(state),
    );

    expect("error" in result).toBe(false);
    expect(state.inserts[0]).toMatchObject({
      status_started_at: expect.any(Date),
      last_heartbeat_at: expect.any(Date),
      updated_at: expect.any(Date),
    });
    expect(state.events[0]).toMatchObject({ created_at: expect.any(Date) });
  });

  test("a later transition starts the new status now and records the event", async () => {
    const state = captured(existingRow());

    await updateAgentStatus("w1", "u1", "busy", "on a call", fakeTdb(state));

    const set = state.updates[0];
    // A new status starts now, so the previous start time is replaced.
    expect(set?.status_started_at).toEqual(expect.any(Date));
    expect(set?.status_started_at).not.toBe(startedAt);
    expect(set?.last_heartbeat_at).toEqual(set?.status_started_at);
    expect(set?.updated_at).toEqual(set?.status_started_at);
    expect(state.events[0]).toMatchObject({ created_at: expect.any(Date) });
  });

  test("re-selecting the current status refreshes the heartbeat without resetting the start time", async () => {
    const state = captured(existingRow());

    await updateAgentStatus("w1", "u1", "available", undefined, fakeTdb(state));

    expect(state.updates[0]?.status_started_at).toBe(startedAt);
    expect(state.updates[0]?.last_heartbeat_at).toEqual(expect.any(Date));
    // Same status, so no transition event is recorded.
    expect(state.events).toHaveLength(0);
  });

  test("a heartbeat writes a Date", async () => {
    const state = captured(existingRow());

    await heartbeatAgentStatus("w1", "u1", fakeTdb(state));

    expect(state.updates[0]?.last_heartbeat_at).toEqual(expect.any(Date));
  });
});
