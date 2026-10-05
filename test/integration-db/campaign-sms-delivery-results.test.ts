import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { smsSendPolicy } from "@/lib/campaign-dispatch-policy";
import { canTransitionOutreachDisposition } from "@/lib/outreach-disposition";
import { makePortalConfig } from "../fixtures/workspace-twilio-portal-config";

// Keep database, outreach RPC, dequeue, ledger and job queue operations real.
// Stub provider requests and event publication; the window case advances the
// fixture clock only after the real preparation transaction commits.
const provider = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async () => ({
    messages: Object.assign(() => ({ fetch: provider.fetch }), {
      create: provider.create, list: provider.list,
    }),
    calls: { list: async () => [] },
  }),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitQueueEvent: vi.fn(async () => undefined),
  emitPostgresChangeEvent: vi.fn(async () => undefined),
  emitChatMessageEvent: vi.fn(async () => undefined),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const userId = randomUUID();
const sid = `SM${randomUUID().replaceAll("-", "")}`;
const sentAt = new Date(Date.now() - 20 * 60_000);

function acceptedMessage() {
  return {
    sid, status: "sent", to: "+15555550100", from: "+15555550101",
    body: "Delivery fixture", numSegments: "1", numMedia: "0",
    dateCreated: sentAt, dateSent: sentAt,
  };
}

