import { randomUUID } from "node:crypto";
import postgres from "postgres";
import twilio from "twilio";
import { RouterContextProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import { withWorkspaceRouteArgs } from "../helpers/route-context-mock";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";

vi.hoisted(() => { process.env.TZ = "UTC"; process.env.BASE_URL = "https://ivr-credit.example.test"; });
const principal = vi.hoisted(() => ({ userId: "", windowAllowed: true }));
type ProviderCall = {
  sid: string; accountSid: string; to: string; from: string; voiceUrl: string; statusCallback: string;
  direction: string; parentCallSid: string | null; status: string; duration: string | null;
  dateCreated: Date; dateUpdated: Date; endTime: Date | null;
};
const provider = vi.hoisted(() => ({
  accountSid: "AC00000000000000000000000000003879", create: vi.fn(), fetch: vi.fn(), list: vi.fn(), events: vi.fn(),
  records: new Map<string, ProviderCall>(),
}));
vi.mock("@/lib/api-auth.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api-auth.server")>(),
  requireJsonAuth: async () => ({ user: { id: principal.userId }, authType: "session" }),
}));
vi.mock("@/lib/recipient-calling-window", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/recipient-calling-window")>(),
  recipientCallingWindowStatus: () => ({ allowed: principal.windowAllowed, timezone: "America/Toronto", reason: "owned_fixture_clock" }),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  createWorkspaceTwilioInstance: async () => ({
    accountSid: provider.accountSid,
    calls: Object.assign((sid: string) => ({ fetch: () => provider.fetch(sid), events: { list: () => provider.events(sid) } }), {
      create: provider.create, list: provider.list,
    }),
  }),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(),
  emitPostgresChangeEvent: vi.fn(), emitQueueEvent: vi.fn(),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID();
const accountSid = provider.accountSid, token = "owned-ivr-credit-token";
const to = "+16135550199", from = "+16135550100";
const faultName = `ivr_credit_fault_${randomUUID().replaceAll("-", "")}`;
let sql: postgres.Sql;
let campaignId: number, contactId: number, queueId: number;
let api: typeof import("../../app/routes/api+/ivr.action.server");
let batch: typeof import("@/lib/campaign-ivr-dispatch.server");
let legacy: typeof import("@/lib/ivr-initiate.server");
let recovery: typeof import("@/lib/voice-credit-recovery.server");
let holds: typeof import("@/server/voice-credit-reservation.server");
const callSid = () => `CA${randomUUID().replaceAll("-", "")}`;
type Mode = "api" | "worker" | "legacy";

describe("IVR dispatch funding and recovery (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned database URL required");
    sql = postgres(url, { max: 3, onnotice: () => {} });
    principal.userId = actor;
    await sql`insert into public."user" (id, username, created_at) values (${actor}::uuid, ${`ivr-credit-${actor}@example.test`}, now())`;
    const twilioData = { sid: accountSid, authToken: token, portalConfig: { parallelDispatchEnabled: true, voiceTargetCps: 50 } };
    await sql`insert into public.workspace (id, name, credits, twilio_data) values
      (${workspaceId}::uuid, 'Owned IVR credit fixture', 100, ${sql.json(twilioData)}),
      (${foreignId}::uuid, 'Foreign IVR control', 100, '{}'::jsonb)`;
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id) values
      (${`ivr-credit:${workspaceId}:${actor}`}, ${workspaceId}, ${actor}, 'owner')`;
    await sql`insert into public.workspace_number (workspace, phone_number, type, capabilities)
      values (${workspaceId}::uuid, ${from}, 'local', '{"voice":true}'::jsonb)`;
    const steps = { pages: { page_1: { blocks: ["hello"] } }, blocks: { hello: { id: "hello", type: "say", audioFile: "Owned IVR greeting" } } };
    const [script] = await sql`insert into public.script (name, workspace, steps) values ('Owned IVR credit script', ${workspaceId}::uuid, ${sql.json(steps)}) returning id`;
    const schedule = Object.fromEntries(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => [day, { active: true, intervals: [{ start: "00:00", end: "23:59" }] }]));
    const [campaign] = await sql`insert into public.campaign (title, workspace, type, caller_id, script_id, status, schedule)
      values ('Owned IVR credit campaign', ${workspaceId}::uuid, 'simple_ivr', ${from}, ${script.id}, 'running', ${sql.json(schedule)}) returning id`;
    campaignId = Number(campaign.id);
    for (const [index, phone] of [to, "+16135550198"].entries()) {
      const [contact] = await sql`insert into public.contact (workspace, firstname, phone) values (${workspaceId}::uuid, ${`Fixture ${index}`}, ${phone}) returning id`;
      const [queue] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, queue_order, attempt_count, attempts)
        values (${workspaceId}::uuid, ${campaignId}, ${contact.id}, 'queued', ${index}, 0, 0) returning id`;
      if (index === 0) { contactId = Number(contact.id); queueId = Number(queue.id); }
    }
    api = await import("../../app/routes/api+/ivr.action.server");
    batch = await import("@/lib/campaign-ivr-dispatch.server");
    legacy = await import("@/lib/ivr-initiate.server");
    recovery = await import("@/lib/voice-credit-recovery.server");
    holds = await import("@/server/voice-credit-reservation.server");
  });
  async function clearFault() {
    await sql.unsafe(`drop trigger if exists ${faultName} on public.call`);
    await sql.unsafe(`drop trigger if exists ${faultName} on public.workspace_voice_reservation`);
    await sql.unsafe(`drop function if exists public.${faultName}()`);
  }
  function requiredCall(sid: string) {
    const row = provider.records.get(sid);
    if (!row) throw new Error("Provider fixture call required");
    return row;
  }
  beforeEach(async () => {
    const { resetRateLimitsForTests } = await import("@/lib/platform-rate-limit.server");
    resetRateLimitsForTests();
    vi.clearAllMocks(); principal.windowAllowed = true; provider.accountSid = accountSid; provider.records.clear();
    provider.create.mockReset().mockImplementation(async (args: { to: string; from: string; url: string; statusCallback: string }) => {
      const row: ProviderCall = {
        sid: callSid(), accountSid, to: args.to, from: args.from, voiceUrl: args.url, statusCallback: args.statusCallback,
        direction: "outbound-api", parentCallSid: null, status: "queued", duration: null,
        dateCreated: new Date(), dateUpdated: new Date(), endTime: null,
      };
      provider.records.set(row.sid, row); return row;
    });
    provider.fetch.mockReset().mockImplementation(async (sid: string) => requiredCall(sid));
    provider.list.mockReset().mockImplementation(async () => [...provider.records.values()]);
    provider.events.mockReset().mockImplementation(async (sid: string) => [{ request: { method: "POST", url: requiredCall(sid).voiceUrl, parameters: { call_sid: sid } } }]);
    await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    await sql`update public.campaign_queue set queue_state = 'queued', dequeued_at = null, dequeued_by = null, dequeued_reason = null,
      assigned_to_user_id = null, claimed_at = null, attempt_count = 0, attempts = 0, last_attempt_error = null,
      dispatch_generation = gen_random_uuid(), redial_requested_at = null where workspace = ${workspaceId}::uuid`;
    await sql`update public.campaign_queue set queue_state = 'dequeued', dequeued_at = now()
      where workspace = ${workspaceId}::uuid and id <> ${queueId}`;
    await sql`update public.contact set phone = case when id = ${contactId} then ${to} else '+16135550198' end where workspace = ${workspaceId}::uuid`;
    await sql`update public.workspace set credits = 100 where id = ${workspaceId}::uuid`;
    await sql`update public.campaign set status = 'running' where id = ${campaignId}`;
  });
  afterEach(async () => {
    await clearFault();
    const [foreign] = await sql`select credits from public.workspace where id = ${foreignId}::uuid`;
    expect(foreign.credits).toBe(100);
  });
  afterAll(async () => {
    try {
      if (sql) {
        await clearFault();
        for (const table of ["transaction_history", "call", "workspace_voice_reservation", "campaign_queue", "outreach_attempt", "contact", "workspace_number", "campaign", "script"])
          await sql.unsafe(`delete from public.${table} where workspace = $1::uuid`, [workspaceId]);
        await sql`delete from public.workspace_member where workspace_id = ${workspaceId}`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public."user" where id = ${actor}::uuid`;
      }
    } finally {
      await sql?.end();
      if (api) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  async function send(mode: Mode, targetWorkspace = workspaceId) {
    if (mode === "worker") return batch.dispatchCampaignIvrBatch({ workspaceId: targetWorkspace, campaignId: String(campaignId), userId: actor, maxContacts: 1 });
    if (mode === "legacy") return legacy.initiateIvrCall({ user: { id: actor }, workspace_id: targetWorkspace, campaign_id: campaignId,
      user_id: actor, contact: { id: queueId, contact_id: contactId, phone: to, caller_id: from } });
    const request = new Request("https://ivr-credit.example.test/api/ivr", { method: "POST", body: new URLSearchParams({
      workspace_id: targetWorkspace, campaign_id: String(campaignId), contact_id: String(contactId),
      queue_id: String(queueId), user_id: actor, to_number: to, caller_id: from,
    }) });
    const response = await asRouteResponse(api.action({ ...routeArgs(request), context: new RouterContextProvider() }));
    return { status: response.status, body: await response.json() };
  }
  async function state() {
    const [row] = await sql`select credits,
      (select count(*)::int from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid and state in ('reserved','creating','active')) as holds,
      (select count(*)::int from public.outreach_attempt where workspace = ${workspaceId}::uuid) as attempts,
      (select count(*)::int from public.call where workspace = ${workspaceId}::uuid) as calls,
      (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger
      from public.workspace where id = ${workspaceId}::uuid`;
    return row;
  }
  async function ageForRecovery() {
    await sql`update public.workspace_voice_reservation set created_at = now() - interval '21 minutes',
      send_started_at = now() - interval '21 minutes', lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    for (const row of provider.records.values()) {
      row.dateCreated = new Date(Date.now() - 21 * 60_000); row.endTime = new Date(Date.now() - 20 * 60_000);
      row.status = "completed"; row.duration = "42";
    }
  }
  async function readdContact(targetContactId = contactId) {
    const { enqueueContactsForCampaign } = await import("@/lib/queue.server");
    await enqueueContactsForCampaign(campaignId, [targetContactId], { requeue: true });
    await sql`update public.campaign set status = 'running' where id = ${campaignId}`;
  }
  async function requeueFromQueuePage() {
    const { action } = await import("../../app/routes/workspaces+/$id/campaigns/$selected_id/queue.action.server");
    const request = new Request(`https://ivr-credit.example.test/workspaces/${workspaceId}/campaigns/${campaignId}/queue`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "update_status", ids: [String(queueId)], status: "queued" }),
    });
    const response = await asRouteResponse(action(await withWorkspaceRouteArgs({
      request, params: { id: workspaceId, selected_id: String(campaignId) },
    }, { workspaceId, userId: actor, userRole: "owner" })));
    expect(response.status).toBe(200); await expect(response.json()).resolves.toEqual({ success: true });
    await sql`update public.campaign set status = 'running' where id = ${campaignId}`;
  }
  async function resetFromCampaignSettings() {
    const { action } = await import("../../app/routes/api+/reset_campaign.action.server");
    const request = new Request("https://ivr-credit.example.test/api/reset_campaign", {
      method: "POST", body: new URLSearchParams({ campaign_id: String(campaignId) }),
    });
    const response = await asRouteResponse(action({ ...routeArgs(request), context: new RouterContextProvider() }));
    expect(response.status).toBe(200); await expect(response.json()).resolves.toEqual({ success: true });
  }
  function firstProviderCall() {
    const [row] = [...provider.records.values()];
    if (!row) throw new Error("Owned provider call required");
    return row;
  }
  async function completeCall(row: ProviderCall) {
    const { processCallStatusWebhook } = await import("@/lib/twilio-call-status.server");
    row.status = "completed"; row.duration = "42"; row.endTime = new Date();
    await processCallStatusWebhook({ sid: row.sid, account_sid: row.accountSid, to: row.to, from: row.from,
      direction: row.direction, status: "completed", duration: "42" }, { workspaceId, campaignId, contactId, userId: actor });
  }
  test.each(["api", "worker", "legacy"] as const)("%s gives a re-added completed contact a new funded call", async (mode) => {
    await send(mode);
    const first = firstProviderCall();
    await completeCall(first); await completeCall(first);
    await send(mode);
    expect(provider.create).toHaveBeenCalledOnce();
    await readdContact(); await send(mode);
    expect(provider.create).toHaveBeenCalledTimes(2);
    const second = [...provider.records.values()].find((row) => row.sid !== first.sid);
    if (!second) throw new Error("Second funded call required");
    await send(mode);
    expect(provider.create).toHaveBeenCalledTimes(2);
    await completeCall(first);
    expect(await state()).toEqual({ credits: 98, holds: 1, attempts: 2, calls: 2, ledger: 1 });
    await completeCall(second); await completeCall(second);
    expect(await state()).toEqual({ credits: 96, holds: 0, attempts: 2, calls: 2, ledger: 2 });
  });
  test.each(["api", "worker", "legacy"] as const)("%s honors a new attempt requested through the real queue page", async (mode) => {
    await send(mode); await completeCall(firstProviderCall());
    await requeueFromQueuePage(); await send(mode); await send(mode);
    expect(provider.create).toHaveBeenCalledTimes(2);
    expect(await state()).toEqual({ credits: 98, holds: 1, attempts: 2, calls: 2, ledger: 1 });
  });
  test("a late worker reply cannot drain an attempt requeued through the real queue page", async () => {
    const create = provider.create.getMockImplementation();
    if (!create) throw new Error("Owned create implementation required");
    provider.create.mockImplementationOnce(async (args) => { const row = await create(args); await requeueFromQueuePage(); return row; });
    expect(await send("worker")).toMatchObject({ counts: { called: 1, deferred: 1 }, queuedRemaining: 1 });
    const [queue] = await sql`select queue_state, dequeued_at from public.campaign_queue where id = ${queueId}`;
    expect(queue).toEqual({ queue_state: "queued", dequeued_at: null });
  });
  test.each(["api", "worker", "legacy"] as const)("%s can start a new attempt after the real campaign reset", async (mode) => {
    await send(mode); const first = firstProviderCall(); await completeCall(first);
    await resetFromCampaignSettings();
    const [campaign] = await sql`select status from public.campaign where id = ${campaignId}`;
    expect(campaign.status).toBe("paused");
    expect(await state()).toEqual({ credits: 98, holds: 0, attempts: 1, calls: 1, ledger: 1 });
    await sql`update public.campaign set status = 'running' where id = ${campaignId}`;
    await send(mode); expect(provider.create).toHaveBeenCalledTimes(2);
    await completeCall(first);
    expect(await state()).toEqual({ credits: 98, holds: 1, attempts: 2, calls: 2, ledger: 1 });
  });
  test("campaign reset retains an in-flight call's outreach for its late provider reply", async () => {
    const create = provider.create.getMockImplementation();
    if (!create) throw new Error("Owned create implementation required");
    provider.create.mockImplementationOnce(async (args) => { const row = await create(args); await resetFromCampaignSettings(); return row; });
    const outcome = await send("worker");
    expect(outcome).toMatchObject({ kind: "dispatched", counts: { called: 1, deferred: 1 } });
    if (!("queuedRemaining" in outcome)) throw new Error("Dispatch outcome required");
    expect(outcome.queuedRemaining).toBeGreaterThan(0);
    const [queue] = await sql`select queue_state, dequeued_at from public.campaign_queue where id = ${queueId}`;
    expect(queue).toEqual({ queue_state: "queued", dequeued_at: null });
    expect(await state()).toEqual({ credits: 100, holds: 1, attempts: 1, calls: 1, ledger: 0 });
    await completeCall(firstProviderCall());
    expect(await state()).toEqual({ credits: 98, holds: 0, attempts: 1, calls: 1, ledger: 1 });
  });
  test("campaign reset leaves a foreign workspace queue row unchanged", async () => {
    const [contact] = await sql`insert into public.contact (workspace, phone) values (${foreignId}::uuid, '+16135550197') returning id`;
    const [queue] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, attempts, attempt_count, dequeued_at)
      values (${foreignId}::uuid, ${campaignId}, ${contact.id}, 'dequeued', 2, 1, now()) returning *`;
    try {
      await resetFromCampaignSettings();
      const [after] = await sql`select * from public.campaign_queue where id = ${queue.id}`;
      expect(after).toEqual(queue);
    } finally {
      await sql`delete from public.campaign_queue where id = ${queue.id}`;
      await sql`delete from public.contact where id = ${contact.id}`;
    }
  });
  test.each(["api", "worker", "legacy"] as const)("%s keeps a new queue attempt pending while its prior call is active", async (mode) => {
    await send(mode);
    const first = firstProviderCall();
    await readdContact(); await send(mode);
    expect(provider.create).toHaveBeenCalledOnce();
    const [queue] = await sql`select queue_state, dequeued_at, attempts::int as attempts from public.campaign_queue where id = ${queueId}`;
    expect(queue).toEqual({ queue_state: "queued", dequeued_at: null, attempts: 0 });
    expect(await state()).toMatchObject({ credits: 100, holds: 1, attempts: 1, calls: 1 });
    await completeCall(first);
    await sql`update public.campaign set status = 'running' where id = ${campaignId}`;
    await send(mode);
    expect(provider.create).toHaveBeenCalledTimes(2);
  });
  test.each(["api", "worker", "legacy"] as const)("%s cannot dequeue a fresh attempt when an older provider reply arrives", async (mode) => {
    const create = provider.create.getMockImplementation();
    if (!create) throw new Error("Owned create implementation required");
    provider.create.mockImplementationOnce(async (args) => {
      const row = await create(args);
      await readdContact();
      return row;
    });
    const outcome = await send(mode);
    if (mode === "worker") expect(outcome).toMatchObject({ counts: { called: 1, deferred: 1 }, queuedRemaining: 1 });
    expect(provider.create).toHaveBeenCalledOnce();
    const [queue] = await sql`select queue_state, dequeued_at, attempts::int as attempts from public.campaign_queue where id = ${queueId}`;
    expect(queue).toEqual({ queue_state: "queued", dequeued_at: null, attempts: 0 });
    await completeCall(firstProviderCall()); await send(mode);
    expect(provider.create).toHaveBeenCalledTimes(2);
  });
  test("a rejected older dispatch cannot add a failure to a fresh queue intent", async () => {
    provider.create.mockImplementationOnce(async () => {
      await readdContact();
      throw Object.assign(new Error("Owned provider rejection"), { status: 400 });
    });
    expect(await send("worker")).toMatchObject({ counts: { failed: 1 }, queuedRemaining: 1 });
    const [queue] = await sql`select queue_state, attempt_count, attempts::int as attempts, last_attempt_error from public.campaign_queue where id = ${queueId}`;
    expect(queue).toEqual({ queue_state: "queued", attempt_count: 0, attempts: 0, last_attempt_error: null });
    expect(await state()).toMatchObject({ holds: 0, calls: 0 });
    await send("worker"); expect(provider.create).toHaveBeenCalledTimes(2);
  });
  test.each(["dequeued", "failed", "queued-with-dequeued-time"])("re-adding a %s row changes its intent without changing the row ID", async (state) => {
    const [before] = await sql`select dispatch_generation from public.campaign_queue where id = ${queueId}`;
    await sql`update public.campaign_queue set queue_state = ${state === "queued-with-dequeued-time" ? "queued" : state}, dequeued_at = now() where id = ${queueId}`;
    const { enqueueContactsForCampaign } = await import("@/lib/queue.server");
    await enqueueContactsForCampaign(campaignId, [contactId], { requeue: false });
    const [after] = await sql`select id, dispatch_generation, redial_requested_at, queue_state, dequeued_at from public.campaign_queue where id = ${queueId}`;
    expect(Number(after.id)).toBe(queueId); expect(after.dispatch_generation).not.toBe(before.dispatch_generation);
    expect(after.redial_requested_at).not.toBeNull(); expect(after.queue_state).toBe("queued"); expect(after.dequeued_at).toBeNull();
  });
  test("ordinary enqueues, outreach counters and assignment releases retain their intent", async () => {
    const [before] = await sql`select dispatch_generation from public.campaign_queue where id = ${queueId}`;
    const { enqueueContactsForCampaign } = await import("@/lib/queue.server");
    const { rpcCreateOutreachAttempt } = await import("@/lib/db-rpc.server");
    const { createTenantDb } = await import("@/server/tenant-db");
    const { releaseAssignedQueueForUser } = await import("@/lib/campaign-queue-db.server");
    const { requeueCampaignQueueById, requeueAllCampaignQueueForCampaign } = await import("@/lib/campaign-queue-updates.server");
    await enqueueContactsForCampaign(campaignId, [contactId], { requeue: false });
    await rpcCreateOutreachAttempt(createTenantDb(workspaceId), { workspaceId, campaignId, contactId, userId: actor, queueId });
    await sql`update public.campaign_queue set queue_state = 'assigned', assigned_to_user_id = ${actor}::uuid, claimed_at = now() where id = ${queueId}`;
    expect(await releaseAssignedQueueForUser(actor, campaignId, workspaceId)).toEqual({ ok: true, released: 1 });
    await requeueCampaignQueueById(queueId, workspaceId);
    await requeueAllCampaignQueueForCampaign(campaignId, workspaceId);
    const [after] = await sql`select dispatch_generation, redial_requested_at, attempts::int as attempts from public.campaign_queue where id = ${queueId}`;
    expect(after).toEqual({ dispatch_generation: before.dispatch_generation, redial_requested_at: null, attempts: 1 });
  });
  test("the stale-claim sweep retains the current queue intent", async () => {
    const [before] = await sql`select dispatch_generation from public.campaign_queue where id = ${queueId}`;
    await sql`update public.campaign_queue set queue_state = 'assigned', assigned_to_user_id = ${actor}::uuid, claimed_at = now() - interval '2 minutes' where id = ${queueId}`;
    const [result] = await sql`select reset_stale_campaign_queue_claims(${campaignId}::integer, interval '1 second') as reset`;
    expect(Number(result.reset)).toBe(1);
    const [after] = await sql`select dispatch_generation, redial_requested_at, queue_state from public.campaign_queue where id = ${queueId}`;
    expect(after).toEqual({ dispatch_generation: before.dispatch_generation, redial_requested_at: null, queue_state: "queued" });
  });
  test.each(["workspace", "campaign", "contact"] as const)("funding rejects a queue with a different %s", async (mismatch) => {
    const result = await holds.reserveVoiceCredits({ workspaceId: mismatch === "workspace" ? foreignId : workspaceId,
      kind: "ivr", accountSid, to, from, campaignId: mismatch === "campaign" ? campaignId + 100000 : campaignId,
      contactId: mismatch === "contact" ? contactId + 100000 : contactId, queueId, operationKey: `ivr-queue:${queueId}` });
    expect(result).toEqual({ ok: false, reason: "queue_not_found" });
    expect(await state()).toEqual({ credits: 100, holds: 0, attempts: 0, calls: 0, ledger: 0 });
    expect(provider.create).not.toHaveBeenCalled();
  });
  test("an unqueued contact with no prior operation cannot start a new call", async () => {
    await sql`update public.campaign_queue set queue_state = 'dequeued', dequeued_at = now() where id = ${queueId}`;
    expect(await send("api")).toEqual({ status: 409, body: { error: "This contact is no longer queued." } });
    expect(await state()).toEqual({ credits: 100, holds: 0, attempts: 0, calls: 0, ledger: 0 });
    expect(provider.create).not.toHaveBeenCalled();
  });
  test("a missing funded generation cannot dequeue or exhaust a queue row", async () => {
    const { dequeueQueueEntry, recordQueueAttemptFailure } = await import("@/lib/campaign-queue-db.server");
    expect(await dequeueQueueEntry({ by: { id: queueId }, workspaceId, userId: actor, reason: "Owned missing-generation control", expectedGeneration: null })).toEqual({ dequeuedPrimary: false });
    await recordQueueAttemptFailure({ queueId, workspaceId, error: "Owned stale failure", expectedGeneration: null });
    const [queue] = await sql`select queue_state, attempt_count, last_attempt_error from public.campaign_queue where id = ${queueId}`;
    expect(queue).toEqual({ queue_state: "queued", attempt_count: 0, last_attempt_error: null });
  });
  test("admission permits foreign-key call persistence while it blocks a queue generation change", async () => {
    const { dispatchReservedVoiceCall } = await import("@/lib/voice-credit-dispatch.server");
    const { rpcCreateOutreachAttempt } = await import("@/lib/db-rpc.server");
    const { createTenantDb } = await import("@/server/tenant-db");
    const result = await dispatchReservedVoiceCall({ workspaceId, kind: "ivr", accountSid, to, from, campaignId, contactId, queueId,
      operationKey: `ivr-queue:${queueId}`, voiceUrl: "https://ivr-credit.example.test/api/ivr/fixture", statusCallback: "https://ivr-credit.example.test/api/ivr/status",
      prepareOutreach: async (tx) => {
        expect(provider.create).not.toHaveBeenCalled();
        await sql.begin(async (other) => {
          await other`set local lock_timeout = '100ms'`;
          await other`insert into public.call (sid, workspace, queue_id, campaign_id, contact_id, status) values
            (${callSid()}, ${workspaceId}::uuid, ${queueId}, ${campaignId}, ${contactId}, 'initiated')`;
        });
        await expect(sql.begin(async (other) => {
          await other`set local lock_timeout = '100ms'`;
          await other`select handle_campaign_queue_entry(${contactId}::bigint, ${campaignId}::bigint, 999::bigint, true)`;
        })).rejects.toMatchObject({ code: "55P03" });
        return rpcCreateOutreachAttempt(createTenantDb(workspaceId, tx), { workspaceId, campaignId, contactId, queueId, userId: actor });
      }, create: provider.create,
    });
    expect(result).toMatchObject({ ok: true, replayed: false });
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toEqual({ credits: 100, holds: 1, attempts: 1, calls: 2, ledger: 0 });
  });
  test("a new explicit IVR attempt still suppresses another initial row at the same phone", async () => {
    await send("worker"); await completeCall(firstProviderCall());
    await readdContact(); await send("worker");
    const [other] = await sql`select id, contact_id from public.campaign_queue where workspace = ${workspaceId}::uuid and id <> ${queueId}`;
    await sql`update public.contact set phone = ${to} where id = ${other.contact_id}`;
    await sql`update public.campaign_queue set queue_state = 'queued', dequeued_at = null where id = ${other.id}`;
    await sql`update public.campaign set status = 'running' where id = ${campaignId}`;
    await send("worker");
    expect(provider.create).toHaveBeenCalledTimes(2);
    expect(await state()).toEqual({ credits: 98, holds: 1, attempts: 2, calls: 2, ledger: 1 });
  });
  test("an explicitly re-added duplicate row can call after its prior campaign call ends", async () => {
    await send("worker");
    const first = firstProviderCall();
    const [other] = await sql`select id, contact_id from public.campaign_queue where workspace = ${workspaceId}::uuid and id <> ${queueId}`;
    await sql`update public.contact set phone = ${to} where id = ${other.contact_id}`;
    await sql`update public.campaign_queue set queue_state = 'queued', dequeued_at = null where id = ${other.id}`;
    await send("worker");
    expect(provider.create).toHaveBeenCalledOnce();
    await completeCall(first); await readdContact(Number(other.contact_id)); await send("worker");
    expect(provider.create).toHaveBeenCalledTimes(2);
    const [row] = await sql`select contact_id from public.call where workspace = ${workspaceId}::uuid and sid <> ${first.sid}`;
    expect(Number(row.contact_id)).toBe(Number(other.contact_id));
  });
  test("a late call row does not round an earlier admission into the new redial window", async () => {
    await send("worker"); const first = firstProviderCall(); await completeCall(first); await readdContact();
    await sql`update public.workspace_voice_reservation r set created_at = q.redial_requested_at - interval '1 microsecond'
      from public.campaign_queue q where r.provider_sid = ${first.sid} and q.id = ${queueId}`;
    await sql`update public.call c set date_created = q.redial_requested_at + interval '1 second'
      from public.campaign_queue q where c.sid = ${first.sid} and q.id = ${queueId}`;
    await send("worker"); expect(provider.create).toHaveBeenCalledTimes(2);
  });
  test.each(["api", "worker", "legacy"] as const)("%s refuses one credit before outreach or provider work", async (mode) => {
    await sql`update public.workspace set credits = 1 where id = ${workspaceId}::uuid`;
    const result = await send(mode);
    if (mode === "api") expect(result).toMatchObject({ status: 402, body: { error: "Insufficient credits", creditsError: true } });
    if (mode === "worker") expect(result).toMatchObject({ blocked: "insufficient_credits", counts: { called: 0, failed: 0, deferred: 1 } });
    if (mode === "legacy") expect(result).toEqual({ success: false, creditsError: true });
    expect(provider.create).not.toHaveBeenCalled();
    expect(await state()).toEqual({ credits: 1, holds: 0, attempts: 0, calls: 0, ledger: 0 });
  });
  test.each(["api", "worker", "legacy"] as const)("%s funds and attributes one call before dequeuing", async (mode) => {
    await sql`update public.workspace set credits = 2 where id = ${workspaceId}::uuid`;
    await send(mode);
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toEqual({ credits: 2, holds: 1, attempts: 1, calls: 1, ledger: 0 });
    const [row] = await sql`select c.queue_id, c.outreach_attempt_id, r.operation_key, r.voice_url, r.status_callback, q.dispatch_generation,
      q.queue_state, q.attempts::int as attempts from public.call c join public.workspace_voice_reservation r on r.provider_sid = c.sid
      join public.campaign_queue q on q.id = c.queue_id where c.workspace = ${workspaceId}::uuid`;
    expect(Number(row.queue_id)).toBe(queueId); expect(Number(row.outreach_attempt_id)).toBeGreaterThan(0);
    expect(row.operation_key).toBe(`ivr-queue:${queueId}:${row.dispatch_generation}`); expect(row.queue_state).toBe("dequeued"); expect(row.attempts).toBe(1);
    const request = provider.create.mock.calls[0][0];
    expect(request.url).toBe(row.voice_url); expect(request.statusCallback).toBe(row.status_callback);
    expect(new URL(request.url).searchParams.get("credit_reservation")).toBe(new URL(request.statusCallback).searchParams.get("credit_reservation"));
  });
  test.each(["api", "legacy"] as const)("fifty concurrent %s retries create one funded operation and one outreach attempt", async (mode) => {
    await Promise.all(Array.from({ length: 50 }, () => send(mode)));
    expect(provider.create).toHaveBeenCalledOnce();
    const snapshot = await state();
    expect(snapshot, JSON.stringify(snapshot)).toEqual({ credits: 100, holds: 1, attempts: 1, calls: 1, ledger: 0 });
    const [queue] = await sql`select attempts::int as attempts from public.campaign_queue where id = ${queueId}`;
    expect(queue.attempts).toBe(1);
  });
  test("two worker batches with two credits share one funded call", async () => {
    await sql`update public.workspace set credits = 2 where id = ${workspaceId}::uuid`;
    await Promise.all([send("worker"), send("worker")]);
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toMatchObject({ credits: 2, holds: 1, attempts: 1, calls: 1 });
  });
  test("a worker batch stops at its funded first minute and leaves the rest queued", async () => {
    await sql`update public.workspace set credits = 2 where id = ${workspaceId}::uuid`;
    await sql`update public.campaign_queue set queue_state = 'queued', dequeued_at = null where workspace = ${workspaceId}::uuid`;
    const result = await batch.dispatchCampaignIvrBatch({ workspaceId, campaignId: String(campaignId), userId: actor, maxContacts: 2 });
    expect(result).toMatchObject({ kind: "dispatched", blocked: "insufficient_credits", counts: { called: 1, deferred: 1, failed: 0 }, queuedRemaining: 1 });
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toMatchObject({ holds: 1, attempts: 1, calls: 1 });
  });
  test.each(["api", "worker", "legacy"] as const)("uncertain %s creation retains its operation and cannot burn the audience on retry", async (mode) => {
    provider.create.mockRejectedValue(Object.assign(new Error("Owned provider timeout"), { status: 500 }));
    await send(mode); await send(mode);
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toEqual({ credits: 100, holds: 1, attempts: 1, calls: 0, ledger: 0 });
    const [queue] = await sql`select queue_state, attempts::int as attempts, attempt_count::int as attempt_count from public.campaign_queue where id = ${queueId}`;
    expect(queue).toEqual({ queue_state: "queued", attempts: 1, attempt_count: 0 });
    if (mode === "worker") expect(await send(mode)).toMatchObject({ blocked: "provider_recovery", counts: { called: 0, failed: 0, deferred: 1 } });
  });
  test("the real campaign worker pauses an uncertain operation and stops its chain", async () => {
    provider.create.mockRejectedValue(new Error("Owned uncertain provider result"));
    const { campaignDispatchHandler } = await import("@/lib/worker/handlers/campaign.server");
    const job: ClaimedJobRow = { id: 2879, type: "campaign_dispatch", params: { campaignId }, workspace_id: workspaceId, user_id: actor, attempt_count: 1, max_attempts: 3 };
    expect(await campaignDispatchHandler(job, { campaignId })).toMatchObject({ blocked: "provider_recovery", called: 0, deferred: 1 });
    const [campaign] = await sql`select status from public.campaign where id = ${campaignId}`;
    expect(campaign.status).toBe("paused");
    await campaignDispatchHandler(job, { campaignId }); expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toMatchObject({ holds: 1, attempts: 1, calls: 0, ledger: 0 });
  });
  test("a failed preflight releases a committed checkpoint without a provider call", async () => {
    const { dispatchReservedVoiceCall } = await import("@/lib/voice-credit-dispatch.server");
    await expect(dispatchReservedVoiceCall({ workspaceId, kind: "ivr", accountSid, to, from,
      voiceUrl: "https://ivr-credit.example.test/api/ivr/fixture", statusCallback: "https://ivr-credit.example.test/api/ivr/status",
      beforeCreate: () => { throw new Error("Owned calling window closed"); }, create: provider.create,
    })).rejects.toThrow("calling window closed");
    expect(provider.create).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ credits: 100, holds: 0, ledger: 0 });
  });
  test.each(["api", "worker"] as const)("%s preserves the recipient-window refusal before a hold", async (mode) => {
    principal.windowAllowed = false; await send(mode);
    expect(provider.create).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ holds: 0, attempts: 0, calls: 0 });
  });
  test("a non-member retains the uniform 404 before reservation or dispatch", async () => {
    expect(await send("api", foreignId)).toMatchObject({ status: 404 });
    expect(provider.create).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ holds: 0, attempts: 0 });
  });
  test("the saved campaign type keeps its staffed first-minute price through the IVR API", async () => {
    await sql`update public.campaign set type = 'live_call' where id = ${campaignId}`;
    try {
      await sql`update public.workspace set credits = 2 where id = ${workspaceId}::uuid`;
      expect(await send("api")).toMatchObject({ status: 402 }); expect(provider.create).not.toHaveBeenCalled();
      await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
      expect(await send("api")).toMatchObject({ status: 200 });
      const [reservation] = await sql`select kind, credits from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
      expect(reservation).toEqual({ kind: "staffed", credits: 4 });
    } finally { await sql`update public.campaign set type = 'simple_ivr' where id = ${campaignId}`; }
  });
  test("the initial signed TwiML fetch can render before create returns", async () => {
    const { action } = await import("../../app/routes/api+/ivr/$campaignId.action.server");
    const create = provider.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    provider.create.mockImplementation(async (args) => {
      const created = await create(args);
      const params = { AccountSid: accountSid, CallSid: created.sid, To: to, From: from, Direction: "outbound-api", CallStatus: "in-progress" };
      const request = new Request(args.url, { method: "POST", headers: {
        "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": twilio.getExpectedTwilioSignature(token, args.url, params),
      }, body: new URLSearchParams(params) });
      const response = await asRouteResponse(action({ ...routeArgs(request, { campaignId: String(campaignId) }), context: new RouterContextProvider() }));
      expect(response.status).toBe(200); expect(await response.text()).toContain("Owned IVR greeting");
      return created;
    });
    expect(await send("api")).toMatchObject({ status: 200 });
    expect(await state()).toMatchObject({ holds: 1, attempts: 1, calls: 1 });
  });
  test.each(["duration", "call_duration"])("recovery settles a terminal local row with %s even when open-sync would skip it", async (field) => {
    await send("api");
    await sql`update public.call set status = 'completed', duration = ${field === "duration" ? "42" : null},
      call_duration = ${field === "call_duration" ? 42 : null} where workspace = ${workspaceId}::uuid`;
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    expect(await recovery.runVoiceCreditRecovery()).toEqual({ examined: 1, settled: 1, released: 0, pending: 0 });
    expect(provider.fetch).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ credits: 98, holds: 0, ledger: 1 });
    const [record] = [...provider.records.values()]; if (!record) throw new Error("Provider fixture required");
    expect(await send("api")).toMatchObject({ status: 200, body: { success: true, callSid: record.sid } });
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toMatchObject({ attempts: 1, calls: 1, ledger: 1 });
  });
  test("known SID recovery reads the original account and bills actual duration", async () => {
    await send("api"); await ageForRecovery();
    expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 1, pending: 0 });
    expect(provider.fetch).toHaveBeenCalledOnce(); expect(await state()).toMatchObject({ credits: 98, holds: 0, ledger: 1 });
  });
  test("a known call without a final duration retains its hold for a later tick", async () => {
    await send("api"); await ageForRecovery();
    for (const record of provider.records.values()) record.duration = null;
    expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 0, pending: 1 });
    expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
  });
  test("changed account credentials cannot redirect provider recovery", async () => {
    await send("api"); await ageForRecovery(); provider.accountSid = "AC00000000000000000000000000009999";
    expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 0, pending: 1 });
    expect(provider.fetch).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ holds: 1, ledger: 0 });
  });
  test("recovery retries a terminal write whose ledger settlement rolled back", async () => {
    await send("api"); await ageForRecovery();
    await sql.unsafe(`create function public.${faultName}() returns trigger language plpgsql as $$ begin raise exception 'Owned recovery settlement fault'; end $$`);
    await sql.unsafe(`create trigger ${faultName} before update on public.workspace_voice_reservation for each row when (new.workspace = '${workspaceId}'::uuid and new.state = 'settled') execute function public.${faultName}()`);
    expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 0, pending: 1 });
    expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
    const [local] = await sql`select status from public.call where workspace = ${workspaceId}::uuid`;
    expect(local.status).toBe("completed");
    await clearFault(); await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 1, pending: 0 });
    expect(await state()).toMatchObject({ credits: 98, holds: 0, ledger: 1 });
  });
  test("a lost create response is adopted only through its exact provider request history", async () => {
    const create = provider.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    provider.create.mockImplementation(async (args) => { await create(args); throw new Error("Owned response lost after acceptance"); });
    await send("api"); await ageForRecovery();
    expect(await recovery.runVoiceCreditRecovery()).toEqual({ examined: 1, settled: 1, released: 0, pending: 0 });
    expect(provider.events).toHaveBeenCalledOnce(); expect(await state()).toMatchObject({ credits: 98, holds: 0, calls: 1, ledger: 1 });
    const [record] = [...provider.records.values()]; if (!record) throw new Error("Provider fixture required");
    expect(await send("api")).toMatchObject({ status: 200, body: { success: true, callSid: record.sid } });
    expect(provider.create).toHaveBeenCalledOnce();
  });
  test("an unanswered call can be recovered from its original API request with both saved URLs", async () => {
    const create = provider.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    provider.create.mockImplementation(async (args) => { await create(args); throw new Error("Owned response lost"); });
    await send("api"); await ageForRecovery();
    for (const record of provider.records.values()) { record.status = "no-answer"; record.duration = "0"; }
    provider.events.mockImplementation(async (sid: string) => [{ request: {
      method: "POST", url: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${sid}.json`,
      parameters: { url: requiredCall(sid).voiceUrl, status_callback: requiredCall(sid).statusCallback },
    } }]);
    expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 1, pending: 0 });
    expect(await state()).toMatchObject({ credits: 100, holds: 0, calls: 1, ledger: 0 });
  });
  test("an operator candidate requires history and is still fenced by the claimed owner", async () => {
    const create = provider.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    provider.create.mockImplementation(async (args) => { await create(args); throw new Error("Owned response lost"); });
    await send("api"); await ageForRecovery();
    const [owner] = await holds.claimVoiceReservationRecovery(); if (!owner) throw new Error("Claimed reservation required");
    const [record] = [...provider.records.values()]; if (!record) throw new Error("Provider fixture required");
    provider.events.mockResolvedValueOnce([]);
    await expect(recovery.recoverVoiceReservationCall(owner, record.sid)).rejects.toThrow("does not prove");
    expect(await state()).toMatchObject({ holds: 1, calls: 0, ledger: 0 });
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    const [nextOwner] = await holds.claimVoiceReservationRecovery(); if (!nextOwner) throw new Error("New recovery owner required");
    await expect(recovery.recoverVoiceReservationCall(owner, record.sid)).rejects.toThrow("no longer owned");
    expect(await state()).toMatchObject({ holds: 1, calls: 0, ledger: 0 });
    expect(await recovery.recoverVoiceReservationCall(nextOwner, record.sid)).toBe(record.sid);
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 1, pending: 0 });
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toMatchObject({ credits: 98, holds: 0, ledger: 1 });
  });
  test.each(["voice", "status"])("a signed %s request at a different URL cannot attach or settle the reservation", async (entryPoint) => {
    await send("api");
    const [record] = [...provider.records.values()]; if (!record) throw new Error("Provider fixture required");
    const action = entryPoint === "status"
      ? (await import("../../app/routes/api+/ivr/status.action.server")).action
      : (await import("../../app/routes/api+/ivr/$campaignId.action.server")).action;
    const url = `${entryPoint === "status" ? record.statusCallback : record.voiceUrl}&different=true`;
    const params = { AccountSid: accountSid, CallSid: record.sid, To: to, From: from, Direction: "outbound-api", CallStatus: "completed", CallDuration: "42" };
    const request = new Request(url, { method: "POST", headers: {
      "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": twilio.getExpectedTwilioSignature(token, url, params),
    }, body: new URLSearchParams(params) });
    const response = await asRouteResponse(action({ ...routeArgs(request, { campaignId: String(campaignId) }), context: new RouterContextProvider() }));
    expect(response.status).toBe(403); expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
  });
  test.each(["wrong URL", "wrong account", "no history", "not ready", "ambiguous"])("unknown creation with %s keeps its funding", async (kind) => {
    const create = provider.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    provider.create.mockImplementation(async (args) => { await create(args); throw new Error("Owned response lost"); });
    await send("api"); await ageForRecovery();
    const [record] = [...provider.records.values()]; if (!record) throw new Error("Provider fixture required");
    if (kind === "wrong URL") record.voiceUrl += "&different=true";
    if (kind === "wrong account") record.accountSid = "AC00000000000000000000000000009999";
    if (kind === "no history") provider.events.mockResolvedValue([]);
    if (kind === "not ready") record.endTime = new Date();
    if (kind === "ambiguous") { const duplicate = { ...record, sid: callSid() }; provider.records.set(duplicate.sid, duplicate); }
    expect(await recovery.runVoiceCreditRecovery()).toEqual({ examined: 1, settled: 0, released: 0, pending: 1 });
    expect(await state()).toMatchObject({ credits: 100, holds: 1, calls: 0, ledger: 0 });
  });
  test("an aged intent that never entered its send checkpoint releases without provider reads", async () => {
    expect(await holds.reserveVoiceCredits({ workspaceId, kind: "ivr", accountSid, to, from })).toMatchObject({ ok: true });
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    expect(await recovery.runVoiceCreditRecovery()).toEqual({ examined: 1, settled: 0, released: 1, pending: 0 });
    expect(provider.list).not.toHaveBeenCalled(); expect(provider.fetch).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ holds: 0, ledger: 0 });
  });
});
