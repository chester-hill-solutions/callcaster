import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { RouterContextProvider } from "react-router";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { asRouteResponse } from "../helpers/route-result";

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
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitQueueEvent: events.emit,
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = randomUUID();
const foreign = randomUUID();
const actor = randomUUID();
const otherActor = randomUUID();
let campaign: number;
let otherCampaign: number;
let database: typeof import("@/server/db");
let queueDb: typeof import("@/lib/campaign-queue-db.server");

suite("caller queue release (#2702)", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    vi.stubEnv("BASE_URL", "http://localhost:3038");
    database = await import("@/server/db");
    queueDb = await import("@/lib/campaign-queue-db.server");
    const { pool } = database;
    for (const id of [actor, otherActor]) {
      await pool`insert into "user" (id, username) values (${id}, ${`release-${id}`})`;
    }
    await pool`insert into workspace (id, name) values (${workspace}, 'Release fixture'), (${foreign}, 'Foreign release fixture')`;
    const [own] =
      await pool`insert into campaign (workspace, title, type, dial_type, status)
      values (${workspace}, 'Release fixture', 'live_call', 'call', 'draft') returning id`;
    const [other] =
      await pool`insert into campaign (workspace, title, type, dial_type, status)
      values (${workspace}, 'Other release fixture', 'live_call', 'call', 'draft') returning id`;
    campaign = Number(own.id);
    otherCampaign = Number(other.id);
    await pool`insert into workspace_member (id, workspace_id, user_id, role_id)
      values (${`release:${workspace}:${actor}`}, ${workspace}, ${actor}, 'owner')`;
  });
  beforeEach(async () => {
    const { pool } = database;
    await pool`delete from campaign_queue where workspace in (${workspace}, ${foreign})`;
    await pool`delete from contact where workspace in (${workspace}, ${foreign})`;
    session.userId = actor;
    events.emit.mockReset().mockResolvedValue(undefined);
  });
  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      if (database) {
        const { pool } = database;
        await pool`delete from campaign_queue where workspace in (${workspace}, ${foreign})`;
        await pool`delete from contact where workspace in (${workspace}, ${foreign})`;
        await pool`delete from campaign where workspace in (${workspace}, ${foreign})`;
        await pool`delete from workspace_member where workspace_id in (${workspace}, ${foreign})`;
        await pool`delete from workspace where id in (${workspace}, ${foreign})`;
        await pool`delete from "user" where id in (${actor}, ${otherActor})`;
      }
    } catch (error) {
      errors.push(error);
    }
    try {
      if (database) {
        for (const pool of [database.pool, database.directPool]) {
          try {
            await pool.end();
          } catch (error) {
            errors.push(error);
          }
        }
      }
    } finally {
      vi.unstubAllEnvs();
    }
    if (errors.length)
      throw new AggregateError(errors, "Release fixture cleanup failed");
  });

  async function row(
    args: {
      user?: string;
      state?: string;
      workspaceId?: string;
      contactWorkspaceId?: string;
      campaignId?: number;
      optOut?: boolean;
      at?: string;
      by?: string;
      reason?: string;
      provider?: string;
    } = {},
  ) {
    const { pool } = database;
    const ws = args.workspaceId ?? workspace;
    const [contact] = await pool`insert into contact (workspace, phone, opt_out)
      values (${args.contactWorkspaceId ?? ws}, '+15555550222', ${args.optOut ?? false}) returning id`;
    const [entry] = await pool`insert into campaign_queue
      (workspace, campaign_id, contact_id, queue_state, assigned_to_user_id, claimed_at,
       dequeued_at, dequeued_by, dequeued_reason, provider_status, queue_order, attempt_count)
      values (${ws}, ${args.campaignId ?? campaign}, ${contact.id}, ${args.state ?? "assigned"},
        ${args.user ?? actor}, '2026-10-01T12:00:00Z', ${args.at ?? null}, ${args.by ?? null},
        ${args.reason ?? null}, ${args.provider ?? null}, 5, 2) returning id`;
    return Number(entry.id);
  }
  async function read(id: number) {
    const [entry] =
      await database.pool`select * from campaign_queue where id = ${id}`;
    return entry;
  }
  const release = () =>
    queueDb.releaseAssignedQueueForUser(actor, campaign, workspace);
  async function route() {
    const { action } =
      await import("../../app/routes/api+/campaigns+/$campaignId/call-session/release.action.server");
    const request = new Request(
      `http://localhost/api/campaigns/${campaign}/call-session/release`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: otherActor }),
      },
    );
    return asRouteResponse(
      action({
        request,
        url: new URL(request.url),
        params: { campaignId: String(campaign) },
        context: new RouterContextProvider(),
      }),
    );
  }

  test("real POST releases only the signed-in caller's unused assigned rows and emits only their changes", async () => {
    const own = await row();
    const protectedRows = [
      await row({ user: otherActor }),
      await row({ state: "queued" }),
      await row({ state: "dequeued" }),
      await row({ state: "failed" }),
      await row({ at: "2026-10-01T12:01:00Z" }),
      await row({ by: actor }),
      await row({ reason: "completed" }),
      await row({ provider: "in-progress" }),
      await row({ provider: "completed" }),
      await row({ optOut: true }),
      await row({ campaignId: otherCampaign }),
      await row({ workspaceId: foreign }),
      await row({ contactWorkspaceId: foreign }),
    ];
    const before = await Promise.all(protectedRows.map(read));
    const response = await route();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ released: 1 });
    const released = await read(own);
    expect(released).toMatchObject({
      queue_state: "queued",
      assigned_to_user_id: null,
      claimed_at: null,
    });
    expect(Number(released.queue_order)).toBe(5);
    expect(Number(released.attempt_count)).toBe(2);
    expect(await Promise.all(protectedRows.map(read))).toEqual(before);
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(Number(events.emit.mock.calls[0][2].id)).toBe(own);
    expect(events.emit.mock.calls[0][0]).toBe(workspace);
    expect(await release()).toEqual({ ok: true, released: 0 });
    expect(events.emit).toHaveBeenCalledTimes(1);
  });
  test("an empty queue is a successful no-op", async () => {
    expect(await release()).toEqual({ ok: true, released: 0 });
    expect(events.emit).not.toHaveBeenCalled();
  });
  test("a caller outside the workspace cannot release assignments", async () => {
    const id = await row();
    const before = await read(id);
    session.userId = otherActor;
    const response = await route();
    expect(response.status).toBe(404);
    expect(await read(id)).toEqual(before);
    expect(events.emit).not.toHaveBeenCalled();
  });
  test.each(["dequeue", "reassign", "provider"] as const)(
    "preserves a concurrent %s while release waits for the row lock",
    async (change) => {
      const id = await row();
      const locker = await database.directPool.reserve();
      await locker`begin`;
      let committed = false;
      let pending: ReturnType<typeof release> | undefined;
      try {
        const [backend] = await locker`select pg_backend_pid() as pid`;
        await locker`select id from campaign_queue where id = ${id} for update`;
        pending = release();
        let blocked = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const [waiting] = await database.pool`select exists (
          select 1 from pg_stat_activity where ${backend.pid} = any(pg_blocking_pids(pid))
            and query ilike '%update "campaign_queue"%'
        ) as blocked`;
          if (waiting.blocked) {
            blocked = true;
            break;
          }
          await delay(10);
        }
        expect(blocked).toBe(true);
        if (change === "dequeue")
          await locker`update campaign_queue set queue_state = 'dequeued', dequeued_at = now(), dequeued_by = ${actor}, dequeued_reason = 'Concurrent completion' where id = ${id}`;
        if (change === "reassign")
          await locker`update campaign_queue set assigned_to_user_id = ${otherActor} where id = ${id}`;
        if (change === "provider")
          await locker`update campaign_queue set provider_status = 'in-progress' where id = ${id}`;
        const [expected] =
          await locker`select * from campaign_queue where id = ${id}`;
        await locker`commit`;
        committed = true;
        expect(await pending).toEqual({ ok: true, released: 0 });
        expect(await read(id)).toEqual(expected);
        expect(events.emit).not.toHaveBeenCalled();
      } finally {
        if (!committed) await locker`rollback`;
        locker.release();
        await pending;
      }
    },
  );
});