suite("campaign SMS delivery results against Postgres (#2149)", () => {
  beforeAll(() => {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
  });

  let campaignId: number;
  let contactId: number;
  let queueId: number;

  async function services() {
    return {
      ...(await import("@/server/db")),
      ...(await import("@/lib/campaign-sms-send.server")),
      ...(await import("@/lib/message-db.server")),
      ...(await import("@/lib/worker/webhook-side-effects.server")),
      ...(await import("@/lib/twilio-open-sync.server")),
      ...(await import("@/lib/campaign-queue-search.server")),
    };
  }

  async function cleanup() {
    const { pool } = await services();
    await pool`delete from job where workspace_id = ${workspaceId}`;
    await pool`delete from transaction_history where workspace = ${workspaceId}`;
    await pool`delete from message where workspace = ${workspaceId}`;
    await pool`delete from outreach_attempt where workspace = ${workspaceId}`;
    await pool`delete from campaign_queue where workspace = ${workspaceId}`;
    await pool`delete from contact where workspace = ${workspaceId}`;
    await pool`delete from campaign where workspace = ${workspaceId}`;
    await pool`delete from workspace where id = ${workspaceId}`;
    await pool`delete from "user" where id = ${userId}`;
  }

  beforeEach(async () => {
    await cleanup();
    const { pool } = await services();
    await pool`insert into "user" (id, username) values (${userId}, ${`sms-fixture-${userId}`})`;
    await pool`insert into workspace (id, name, credits, twilio_data)
      values (${workspaceId}, 'SMS delivery fixture', 1000, '{}')`;
    const [campaign] = await pool`insert into campaign (workspace, title, type, status, end_date)
      values (${workspaceId}, 'Delivery results', 'message', 'running', ${new Date(Date.now() + 86_400_000).toISOString()}) returning id`;
    campaignId = Number(campaign.id);
    const [contact] = await pool`insert into contact (workspace, phone)
      values (${workspaceId}, '+15555550100') returning id`;
    contactId = Number(contact.id);
    const [queue] = await pool`insert into campaign_queue
      (workspace, campaign_id, contact_id, queue_state, attempts, attempt_count)
      values (${workspaceId}, ${campaignId}, ${contactId}, 'assigned', 0, 0) returning id`;
    queueId = Number(queue.id);
    provider.create.mockReset().mockResolvedValue(acceptedMessage());
    provider.list.mockReset().mockResolvedValue([]);
    provider.fetch.mockReset().mockResolvedValue({ sid, status: "delivered", dateSent: sentAt });
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

  async function send() {
    const { sendSingleCampaignSms } = await services();
    return sendSingleCampaignSms({
      body: "Delivery fixture", to: "+15555550100", from: "+15555550101", media: [],
      campaign_id: String(campaignId), workspace: workspaceId, contact_id: contactId,
      queue_id: queueId, user_id: userId, portalConfig: makePortalConfig(),
      messagingServiceSidFromRequest: null, sendPolicy: smsSendPolicy(null),
    });
  }

  async function matchingQueues(disposition: string) {
    const { db, buildCampaignQueueSearchWhere } = await services();
    const { campaign_queue } = await import("@/db/schema");
    return db.select({ id: campaign_queue.id }).from(campaign_queue).where(
      buildCampaignQueueSearchWhere(campaignId, {
        name: "", phone: "", email: "", address: "", audiences: "",
        disposition, queueStatus: "completed",
      }, "", workspaceId),
    );
  }

  test("provider acceptance leaves an unsettled outreach result", async () => {
    await send();
    const { pool } = await services();
    const [attempt] = await pool`select disposition from outreach_attempt where campaign_id = ${campaignId}`;
    expect(attempt.disposition).toBeNull();
  });

  test("the saved message links to the attempt for this recipient", async () => {
    await send();
    const { pool } = await services();
    const [row] = await pool`select m.outreach_attempt_id, a.id from message m
      join outreach_attempt a on a.campaign_id = m.campaign_id and a.contact_id = m.contact_id
      and a.workspace = m.workspace where m.sid = ${sid}`;
    expect(row.outreach_attempt_id).toBe(row.id);
  });

  test.each(["delivered", "failed", "undelivered"] as const)("%s appears in the actual queue filter", async (status) => {
    await send();
    const { updateMessageBySid, runSmsStatusSideEffects } = await services();
    await updateMessageBySid(workspaceId, sid, { status });
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: status } });
    await updateMessageBySid(workspaceId, sid, { status: "sent" });
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: "sent" } });
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: status } });
    expect(await matchingQueues(status)).toEqual([{ id: queueId }]);
    expect(await matchingQueues("completed")).toEqual([]);
    const { pool } = await services();
    expect(await pool`select id from transaction_history where workspace = ${workspaceId}`).toHaveLength(1);
    expect((await pool`select status from message where sid = ${sid}`)[0].status).toBe(status);
  });

  test("a delivery during provider create uses the precommitted attempt link", async () => {
    const { pool, resolveMessageByClientRef, runSmsStatusSideEffects } = await services();
    provider.create.mockImplementationOnce(async () => {
      const [intent] = await pool`select client_ref, outreach_attempt_id from message where workspace = ${workspaceId}`;
      expect(intent.outreach_attempt_id).not.toBeNull();
      await resolveMessageByClientRef(workspaceId, intent.client_ref, {
        sid, status: "delivered", num_segments: "1", num_media: "0",
      });
      await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: "delivered" } });
      return acceptedMessage();
    });
    await send();
    expect(await matchingQueues("delivered")).toEqual([{ id: queueId }]);
    expect((await pool`select status from message where sid = ${sid}`)[0].status).toBe("delivered");
    expect(await pool`select id from transaction_history where workspace = ${workspaceId}`).toHaveLength(1);
  });

  test.each(["reject", "skip"] as const)("a %s of the link write rolls back preparation before send", async (mode) => {
    const { pool } = await services();
    const body = mode === "reject" ? "RAISE EXCEPTION 'fixture rejected link';" : "RETURN NULL;";
    await pool.unsafe(`CREATE FUNCTION public.cc_2149_reject_link() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN ${body} END $$`);
    await pool.unsafe(`CREATE TRIGGER cc_2149_reject_link BEFORE UPDATE OF outreach_attempt_id ON message
      FOR EACH ROW EXECUTE FUNCTION public.cc_2149_reject_link()`);
    try {
      await expect(send()).rejects.toThrow();
      expect(provider.create).not.toHaveBeenCalled();
      expect(await pool`select id from outreach_attempt where workspace = ${workspaceId}`).toEqual([]);
      expect(await pool`select sid from message where workspace = ${workspaceId}`).toEqual([]);
      const [queue] = await pool`select attempts, attempt_count from campaign_queue where id = ${queueId}`;
      expect(Number(queue.attempts)).toBe(0);
      expect(queue.attempt_count).toBe(0);
    } finally {
      await pool.unsafe("DROP TRIGGER cc_2149_reject_link ON message; DROP FUNCTION public.cc_2149_reject_link()");
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("a window that closes after the real preparation commit leaves no unsent attempt", async () => {
    const tenant = await import("@/server/tenant-db");
    const original = tenant.withAppCurrentUser;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-09T20:59:59.900Z"));
    vi.spyOn(tenant, "withAppCurrentUser").mockImplementationOnce(async (user, run) => {
      const result = await original(user, run);
      vi.setSystemTime(new Date("2026-09-09T21:00:00.100Z"));
      return result;
    });
    const { sendSingleCampaignSms, pool } = await services();
    const result = await sendSingleCampaignSms({
      body: "Delivery fixture", to: "+15555550100", from: "+15555550101", media: [],
      campaign_id: String(campaignId), workspace: workspaceId, contact_id: contactId,
      queue_id: queueId, user_id: userId, portalConfig: makePortalConfig(),
      messagingServiceSidFromRequest: null,
      sendPolicy: smsSendPolicy({
        sms_send_window: { wednesday: { active: true, intervals: [{ start: "09:00", end: "21:00" }] } },
      }),
    });
    expect(result).toMatchObject({ kind: "deferred_send_window" });
    expect(provider.create).not.toHaveBeenCalled();
    expect(await pool`select id from outreach_attempt where workspace = ${workspaceId}`).toEqual([]);
    expect(await pool`select sid from message where workspace = ${workspaceId}`).toEqual([]);
    const [queue] = await pool`select attempts, attempt_count from campaign_queue where id = ${queueId}`;
    expect(Number(queue.attempts)).toBe(0);
    expect(queue.attempt_count).toBe(0);
  });

  test("sent with a saved send time reaches delivery through provider recovery", async () => {
    await send();
    const { pool, triggerTwilioOpenSync, runSmsStatusSideEffects } = await services();
    // Seed the missing legacy link to isolate recovery from the send-link defect.
    await pool`update message set outreach_attempt_id =
      (select id from outreach_attempt where campaign_id = ${campaignId}) where sid = ${sid}`;
    const result = await triggerTwilioOpenSync({ workspaceId });
    if (!result.ok) throw new Error(result.error);
    expect(result).toMatchObject({ ok: true });
    const jobs = await pool`select params from job where workspace_id = ${workspaceId}
      and type = 'sms_status_side_effects'`;
    expect(jobs).toHaveLength(1);
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: jobs[0].params.twilioParams });
    expect(await matchingQueues("delivered")).toEqual([{ id: queueId }]);
  });

  test("a provider that still reports sent does not invent a delivery result", async () => {
    await send();
    provider.fetch.mockResolvedValueOnce(acceptedMessage());
    const { pool, triggerTwilioOpenSync } = await services();
    const result = await triggerTwilioOpenSync({ workspaceId });
    if (!result.ok) throw new Error(result.error);
    expect((await pool`select disposition from outreach_attempt where campaign_id = ${campaignId}`)[0].disposition).toBeNull();
    expect(await pool`select id from job where workspace_id = ${workspaceId} and type = 'sms_status_side_effects'`).toEqual([]);
    expect(await pool`select id from transaction_history where workspace = ${workspaceId}`).toEqual([]);
  });

  test("a foreign workspace's linked attempt cannot be changed", async () => {
    await send();
    const { pool, runSmsStatusSideEffects } = await services();
    const foreignWorkspace = randomUUID();
    await pool`update outreach_attempt set workspace = ${foreignWorkspace} where campaign_id = ${campaignId}`;
    try {
      await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: "delivered" } });
      expect((await pool`select disposition from outreach_attempt where campaign_id = ${campaignId}`)[0].disposition).toBeNull();
    } finally {
      await pool`update outreach_attempt set workspace = ${workspaceId} where campaign_id = ${campaignId}`;
    }
  });

  test("the voice terminal guard retains its prior contract", () => {
    expect(canTransitionOutreachDisposition("completed", "failed")).toBe(false);
    expect(canTransitionOutreachDisposition("completed", "completed")).toBe(true);
    expect(canTransitionOutreachDisposition("ringing", "completed")).toBe(true);
  });
});
