import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { RouterContextProvider } from "react-router";
import { asRouteResponse } from "../helpers/route-result";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
const session = vi.hoisted(() => ({ userId: "" }));
const events = vi.hoisted(() => ({ emit: vi.fn() }));
vi.unmock("@/lib/api-auth.server");
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: vi.fn(async () => ({
    user: session.userId ? { id: session.userId } : null,
    headers: new Headers(),
  })),
}));
vi.mock("@/lib/campaign-queue-updates.server", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/campaign-queue-updates.server")
    >();
  return {
    ...original,
    requeueAllCampaignQueueForCampaign: vi.fn(
      original.requeueAllCampaignQueueForCampaign,
    ),
  };
});
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitQueueEvent: events.emit,
}));
const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = randomUUID();
const foreign = randomUUID();
const actor = randomUUID();
let campaign: number;
let otherCampaign: number;
let foreignCampaign: number;
const states = [
  {
    name: "dequeued history",
    queue: "dequeued",
    at: "2026-10-01T12:00:00.000Z",
    reason: "Fixture completed",
  },
  {
    name: "exhausted failed history",
    queue: "failed",
    at: "2026-10-01T12:00:00.000Z",
    reason: "Fixture exhausted",
  },
  {
    name: "timestamp-only history",
    queue: "assigned",
    at: "2026-10-01T12:00:00.000Z",
    reason: null,
    by: null,
  },
  {
    name: "reason-only history",
    queue: "queued",
    at: null,
    reason: "Fixture parked",
    by: null,
  },
  {
    name: "dequeued state-only history",
    queue: "dequeued",
    at: null,
    reason: null,
  },
];
suite("ordinary queue reset against actual Postgres writer (#2153)", () => {
  beforeAll(() => {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    vi.stubEnv("BASE_URL", "http://127.0.0.1:3038");
  });
  async function services() {
    return {
      ...(await import("@/server/db")),
      ...(await import("@/lib/campaign-queue-updates.server")),
    };
  }
  async function cleanup() {
    const { pool } = await services();
    await pool`delete from campaign_queue where workspace in (${workspace}, ${foreign})`;
    await pool`delete from contact where workspace in (${workspace}, ${foreign})`;
    await pool`delete from campaign where workspace in (${workspace}, ${foreign})`;
    await pool`delete from workspace_member where workspace_id in (${workspace}, ${foreign})`;
    await pool`delete from workspace where id in (${workspace}, ${foreign})`;
    await pool`delete from "user" where id = ${actor}`;
  }
  beforeEach(async () => {
    await cleanup();
    const { pool } = await services();
    await pool`insert into "user" (id, username) values (${actor}, ${`reset-${actor}@example.invalid`})`;
    await pool`insert into workspace (id, name, credits, twilio_data) values (${workspace}, 'Reset fixture', 1000, '{}'::jsonb), (${foreign}, 'Foreign reset control', 1000, '{}'::jsonb)`;
    const rows =
      await pool`insert into campaign (workspace, title, type, dial_type, status) values (${workspace}, 'Reset primary', 'live_call', 'call', 'draft'), (${workspace}, 'Reset other', 'live_call', 'call', 'draft'), (${foreign}, 'Foreign reset', 'live_call', 'call', 'draft') returning id, title`;
    campaign = Number(rows.find((x) => x.title === "Reset primary")?.id);
    otherCampaign = Number(rows.find((x) => x.title === "Reset other")?.id);
    foreignCampaign = Number(rows.find((x) => x.title === "Foreign reset")?.id);
    await pool`insert into workspace_member (id, workspace_id, user_id, role_id)
      values (${`reset:${workspace}:${actor}`}, ${workspace}, ${actor}, 'owner')`;
    session.userId = actor;
    events.emit.mockReset().mockResolvedValue(undefined);
    (await services()).requeueAllCampaignQueueForCampaign.mockClear();
  });
  afterAll(async () => {
    try {
      await cleanup();
      const { pool, directPool } = await services();
      await Promise.all([pool.end(), directPool.end()]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  async function row(
    args: {
      queue?: string | null;
      at?: string | null;
      reason?: string | null;
      optedOut?: boolean | null;
      by?: string | null;
      providerStatus?: string | null;
      workspaceId?: string;
      contactWorkspaceId?: string;
      campaignId?: number;
    } = {},
  ) {
    const { pool } = await services();
    const id = args.workspaceId ?? workspace;
    const [contact] =
      await pool`insert into contact (workspace, phone, opt_out) values (${args.contactWorkspaceId ?? id}, '+15555550111', ${args.optedOut === undefined ? false : args.optedOut}) returning id`;
    const [entry] =
      await pool`insert into campaign_queue (workspace, campaign_id, contact_id, queue_state, assigned_to_user_id, dequeued_at, dequeued_by, dequeued_reason, provider_status, claimed_at, queue_order, attempt_count)
      values (${id}, ${args.campaignId ?? campaign}, ${contact.id}, ${args.queue === undefined ? "assigned" : args.queue}, ${actor}, ${args.at ?? null}, ${args.by === undefined ? (args.at || args.reason ? actor : null) : args.by}, ${args.reason ?? null}, ${args.providerStatus ?? null}, ${"2026-10-01T11:00:00.000Z"}, 1, 1) returning id`;
    return Number(entry.id);
  }
  async function read(id: number) {
    const { pool } = await services();
    const [entry] = await pool`select * from campaign_queue where id = ${id}`;
    return entry;
  }
  async function reset() {
    const { requeueAllCampaignQueueForCampaign } = await services();
    return requeueAllCampaignQueueForCampaign(campaign, workspace);
  }
  async function resetRoute(campaignId = campaign) {
    const { action } =
      await import("../../app/routes/api+/queues.action.server");
    const request = new Request("http://localhost/api/queues", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId }),
    });
    return asRouteResponse(
      action({
        request,
        url: new URL(request.url),
        params: {},
        context: new RouterContextProvider(),
      }),
    );
  }
  for (const state of states) {
    test(`preserves ${state.name}`, async () => {
      const id = await row(state);
      const before = await read(id);
      const result = await reset();
      expect(await read(id)).toEqual(before);
      expect(result).toEqual([]);
      expect(events.emit).not.toHaveBeenCalled();
    });
  }
  test("dequeue actor alone remains history", async () => {
    const id = await row({ by: actor });
    const before = await read(id);
    expect(await reset()).toEqual([]);
    expect(await read(id)).toEqual(before);
  });
  test.each(["completed", "in-progress"])(
    "a provider %s row is not re-armed",
    async (providerStatus) => {
      const id = await row({ providerStatus });
      const before = await read(id);
      expect(await reset()).toEqual([]);
      expect(await read(id)).toEqual(before);
    },
  );
  test("a failed state without other markers is not re-armed", async () => {
    const id = await row({ queue: "failed" });
    const before = await read(id);
    expect(await reset()).toEqual([]);
    expect(await read(id)).toEqual(before);
  });
  test("legacy unattempted rows with null state and opt-out return to queued", async () => {
    const id = await row({ queue: null, optedOut: null });
    expect((await reset()).map((x) => Number(x.id))).toEqual([id]);
    expect(await read(id)).toMatchObject({
      queue_state: "queued",
      assigned_to_user_id: null,
    });
  });
  test.each(["queued", "assigned"])(
    "unattempted %s rows return to queued",
    async (queue) => {
      const id = await row({ queue });
      const before = await read(id);
      const result = await reset();
      expect(result.map((x) => Number(x.id))).toEqual([id]);
      expect(await read(id)).toMatchObject({
        queue_state: "queued",
        assigned_to_user_id: null,
        claimed_at: null,
        dequeued_at: null,
        dequeued_reason: null,
        attempt_count: before.attempt_count,
        queue_order: before.queue_order,
      });
      expect(events.emit).toHaveBeenCalledTimes(1);
    },
  );
  test("an opted-out contact without a dequeue marker is not re-armed", async () => {
    const id = await row({ optedOut: true });
    const before = await read(id);
    expect(await reset()).toEqual([]);
    expect(await read(id)).toEqual(before);
    expect(events.emit).not.toHaveBeenCalled();
  });
  test("an opted-out completed contact keeps its history", async () => {
    const id = await row({
      optedOut: true,
      queue: "dequeued",
      at: "2026-10-01T12:00:00.000Z",
      reason: "opt-out",
    });
    const before = await read(id);
    expect(await reset()).toEqual([]);
    expect(await read(id)).toEqual(before);
  });
  test("another campaign in the same workspace is unchanged", async () => {
    const id = await row({ campaignId: otherCampaign });
    const before = await read(id);
    expect(await reset()).toEqual([]);
    expect(await read(id)).toEqual(before);
  });
  test("a foreign workspace row with the same campaign id is unchanged", async () => {
    const id = await row({ workspaceId: foreign });
    const before = await read(id);
    expect(await reset()).toEqual([]);
    expect(await read(id)).toEqual(before);
  });
  test("a dequeue committed while reset waits cannot be overwritten", async () => {
    const id = await row();
    const { pool, directPool } = await services();
    const locker = await directPool.reserve();
    await locker`begin`;
    let committed = false;
    let pending: ReturnType<typeof reset> | undefined;
    try {
      const [backend] = await locker`select pg_backend_pid() as pid`;
      await locker`select id from campaign_queue where id = ${id} for update`;
      pending = reset();
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const [waiting] = await pool`select exists (
          select 1 from pg_stat_activity
          where ${backend.pid} = any(pg_blocking_pids(pid))
            and query ilike '%update "campaign_queue"%'
        ) as blocked`;
        if (waiting.blocked) {
          blocked = true;
          break;
        }
        await delay(10);
      }
      expect(blocked).toBe(true);
      await locker`update campaign_queue set queue_state = 'dequeued',
        dequeued_at = '2026-10-01T12:00:00Z', dequeued_by = ${actor},
        dequeued_reason = 'Concurrent completion' where id = ${id}`;
      await locker`commit`;
      committed = true;
      expect(await pending).toEqual([]);
      expect(await read(id)).toMatchObject({
        queue_state: "dequeued",
        dequeued_by: actor,
        dequeued_reason: "Concurrent completion",
      });
      expect(events.emit).not.toHaveBeenCalled();
    } finally {
      if (!committed) await locker`rollback`;
      locker.release();
      await pending;
    }
  });
  test("an owned queue row referencing a foreign contact is protected", async () => {
    const id = await row({ contactWorkspaceId: foreign });
    const before = await read(id);
    expect(await reset()).toEqual([]);
    expect(await read(id)).toEqual(before);
    expect(events.emit).not.toHaveBeenCalled();
  });
  test("the real DELETE resets only eligible rows and reports its write count", async () => {
    const eligible = [
      await row({ queue: "queued" }),
      await row({ queue: "assigned" }),
    ];
    const protectedIds = [
      await row({
        queue: "dequeued",
        at: "2026-10-01T12:00:00.000Z",
        reason: "completed",
      }),
      await row({ optedOut: true }),
      await row({ providerStatus: "in-progress" }),
      await row({ workspaceId: foreign }),
      await row({ campaignId: otherCampaign }),
      await row({ contactWorkspaceId: foreign }),
    ];
    const originals = await Promise.all(protectedIds.map(read));
    const response = await resetRoute();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ affected_rows: 2 });
    for (const id of eligible) {
      const updated = await read(id);
      expect(updated).toMatchObject({
        queue_state: "queued",
        assigned_to_user_id: null,
        claimed_at: null,
      });
      expect(Number(updated.attempt_count)).toBe(1);
      expect(Number(updated.queue_order)).toBe(1);
    }
    expect(await Promise.all(protectedIds.map(read))).toEqual(originals);
    expect(events.emit).toHaveBeenCalledTimes(2);
    expect(
      events.emit.mock.calls.map((call) => Number(call[2].id)).sort(),
    ).toEqual(eligible.sort());
    for (const call of events.emit.mock.calls) {
      expect(call[0]).toBe(workspace);
      expect(call[1]).toBe("UPDATE");
      expect(call[2]).toMatchObject({
        assigned_to_user_id: null,
        claimed_at: null,
      });
      expect(call[3]).toMatchObject({ assigned_to_user_id: actor });
      expect(call[3].claimed_at).not.toBeNull();
    }
  });
  test("the real DELETE reports zero and emits nothing when history is all that remains", async () => {
    const id = await row(states[0]);
    const before = await read(id);
    const response = await resetRoute();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ affected_rows: 0 });
    expect(await read(id)).toEqual(before);
    expect(events.emit).not.toHaveBeenCalled();
  });
  test("the real DELETE permits an empty queue", async () => {
    const response = await resetRoute();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ affected_rows: 0 });
    expect(events.emit).not.toHaveBeenCalled();
  });
  test("a missing campaign cannot fall back to an owned campaign", async () => {
    const id = await row();
    const before = await read(id);
    const { pool } = await services();
    await pool`delete from campaign where id = ${otherCampaign}`;
    const response = await resetRoute(otherCampaign);
    expect(response.status).toBe(404);
    expect(await read(id)).toEqual(before);
    expect(
      (await services()).requeueAllCampaignQueueForCampaign,
    ).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
  test("a non-member cannot reset a foreign campaign", async () => {
    const id = await row({ workspaceId: foreign, campaignId: foreignCampaign });
    const before = await read(id);
    const response = await resetRoute(foreignCampaign);
    expect(response.status).toBe(404);
    expect(await read(id)).toEqual(before);
    expect(
      (await services()).requeueAllCampaignQueueForCampaign,
    ).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
  test("an unauthenticated DELETE cannot enter the reset writer", async () => {
    const id = await row();
    const before = await read(id);
    session.userId = "";
    const response = await resetRoute();
    expect(response.status).toBe(401);
    expect(await read(id)).toEqual(before);
    expect(
      (await services()).requeueAllCampaignQueueForCampaign,
    ).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
  test("a foreign queue row referencing an owned contact remains outside reset", async () => {
    const id = await row({
      workspaceId: foreign,
      contactWorkspaceId: workspace,
    });
    const before = await read(id);
    expect(await reset()).toEqual([]);
    expect(await read(id)).toEqual(before);
    expect(events.emit).not.toHaveBeenCalled();
  });
  test("a foreign campaign row is unchanged", async () => {
    const id = await row({ workspaceId: foreign, campaignId: foreignCampaign });
    const before = await read(id);
    expect(await reset()).toEqual([]);
    expect(await read(id)).toEqual(before);
  });
});
