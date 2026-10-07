import { randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";

const fixture = vi.hoisted(() => ({
  url: process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL,
  previous: Object.fromEntries(
    ["DATABASE_URL", "DATABASE_DIRECT_URL", "E2E_TEST"].map((key) => [
      key,
      process.env[key],
    ]),
  ),
  actor: "",
  update: vi.fn(),
}));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: vi.fn(async () => ({ user: { id: fixture.actor } })),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: vi.fn(async () => ({
    calls: () => ({ update: fixture.update }),
  })),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitQueueEvent: vi.fn(async () => undefined),
  emitPostgresChangeEvent: vi.fn(async () => undefined),
}));

const suite = fixture.url ? describe : describe.skip;
suite("campaign results units and ended-call retries (#2034)", () => {
  const workspace = randomUUID();
  const actor = randomUUID();
  const parentSid = `CA${randomUUID().replaceAll("-", "")}`;
  const childSid = `CA${randomUUID().replaceAll("-", "")}`;
  let sql: postgres.Sql;
  let pools: typeof import("@/server/db");
  let telephony: typeof import("@/lib/twilio-call-status.server");
  let stats: typeof import("@/lib/database/campaign-stats.server");
  let queue: typeof import("@/lib/campaign-queue-search.server");
  let action: typeof import("@/routes/api+/hangup.action.server").action;
  let campaign: number;
  let contact: number;
  let attempt: number;

  beforeAll(async () => {
    if (!fixture.url) throw new Error("Database URL required");
    process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL = fixture.url;
    process.env.E2E_TEST = "1";
    fixture.actor = actor;
    sql = postgres(fixture.url, { max: 1, onnotice: () => {} });
    await sql`insert into public."user" (id, username) values (${actor}, ${`results-${actor}`})`;
    await sql`insert into public.workspace (id, name) values (${workspace}, 'Results count fixture')`;
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id) values (${randomUUID()}, ${workspace}, ${actor}, 'owner')`;
    const [row] =
      await sql`insert into public.campaign (workspace, title, type, status, dial_ratio, group_household_queue)
      values (${workspace}, 'Results count fixture', 'live_call', 'running', 1, false) returning id`;
    campaign = Number(row.id);
    const [person] =
      await sql`insert into public.contact (workspace, phone) values (${workspace}, '+15551230001') returning id`;
    contact = Number(person.id);
    pools = await import("@/server/db");
    telephony = await import("@/lib/twilio-call-status.server");
    stats = await import("@/lib/database/campaign-stats.server");
    queue = await import("@/lib/campaign-queue-search.server");
    ({ action } = await import("@/routes/api+/hangup.action.server"));
  });

  beforeEach(async () => {
    await sql`delete from public.call where workspace=${workspace}`;
    await sql`delete from public.outreach_attempt where workspace=${workspace}`;
    await sql`delete from public.campaign_queue where workspace=${workspace}`;
    await sql`update public.campaign set status='running' where id=${campaign}`;
    const [row] =
      await sql`insert into public.outreach_attempt (workspace,campaign_id,contact_id,user_id,disposition,created_at,answered_at)
      values (${workspace},${campaign},${contact},${actor},'completed','2026-10-07T12:00:00Z','2026-10-07T12:00:05Z') returning id`;
    attempt = Number(row.id);
    await sql`insert into public.campaign_queue (workspace,campaign_id,contact_id,queue_state,queue_order,assigned_to_user_id)
      values (${workspace},${campaign},${contact},'assigned',1,${actor})`;
    await sql`insert into public.call (sid,workspace,campaign_id,contact_id,outreach_attempt_id,status,duration)
      values (${parentSid},${workspace},${campaign},${contact},${attempt},'completed','20')`;
    fixture.update.mockReset();
    fixture.update.mockRejectedValue(
      Object.assign(new Error("Call already ended"), { code: 21220 }),
    );
  });

  afterAll(async () => {
    try {
      if (sql) {
        await sql`delete from public.call where workspace=${workspace}`;
        await sql`delete from public.outreach_attempt where workspace=${workspace}`;
        await sql`delete from public.workspace where id=${workspace}`;
        await sql`delete from public."user" where id=${actor}`;
      }
    } finally {
      try {
        if (pools)
          await Promise.all([
            pools.pool.end({ timeout: 5 }),
            pools.directPool.end({ timeout: 5 }),
          ]);
      } finally {
        if (sql) await sql.end({ timeout: 5 });
        for (const [key, value] of Object.entries(fixture.previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });

  async function childCall() {
    const result = await telephony.processCallStatusWebhook(
      {
        sid: childSid,
        parent_call_sid: parentSid,
        status: "completed",
        duration: "10",
      },
      { skipBilling: true },
    );
    expect(result.call.outreach_attempt_id).toBe(attempt);
  }
  async function completedCount() {
    const results = await stats.fetchBasicResults({
      workspaceId: workspace,
      campaignId: String(campaign),
    });
    return results.find((row) => row.disposition === "completed");
  }
  async function hangup() {
    return asRouteResponse(
      action(
        routeArgs(
          new Request("http://fixture.test/api/hangup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId: workspace,
              callSid: parentSid,
            }),
          }),
        ),
      ),
    );
  }

  test("a parent and its child call count as one attempt", async () => {
    await childCall();
    const rows =
      await sql`select id from public.outreach_attempt where campaign_id=${campaign}`;
    expect(rows).toHaveLength(1);
    expect(await completedCount()).toMatchObject({
      count: 1,
      average_call_duration: "00:00:15",
      average_wait_time: "00:00:05",
    });
  });

  test("two attempts remain two results even for one contact", async () => {
    await sql`insert into public.outreach_attempt (workspace,campaign_id,contact_id,disposition) values (${workspace},${campaign},${contact},'completed')`;
    expect(await completedCount()).toMatchObject({ count: 2 });
  });

  test("an attempt without a call still counts", async () => {
    await sql`delete from public.call where workspace=${workspace}`;
    expect(await completedCount()).toMatchObject({
      count: 1,
      average_call_duration: "00:00:00",
    });
  });

  test("wait time gives each attempt equal weight regardless of call legs", async () => {
    await childCall();
    await sql`insert into public.outreach_attempt (workspace,campaign_id,contact_id,disposition,created_at,answered_at)
      values (${workspace},${campaign},${contact},'completed','2026-10-07T12:00:00Z','2026-10-07T12:00:15Z')`;
    expect(await completedCount()).toMatchObject({
      count: 2,
      average_wait_time: "00:00:10",
    });
  });

  test("missing dispositions and other campaigns do not enter the total", async () => {
    await sql`insert into public.outreach_attempt (workspace,campaign_id,contact_id,disposition)
      values (${workspace},${campaign},${contact},null), (${workspace},${campaign},${contact},'')`;
    const [other] =
      await sql`insert into public.campaign (workspace,title,type) values (${workspace},'Other results','live_call') returning id`;
    await sql`insert into public.outreach_attempt (workspace,campaign_id,contact_id,disposition)
      values (${workspace},${other.id},${contact},'completed')`;
    expect(await completedCount()).toMatchObject({ count: 1 });
  });

  test("remote hang-up followed by retries completes one contact without adding attempts", async () => {
    await childCall();
    expect(await queue.countDialableCompletedCampaignQueueRows(campaign)).toBe(
      0,
    );
    const first = await hangup();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ success: true });
    const [initial] =
      await sql`select id,queue_state,dequeued_at,dequeued_by from public.campaign_queue where campaign_id=${campaign}`;
    expect(initial.queue_state).toBe("dequeued");
    expect(initial.dequeued_at).not.toBeNull();
    for (let i = 0; i < 3; i++) {
      const response = await hangup();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    }
    expect(
      await sql`select id,queue_state,dequeued_at,dequeued_by from public.campaign_queue where campaign_id=${campaign}`,
    ).toEqual([initial]);
    expect(
      await sql`select id from public.outreach_attempt where campaign_id=${campaign}`,
    ).toHaveLength(1);
    expect(
      await sql`select sid from public.call where campaign_id=${campaign}`,
    ).toHaveLength(2);
    expect(await queue.countDialableCompletedCampaignQueueRows(campaign)).toBe(
      1,
    );
    expect(await completedCount()).toMatchObject({ count: 1 });
  });
});
