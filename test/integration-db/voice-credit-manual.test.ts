import { randomUUID } from "node:crypto";
import postgres from "postgres";
import twilio from "twilio";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";

vi.hoisted(() => { process.env.TZ = "UTC"; process.env.BASE_URL = "https://manual-credit.example.test"; });
const principal = vi.hoisted(() => ({ userId: "", windowAllowed: true }));
type ProviderCall = {
  sid: string; accountSid: string; to: string; from: string; url: string; statusCallback?: string;
  status: string; direction: string; parentCallSid: string | null; duration: string | null;
  dateUpdated: Date; dateCreated: Date; endTime: Date | null;
};
const provider = vi.hoisted(() => ({
  accountSid: "AC00000000000000000000000000004879", create: vi.fn(), update: vi.fn(), fetch: vi.fn(), list: vi.fn(), events: vi.fn(),
  records: new Map<string, ProviderCall>(),
}));
const delivery = vi.hoisted(() => ({ jobs: [] as Array<{ type: string; params: unknown }> }));
vi.mock("@/lib/api-auth.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api-auth.server")>(),
  requireJsonAuth: async () => ({ user: { id: principal.userId }, authType: "session" }),
}));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth.server")>(), getSession: async () => ({ headers: new Headers() }),
}));
vi.mock("@/lib/recipient-calling-window", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/recipient-calling-window")>(),
  recipientCallingWindowStatus: () => ({ allowed: principal.windowAllowed, timezone: "America/Toronto", reason: "owned_fixture_clock" }),
}));
vi.mock("@/lib/user-audio.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/user-audio.server")>(),
  getUserVerifiedAudioNumbers: async () => ["+16135550400"],
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  createWorkspaceTwilioInstance: async () => ({
    accountSid: provider.accountSid,
    calls: Object.assign((sid: string) => ({ update: (args: unknown) => provider.update(sid, args), fetch: () => provider.fetch(sid),
      events: { list: () => provider.events(sid) } }), { create: provider.create, list: provider.list }),
  }),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(),
  emitPostgresChangeEvent: vi.fn(), emitQueueEvent: vi.fn(), emitPredictiveBroadcast: vi.fn(),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/worker/job-params.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/worker/job-params.server")>(),
  enqueueRegisteredJob: async (job: { type: string; params: unknown }) => { delivery.jobs.push(job); },
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID(), otherActor = randomUUID();
const accountSid = provider.accountSid, to = "+16135550499", from = "+16135550401";
let sql: postgres.Sql;
let campaignId: number, contactId: number, queueId: number, foreignAttemptId: number, foreignQueueId: number;
let dial: typeof import("../../app/routes/api+/dial.action.server");
let billing: typeof import("@/lib/twilio-call-status.server");
let recovery: typeof import("@/lib/voice-credit-recovery.server");
const callSid = () => `CA${randomUUID().replaceAll("-", "")}`;

describe("manual voice funding and ownership (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned database URL required");
    sql = postgres(url, { max: 3, onnotice: () => {} }); principal.userId = actor;
    await sql`insert into public."user" (id, username) values
      (${actor}::uuid, ${`manual-credit-${actor}@example.test`}), (${otherActor}::uuid, ${`other-manual-${otherActor}@example.test`})`;
    await sql`insert into public.workspace (id, name, credits, twilio_data) values
      (${workspaceId}::uuid, 'Owned manual funding fixture', 100, ${sql.json({ sid: accountSid, authToken: "owned-manual-token" })}),
      (${foreignId}::uuid, 'Foreign manual funding control', 100, '{}'::jsonb)`;
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`manual-credit:${workspaceId}:${actor}`}, ${workspaceId}, ${actor}, 'owner')`;
    await sql`insert into public.workspace_number (workspace, phone_number, type, capabilities)
      values (${workspaceId}::uuid, ${from}, 'local', '{"voice":true}'::jsonb)`;
    for (const target of [workspaceId, foreignId]) {
      const [campaign] = await sql`insert into public.campaign (title, workspace, type, dial_type, caller_id, status)
        values ('Owned manual campaign', ${target}::uuid, 'live_call', 'call', ${from}, 'running') returning id`;
      const [contact] = await sql`insert into public.contact (workspace, firstname, phone)
        values (${target}::uuid, 'Owned manual contact', ${to}) returning id`;
      const [queue] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, queue_order)
        values (${target}::uuid, ${campaign.id}, ${contact.id}, 'queued', 0) returning id`;
      if (target === workspaceId) { campaignId = Number(campaign.id); contactId = Number(contact.id); queueId = Number(queue.id); }
      else {
        foreignQueueId = Number(queue.id);
        const [attempt] = await sql`insert into public.outreach_attempt (workspace, campaign_id, contact_id, user_id)
          values (${target}::uuid, ${campaign.id}, ${contact.id}, ${otherActor}::uuid) returning id`;
        foreignAttemptId = Number(attempt.id);
      }
    }
    dial = await import("../../app/routes/api+/dial.action.server");
    billing = await import("@/lib/twilio-call-status.server");
    recovery = await import("@/lib/voice-credit-recovery.server");
  });
  beforeEach(async () => {
    await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
    const { resetRateLimitsForTests } = await import("@/lib/platform-rate-limit.server"); resetRateLimitsForTests();
    vi.clearAllMocks(); provider.records.clear(); delivery.jobs.length = 0; provider.accountSid = accountSid; principal.windowAllowed = true;
    provider.create.mockReset().mockImplementation(async (args: { to: string; from: string; url: string; statusCallback?: string }) => {
      const call = { ...args, sid: callSid(), accountSid, status: "queued", direction: "outbound-api",
        parentCallSid: null, duration: null, dateUpdated: new Date(), dateCreated: new Date(), endTime: null };
      provider.records.set(call.sid, call); return call;
    });
    provider.update.mockReset().mockResolvedValue({ status: "completed" });
    provider.fetch.mockReset().mockImplementation(async (sid: string) => requiredCall(sid));
    provider.list.mockReset().mockImplementation(async (args: { to?: string; from?: string; parentCallSid?: string }) =>
      [...provider.records.values()].filter((row) => (!args.to || row.to === args.to) && (!args.from || row.from === args.from) &&
        (!args.parentCallSid || row.parentCallSid === args.parentCallSid)));
    provider.events.mockReset().mockImplementation(async (sid: string) => {
      const row = requiredCall(sid);
      const url = row.parentCallSid || ["failed", "busy", "no-answer", "canceled"].includes(row.status) ? row.statusCallback : row.url;
      return [{ request: { method: "POST", url, parameters: { call_sid: sid } } }];
    });
    await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    await sql`update public.workspace set credits = 100 where id = ${workspaceId}::uuid`;
    await sql`delete from public.contact where workspace = ${workspaceId}::uuid and id <> ${contactId}`;
    await sql`update public.contact set household_id = null where id = ${contactId}`;
    await sql`delete from public.households where workspace_id = ${workspaceId}::uuid`;
    await sql`update public.campaign set status = 'running', group_household_queue = false where id = ${campaignId}`;
    await sql`update public.campaign_queue set queue_state = 'queued', assigned_to_user_id = null, dequeued_at = null,
      dequeued_by = null, dequeued_reason = null, dispatch_generation = gen_random_uuid(), voice_reservation_id = null where id = ${queueId}`;
  });
  afterEach(async () => {
    const [foreign] = await sql`select credits from public.workspace where id = ${foreignId}::uuid`;
    expect(foreign.credits).toBe(100);
  });
  afterAll(async () => {
    try {
      if (sql) {
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public."user" where id in (${actor}::uuid, ${otherActor}::uuid)`;
      }
    } finally {
      await sql?.end();
      if (dial) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  async function send(overrides: Record<string, string | null> = {}) {
    const body = new URLSearchParams({
      to_number: to, user_id: actor, campaign_id: String(campaignId), contact_id: String(contactId),
      workspace_id: workspaceId, queue_id: String(queueId), caller_id: from, dial_intent_id: randomUUID(),
    });
    for (const [key, value] of Object.entries(overrides)) { if (value === null) body.delete(key); else body.set(key, value); }
    const request = new Request("https://manual-credit.example.test/api/dial", { method: "POST", body });
    const response = await asRouteResponse(dial.action(routeArgs(request)));
    return { status: response.status, body: await response.text() };
  }
  async function state() {
    const [row] = await sql`select credits,
      (select count(*)::int from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid and state in ('reserved','creating','active')) as holds,
      (select count(*)::int from public.call where workspace = ${workspaceId}::uuid) as calls,
      (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger
      from public.workspace where id = ${workspaceId}::uuid`;
    return row;
  }
  function firstCall() {
    const [row] = [...provider.records.values()]; if (!row) throw new Error("Owned provider call required"); return row;
  }
  function requiredCall(sid: string) {
    const row = provider.records.get(sid); if (!row) throw new Error("Owned provider call required"); return row;
  }
  async function signedPost(url: string, params: Record<string, string>, voice = false) {
    const request = new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": twilio.getExpectedTwilioSignature("owned-manual-token", url, params) }, body: new URLSearchParams(params) });
    const route = voice ? await import("../../app/routes/api+/dial/$number.action.server") : await import("../../app/routes/api+/call-status.action.server");
    return asRouteResponse(route.action(routeArgs(request, voice ? { number: to } : {})));
  }
  async function connectRecipient(root = firstCall()) {
    const response = await signedPost(root.url, { AccountSid: accountSid, CallSid: root.sid, From: from, To: root.to,
      Direction: "outbound-api", CallStatus: "in-progress" }, true);
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toContain(to); expect(xml).not.toContain("machineDetection");
    const callback = xml.match(/<Number[^>]*statusCallback="([^"]+)"/);
    if (!callback) throw new Error("Funded recipient callback required in TwiML");
    const child: ProviderCall = { ...root, sid: callSid(), parentCallSid: root.sid, to,
      direction: "outbound-dial", statusCallback: callback[1].replaceAll("&amp;", "&") };
    provider.records.set(child.sid, child); return child;
  }
  async function status(row: ProviderCall, value: string, duration = "0") {
    if (!row.statusCallback) throw new Error("Saved status callback required");
    row.status = value; row.duration = duration; row.dateUpdated = new Date();
    if (["completed", "failed", "busy", "no-answer", "canceled"].includes(value)) row.endTime = new Date();
    const params: Record<string, string> = { AccountSid: accountSid, CallSid: row.sid, From: from, To: row.to,
      Direction: row.direction, CallStatus: value, CallDuration: duration };
    if (row.parentCallSid) params.ParentCallSid = row.parentCallSid;
    const response = await signedPost(row.statusCallback, params);
    expect(response.status).toBe(200); await expect(response.json()).resolves.toEqual({ success: true });
  }
  async function flushCallJobs() {
    const { callStatusSideEffectsParams } = await import("@/lib/worker/job-params.server");
    const { runCallStatusSideEffects } = await import("@/lib/worker/webhook-side-effects.server");
    const stored = await sql`select id, type, params from public.job where workspace_id = ${workspaceId}::uuid and type = 'call_status_side_effects' and status = 'queued'`;
    for (const job of [...delivery.jobs.splice(0), ...stored]) {
      if (job.type !== "call_status_side_effects") continue;
      const args = callStatusSideEffectsParams.parse(job.params);
      await runCallStatusSideEffects({ callSid: args.sid, event: args.event });
    }
    for (const job of stored) await sql`update public.job set status = 'completed' where id = ${job.id}`;
  }
  test("saves the manual parent continuation before the setup provider POST", async () => {
    const create = provider.create.getMockImplementation();
    if (!create) throw new Error("Owned setup provider implementation required");
    let continuationAtSend: unknown;
    provider.create.mockImplementationOnce(async (args: Record<string, string>) => {
      const [checkpoint] = await sql`select setup_continuation_url from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
      continuationAtSend = checkpoint?.setup_continuation_url;
      return create(args);
    });
    const result = await send(); expect(result.status).toBe(200);
    const [row] = await sql`select id, setup_continuation_url from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    const expected = `https://manual-credit.example.test/api/voice-continuation?credit_reservation=${row.id}`;
    expect(continuationAtSend).toBe(expected); expect(row.setup_continuation_url).toBe(expected);
    expect(await state()).toMatchObject({ holds: 1, ledger: 0, calls: 1 });
    expect(provider.create).toHaveBeenCalledOnce();
  });
  test("a new manual Dial returns control to its saved signed parent continuation", async () => {
    await send(); const physical = firstCall();
    const [row] = await sql`select id from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    const response = await signedPost(physical.url, { AccountSid: accountSid, CallSid: physical.sid, From: from, To: physical.to,
      Direction: "outbound-api", CallStatus: "in-progress" }, true);
    expect(response.status).toBe(200); const xml = await response.text();
    const actionUrl = xml.match(/<Dial[^>]*\baction="([^"]+)"/)?.[1];
    if (!actionUrl) throw new Error("Saved parent action required");
    const url = new URL(actionUrl.replaceAll("&amp;", "&")); const overrides = new URLSearchParams(url.hash.slice(1)); url.hash = "";
    expect(url.href).toBe(`https://manual-credit.example.test/api/voice-continuation?credit_reservation=${row.id}`);
    expect(Object.fromEntries(overrides)).toEqual({ ct: "1000", rt: "3000", tt: "15000", rc: "2", rp: "ct,rt,5xx" });
    expect(xml).toMatch(/<Dial[^>]*\bmethod="POST"/);
    expect(await state()).toMatchObject({ holds: 1, ledger: 0 });
  });
  test("a new manual Dial commits its recording nonce with the one customer instruction", async () => {
    await send(); const physical = firstCall();
    const response = await signedPost(physical.url, { AccountSid: accountSid, CallSid: physical.sid, From: from, To: physical.to,
      Direction: "outbound-api", CallStatus: "in-progress" }, true);
    const xml = await response.text(), callback = xml.match(/recordingStatusCallback="([^"]+)"/)?.[1];
    if (!callback) throw new Error("Owned recording callback required");
    const url = new URL(callback.replaceAll("&amp;", "&")); expect(url.hash).not.toBe(""); url.hash = "";
    const [recording] = await sql`select id, state, send_started_at, logical_call_sid, source_call_sid, callback_url from public.workspace_voice_recording_operation
      where workspace = ${workspaceId}::uuid`;
    expect(recording).toMatchObject({ state: "creating", logical_call_sid: physical.sid, source_call_sid: physical.sid,
      callback_url: `https://manual-credit.example.test/api/voice-recording?recording=${recording.id}` });
    expect(url.href).toBe(recording.callback_url); expect(recording.send_started_at).not.toBeNull();
    expect(xml).toContain('recordingStatusCallbackEvent="in-progress completed absent"');
    expect(xml).toContain('recordingStatusCallbackMethod="POST"');
    expect(await state()).toMatchObject({ holds: 1, ledger: 0 }); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("a recording checkpoint fault rolls back manual customer permission", async () => {
    await send(); const physical = firstCall(), name = `owned_manual_recording_${randomUUID().replaceAll("-", "")}`;
    const params = { AccountSid: accountSid, CallSid: physical.sid, From: from, To: physical.to, Direction: "outbound-api", CallStatus: "in-progress" };
    await sql.unsafe(`create function public.${name}() returns trigger language plpgsql as $$begin
      if new.workspace = '${workspaceId}'::uuid and new.state = 'creating' then return null; end if; return new; end$$`);
    await sql.unsafe(`create trigger ${name} before update on public.workspace_voice_recording_operation for each row execute function public.${name}()`);
    try {
      expect(await (await signedPost(physical.url, params, true)).text()).not.toContain("<Number");
      const [row] = await sql`select recipient_instruction_issued_at from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
      const [recording] = await sql`select state, send_started_at from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
      expect(row.recipient_instruction_issued_at).toBeNull(); expect(recording).toEqual({ state: "prepared", send_started_at: null });
    } finally {
      await sql.unsafe(`drop trigger if exists ${name} on public.workspace_voice_recording_operation`);
      await sql.unsafe(`drop function if exists public.${name}()`);
    }
    expect(await (await signedPost(physical.url, params, true)).text()).toContain("<Number");
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toMatchObject({ holds: 1, ledger: 0 });
  });
  test("an issued legacy manual Dial cannot acquire a recording nonce on retry", async () => {
    await send(); const physical = firstCall();
    await sql`update public.workspace_voice_reservation set recipient_instruction_issued_at = now() where workspace = ${workspaceId}::uuid`;
    const response = await signedPost(physical.url, { AccountSid: accountSid, CallSid: physical.sid, From: from, To: physical.to,
      Direction: "outbound-api", CallStatus: "in-progress" }, true);
    expect(await response.text()).not.toContain("<Number");
    const rows = await sql`select id from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    expect(rows).toEqual([]); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("a failed manual TwiML render cannot consume customer permission", async () => {
    await send(); const physical = firstCall();
    const render = vi.spyOn(twilio.twiml.VoiceResponse.prototype, "toString").mockImplementationOnce(() => { throw new Error("Owned render fault"); });
    try {
      const response = await signedPost(physical.url, { AccountSid: accountSid, CallSid: physical.sid, From: from, To: physical.to,
        Direction: "outbound-api", CallStatus: "in-progress" }, true);
      expect(await response.text()).not.toContain("<Number");
      const [row] = await sql`select recipient_instruction_issued_at from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
      const [recording] = await sql`select state, send_started_at from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
      expect(row.recipient_instruction_issued_at).toBeNull(); expect(recording).toEqual({ state: "prepared", send_started_at: null });
    } finally { render.mockRestore(); }
    expect(await connectRecipient()).toMatchObject({ parentCallSid: physical.sid }); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("an accepted manual retry cannot retrofit continuation onto an older call", async () => {
    const intent = randomUUID(); await send({ dial_intent_id: intent });
    await sql`update public.workspace_voice_reservation set setup_continuation_url = null where workspace = ${workspaceId}::uuid`;
    expect((await send({ dial_intent_id: intent })).status).toBe(200);
    const [row] = await sql`select setup_continuation_url from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(row.setup_continuation_url).toBeNull(); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("ordinary signed parent completion keeps customer billing with its existing owner", async () => {
    await send(); const child = await connectRecipient(), physical = firstCall(); await status(child, "completed", "42");
    const [row] = await sql`select setup_continuation_url from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(row.setup_continuation_url).toBeTypeOf("string");
    const url: string = row.setup_continuation_url, before = await state();
    const params = { AccountSid: accountSid, CallSid: physical.sid, DialCallSid: child.sid, DialCallStatus: "completed",
      From: from, To: physical.to, Direction: physical.direction };
    const { action } = await import("../../app/routes/api+/voice-continuation.action.server");
    for (let retry = 0; retry < 3; retry++) {
      const request = new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": twilio.getExpectedTwilioSignature("owned-manual-token", url, params) }, body: new URLSearchParams(params) });
      const response = await asRouteResponse(action(routeArgs(request))); expect(response.status).toBe(200);
      expect(await response.text()).toContain("<Hangup");
    }
    expect(await state()).toEqual(before); expect(provider.create).toHaveBeenCalledOnce(); expect(provider.update).not.toHaveBeenCalled();
  });
  async function billWithoutQueueEffects(child: ProviderCall) {
    await status(child, "completed", "42");
    const { findCallBySid } = await import("@/lib/telephony-db.server");
    const saved = await findCallBySid(child.sid); if (!saved) throw new Error("Saved recipient required");
    await billing.billTerminalCallStatus(saved);
    const root = requiredCall(child.parentCallSid ?? ""); await status(root, "completed", "60");
  }
  async function ageForRecovery() {
    await sql`update public.workspace_voice_reservation set send_started_at = now() - interval '21 minutes',
      lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    for (const row of provider.records.values()) {
      row.dateCreated = new Date(Date.now() - 21 * 60_000); row.dateUpdated = new Date(Date.now() - 20 * 60_000);
      if (row.endTime) row.endTime = row.dateUpdated;
    }
  }
  test("signed setup and child callbacks debit one staffed hold once", async () => {
    await send(); const root = firstCall(), child = await connectRecipient(root);
    await status(root, "completed", "60"); expect(delivery.jobs).toHaveLength(0);
    expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
    await status(child, "completed", "42"); await status(child, "completed", "42");
    await flushCallJobs();
    expect(await state()).toEqual({ credits: 96, holds: 0, calls: 2, ledger: 1 });
    expect(provider.create).toHaveBeenCalledOnce();
  });
  test("one setup request can issue only one recipient Dial", async () => {
    await send(); const root = firstCall(); await connectRecipient(root);
    const retry = await signedPost(root.url, { AccountSid: accountSid, CallSid: root.sid, From: from, To: root.to,
      Direction: "outbound-api", CallStatus: "in-progress" }, true);
    expect(retry.status).toBe(200); expect(await retry.text()).not.toContain("<Dial");
  });
  test("a terminal setup before child issuance releases its hold and refuses later Dial", async () => {
    await send(); const root = firstCall(); await status(root, "no-answer");
    expect(await state()).toMatchObject({ credits: 100, holds: 0, ledger: 0 });
    const late = await signedPost(root.url, { AccountSid: accountSid, CallSid: root.sid, From: from, To: root.to,
      Direction: "outbound-api", CallStatus: "in-progress" }, true);
    expect(await late.text()).not.toContain("<Dial"); expect(delivery.jobs).toHaveLength(0);
  });
  test("known setup replay retains the original accepted response", async () => {
    const intent = randomUUID(); expect(await send({ dial_intent_id: intent })).toMatchObject({ status: 200 });
    expect(await send({ dial_intent_id: intent })).toMatchObject({ status: 200 });
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toMatchObject({ credits: 100, holds: 1, calls: 1 });
  });
  test("later-minute recipient grace retains the published nine-credit debit", async () => {
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    await send(); const child = await connectRecipient();
    await status(child, "completed", "61"); await flushCallJobs();
    expect(await state()).toMatchObject({ credits: -5, holds: 0, ledger: 1 });
  });
  test("early setup and child callbacks finish before the REST create reply", async () => {
    const create = provider.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    provider.create.mockImplementationOnce(async (args) => {
      const root = await create(args), child = await connectRecipient(root);
      await status(root, "completed", "60"); await status(child, "completed", "42"); await flushCallJobs(); return root;
    });
    expect(await send()).toMatchObject({ status: 200 });
    expect(await state()).toEqual({ credits: 96, holds: 0, calls: 2, ledger: 1 }); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("an early signed acknowledgement survives a later create error", async () => {
    const create = provider.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    provider.create.mockImplementationOnce(async (args) => { const root = await create(args); await connectRecipient(root); throw new Error("Owned lost create reply"); });
    const intent = randomUUID(), result = await send({ dial_intent_id: intent });
    expect(result.status).toBe(200); expect(result.body).not.toContain("awaiting provider");
    expect(await send({ dial_intent_id: intent })).toMatchObject({ status: 200 }); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("the final setup callback can complete a campaign after its recipient settles", async () => {
    await send(); const root = firstCall(), child = await connectRecipient(root);
    await status(child, "completed", "42"); await flushCallJobs();
    const [before] = await sql`select status from public.campaign where id = ${campaignId}`; expect(before.status).toBe("running");
    await status(root, "completed", "60");
    const [after] = await sql`select status from public.campaign where id = ${campaignId}`; expect(after.status).toBe("complete");
  });
  test("a released accepted setup remains a replay even with uppercase intent UUID", async () => {
    const intent = randomUUID(); await send({ dial_intent_id: intent }); await status(firstCall(), "no-answer");
    expect(await send({ dial_intent_id: intent.toUpperCase() })).toMatchObject({ status: 200 });
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toMatchObject({ credits: 100, holds: 0 });
  });
  test("manual intent replay survives a later queue generation", async () => {
    const [queue] = await sql`select dispatch_generation from public.campaign_queue where id = ${queueId}`;
    const payload = { dial_intent_id: randomUUID(), expected_queue_generation: queue.dispatch_generation };
    await send(payload); await status(firstCall(), "no-answer");
    const { enqueueContactsForCampaign } = await import("@/lib/queue.server"); await enqueueContactsForCampaign(campaignId, [contactId], { requeue: true });
    expect(await send(payload)).toMatchObject({ status: 200 }); expect(provider.create).toHaveBeenCalledOnce();
    expect(await send({ expected_queue_generation: queue.dispatch_generation })).toMatchObject({ status: 409 });
    expect(await send()).toMatchObject({ status: 200 }); expect(provider.create).toHaveBeenCalledTimes(2);
  });
  test("legacy requests without an intent still block an active predecessor", async () => {
    expect(await send({ dial_intent_id: null })).toMatchObject({ status: 200 });
    expect(await send({ dial_intent_id: null })).toMatchObject({ status: 409 }); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("a verified phone setup shares the same recipient funding", async () => {
    await send({ selected_device: "+16135550400" }); const root = firstCall(); expect(root.to).toBe("+16135550400");
    const child = await connectRecipient(root); await status(child, "completed", "42"); await flushCallJobs();
    expect(await state()).toMatchObject({ credits: 96, holds: 0, ledger: 1 });
  });
  test("an older terminal worker cannot dequeue a newer manual intent in the same generation", async () => {
    await send(); const first = firstCall(), child = await connectRecipient(first); await billWithoutQueueEffects(child);
    const [before] = await sql`select dispatch_generation from public.campaign_queue where id = ${queueId}`;
    expect(await send()).toMatchObject({ status: 200 });
    const [current] = await sql`select dispatch_generation, voice_reservation_id, queue_state, dequeued_at from public.campaign_queue where id = ${queueId}`;
    expect(current.dispatch_generation).toBe(before.dispatch_generation); expect(current.dequeued_at).toBeNull();
    await flushCallJobs();
    const [after] = await sql`select dispatch_generation, voice_reservation_id, queue_state, dequeued_at from public.campaign_queue where id = ${queueId}`;
    expect(after).toEqual(current);
    expect(await state()).toMatchObject({ credits: 96, holds: 1, ledger: 1 }); expect(provider.create).toHaveBeenCalledTimes(2);
  });
  test("an older terminal worker cannot dequeue a re-added queue generation", async () => {
    await send(); const child = await connectRecipient(); await billWithoutQueueEffects(child);
    const { enqueueContactsForCampaign } = await import("@/lib/queue.server"); await enqueueContactsForCampaign(campaignId, [contactId], { requeue: true });
    await flushCallJobs();
    const [queue] = await sql`select queue_state, dequeued_at from public.campaign_queue where id = ${queueId}`;
    expect(queue).toEqual({ queue_state: "queued", dequeued_at: null });
  });
  test("replay repairs deleted terminal records without making an old call active", async () => {
    const intent = randomUUID(); await send({ dial_intent_id: intent }); const child = await connectRecipient(); await billWithoutQueueEffects(child);
    await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
    expect(await send({ dial_intent_id: intent })).toMatchObject({ status: 200 });
    expect(await state()).toMatchObject({ credits: 96, holds: 0, calls: 2, ledger: 1 }); expect(provider.create).toHaveBeenCalledOnce();
    expect(await send()).toMatchObject({ status: 200 }); expect(provider.create).toHaveBeenCalledTimes(2);
  });
  test("known child recovery applies billing and recipient queue outcomes", async () => {
    await send(); const root = firstCall(), child = await connectRecipient(root); await status(child, "ringing"); delivery.jobs.length = 0;
    root.status = "completed"; root.endTime = new Date(); child.status = "completed"; child.duration = "42"; child.endTime = new Date();
    await ageForRecovery(); expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 1, pending: 0 });
    const [queue] = await sql`select queue_state from public.campaign_queue where id = ${queueId}`; expect(queue.queue_state).toBe("dequeued");
    expect(await state()).toMatchObject({ credits: 96, holds: 0, ledger: 1 }); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("a lost unanswered setup reply is recovered from its status webhook history", async () => {
    const create = provider.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    provider.create.mockImplementationOnce(async (args) => { await create(args); throw new Error("Owned accepted reply lost"); });
    const intent = randomUUID(); await send({ dial_intent_id: intent }); const root = firstCall(); root.status = "no-answer"; root.duration = null;
    await ageForRecovery(); expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ released: 1, pending: 0 });
    expect(await state()).toMatchObject({ credits: 100, holds: 0, calls: 1, ledger: 0 });
    expect(await send({ dial_intent_id: intent })).toMatchObject({ status: 200 }); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("unknown recipient recovery requires its known parent and exact webhook history", async () => {
    await send(); const root = firstCall(), child = await connectRecipient(root);
    root.status = "completed"; root.endTime = new Date(); child.status = "completed"; child.duration = "42"; child.endTime = new Date();
    await ageForRecovery(); expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 1, pending: 0 });
    expect(await state()).toMatchObject({ credits: 96, holds: 0, calls: 2, ledger: 1 }); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("an ended parent with an issued but unknown child retains the hold", async () => {
    await send(); const root = firstCall(), child = await connectRecipient(root); provider.records.delete(child.sid); root.status = "completed"; root.endTime = new Date();
    await ageForRecovery(); expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ released: 0, settled: 0, pending: 1 });
    expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
  });
  test("zero recipient seconds take precedence over the provider's minute field", async () => {
    await send(); const child = await connectRecipient();
    const response = await signedPost(child.statusCallback ?? "", { AccountSid: accountSid, CallSid: child.sid, From: from, To: to,
      ParentCallSid: child.parentCallSid ?? "", Direction: "outbound-dial", CallStatus: "completed", CallDuration: "0", Duration: "1" });
    expect(response.status).toBe(200); await flushCallJobs();
    expect(await state()).toMatchObject({ credits: 100, holds: 0, ledger: 0 });
  });
  test("a completed callback without final seconds retains funding until SDK recovery", async () => {
    await send(); const root = firstCall(), child = await connectRecipient(root);
    const response = await signedPost(child.statusCallback ?? "", { AccountSid: accountSid, CallSid: child.sid, From: from, To: to,
      ParentCallSid: root.sid, Direction: "outbound-dial", CallStatus: "completed" });
    expect(response.status).toBe(200); await flushCallJobs();
    expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
    root.status = "completed"; root.endTime = new Date(); child.status = "completed"; child.duration = "42"; child.endTime = new Date();
    await ageForRecovery(); expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 1, pending: 0 });
    expect(await state()).toMatchObject({ credits: 96, holds: 0, ledger: 1 });
  });
  test("late initiated callbacks preserve final seconds and the debit", async () => {
    await send(); const child = await connectRecipient(); await status(child, "completed", "42");
    const response = await signedPost(child.statusCallback ?? "", { AccountSid: accountSid, CallSid: child.sid, From: from, To: to,
      ParentCallSid: child.parentCallSid ?? "", Direction: "outbound-dial", CallStatus: "initiated" });
    expect(response.status).toBe(200); await flushCallJobs();
    const [saved] = await sql`select status, duration, call_duration from public.call where sid = ${child.sid}`;
    expect(saved).toMatchObject({ status: "completed", duration: "42", call_duration: "42" });
    expect(await state()).toMatchObject({ credits: 96, holds: 0, ledger: 1 });
  });
  test("an old progress job cannot settle before a terminal outcome is durable", async () => {
    await send(); const root = firstCall(), child = await connectRecipient(); await status(child, "ringing");
    await billing.processCallStatusWebhook({ sid: child.sid, status: "completed", duration: "42" }, { workspaceId, skipBilling: true });
    await flushCallJobs(); expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
    root.status = "completed"; root.endTime = new Date(); await ageForRecovery();
    expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 1, pending: 0 });
    await flushCallJobs(); expect(await state()).toMatchObject({ credits: 96, holds: 0, ledger: 1 });
    const [queue] = await sql`select queue_state from public.campaign_queue where id = ${queueId}`; expect(queue.queue_state).toBe("dequeued");
  });
  test.each(["404", "missing duration", "different account"])("open-sync leaves funded %s evidence to reservation recovery", async (fault) => {
    await send(); const child = await connectRecipient(); await status(child, "ringing"); delivery.jobs.length = 0;
    await sql`update public.call set date_created = now() - interval '3 hours' where workspace = ${workspaceId}::uuid`;
    if (fault === "404") { provider.list.mockResolvedValue([]); provider.fetch.mockRejectedValue({ status: 404, code: 20404 }); }
    else { child.status = "completed"; child.duration = fault === "missing duration" ? null : "42"; }
    if (fault === "different account") provider.accountSid = "AC00000000000000000000000000004999";
    const { triggerTwilioOpenSync } = await import("@/lib/twilio-open-sync.server");
    expect(await triggerTwilioOpenSync({ workspaceId })).toMatchObject({ ok: true });
    expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
    const [saved] = await sql`select status from public.call where sid = ${child.sid}`; expect(saved.status).toBe("ringing");
  });
  test.each(["setup", "recipient"])("an old %s hangup leaves a newer intent unchanged", async (leg) => {
    await send(); const root = firstCall(), child = await connectRecipient(); await billWithoutQueueEffects(child); await send();
    const [before] = await sql`select queue_state, dispatch_generation, voice_reservation_id, dequeued_at from public.campaign_queue where id = ${queueId}`;
    const { action } = await import("../../app/routes/api+/hangup.action.server");
    const response = await asRouteResponse(action(routeArgs(new Request("https://manual-credit.example.test/api/hangup", {
      method: "POST", body: new URLSearchParams({ workspaceId, callSid: leg === "setup" ? root.sid : child.sid }),
    }))));
    expect(response.status).toBe(200);
    const [after] = await sql`select queue_state, dispatch_generation, voice_reservation_id, dequeued_at from public.campaign_queue where id = ${queueId}`;
    expect(after).toEqual(before); expect(await state()).toMatchObject({ credits: 96, holds: 1, ledger: 1 });
  });
  test("snake-case funded callbacks cannot bypass the required nonce", async () => {
    await send(); const root = firstCall(), child = await connectRecipient(); await status(child, "ringing"); delivery.jobs.length = 0;
    const response = await signedPost("https://manual-credit.example.test/api/call-status/", {
      account_sid: accountSid, call_sid: child.sid, parent_call_sid: root.sid, from, to, direction: "outbound-dial", call_status: "completed", call_duration: "42",
    });
    expect(response.status).toBe(403); expect(delivery.jobs).toHaveLength(0);
    const [saved] = await sql`select status from public.call where sid = ${child.sid}`; expect(saved.status).toBe("ringing");
  });
  test("conflicting signed SID aliases cannot bind one call and update another", async () => {
    await send(); const child = await connectRecipient();
    const response = await signedPost(child.statusCallback ?? "", { AccountSid: accountSid, CallSid: child.sid, call_sid: callSid(),
      ParentCallSid: child.parentCallSid ?? "", From: from, To: to, Direction: "outbound-dial", CallStatus: "completed", CallDuration: "42" });
    expect(response.status).toBe(403); expect(delivery.jobs).toHaveLength(0);
  });
  test.each([{ error: { status: 400 }, status: 502, holds: 0 }, { error: { status: 500 }, status: 409, holds: 1 },
    { error: new Error("Owned network timeout"), status: 409, holds: 1 }])("provider create failure returns visible JSON: $status", async (fault) => {
    provider.create.mockRejectedValueOnce(fault.error); const response = await send();
    expect(response.status).toBe(fault.status); expect(JSON.parse(response.body)).toHaveProperty("error");
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toMatchObject({ credits: 100, holds: fault.holds, ledger: 0 });
  });
  test("legacy blank outreach IDs create a new attempt", async () => {
    expect(await send({ outreach_id: "", dial_intent_id: null })).toMatchObject({ status: 200 });
    const [saved] = await sql`select outreach_attempt_id from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(Number(saved.outreach_attempt_id)).toBeGreaterThan(0); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("accepted replay survives a later closed window and removed caller ID", async () => {
    const payload = { dial_intent_id: randomUUID() }; await send(payload); principal.windowAllowed = false;
    await sql`delete from public.workspace_number where workspace = ${workspaceId}::uuid`;
    try { expect(await send(payload)).toMatchObject({ status: 200 }); expect(provider.create).toHaveBeenCalledOnce(); }
    finally { await sql`insert into public.workspace_number (workspace, phone_number, type, capabilities)
      values (${workspaceId}::uuid, ${from}, 'local', '{"voice":true}'::jsonb)`; }
  });
  async function addHouseholdSibling() {
    const [household] = await sql`insert into public.households (household_key, workspace_id, address)
      values (${randomUUID()}, ${workspaceId}::uuid, 'Owned household') returning id`;
    await sql`update public.contact set household_id = ${household.id}::uuid where id = ${contactId}`;
    const [sibling] = await sql`insert into public.contact (workspace, firstname, phone, household_id)
      values (${workspaceId}::uuid, 'Owned sibling', '+16135550497', ${household.id}::uuid) returning id`;
    const [queue] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, queue_order)
      values (${workspaceId}::uuid, ${campaignId}, ${sibling.id}, 'queued', 1) returning id`;
    await sql`update public.campaign set group_household_queue = true where id = ${campaignId}`;
    return { contact: String(sibling.id), queue: String(queue.id) };
  }
  test("funded completion still dequeues an untouched household sibling", async () => {
    const sibling = await addHouseholdSibling(); await send(); const child = await connectRecipient(); await status(child, "completed", "42"); await flushCallJobs();
    const [queue] = await sql`select queue_state from public.campaign_queue where id = ${sibling.queue}`; expect(queue.queue_state).toBe("dequeued");
  });
  test.each(["replay", "first result"])("an old household %s leaves a newer sibling intent live", async (timing) => {
    const sibling = await addHouseholdSibling(); await send(); const child = await connectRecipient(); await billWithoutQueueEffects(child);
    if (timing === "replay") await flushCallJobs();
    const { enqueueContactsForCampaign } = await import("@/lib/queue.server"); await enqueueContactsForCampaign(campaignId, [Number(sibling.contact)], { requeue: true });
    if (timing === "first result") expect(await send({ contact_id: sibling.contact, queue_id: sibling.queue, to_number: "+16135550497" })).toMatchObject({ status: 200 });
    const [before] = await sql`select queue_state, dispatch_generation, voice_reservation_id, dequeued_at from public.campaign_queue where id = ${sibling.queue}`;
    if (timing === "replay") {
      const { findCallBySid } = await import("@/lib/telephony-db.server"); const saved = await findCallBySid(child.sid);
      if (!saved) throw new Error("Owned terminal call required");
      const { settleRecoveredVoiceCall } = await import("@/lib/recovered-voice-status.server"); await settleRecoveredVoiceCall(saved);
    } else await flushCallJobs();
    const [after] = await sql`select queue_state, dispatch_generation, voice_reservation_id, dequeued_at from public.campaign_queue where id = ${sibling.queue}`;
    expect(after).toEqual(before);
  });
  test.each(["account", "caller", "recipient", "direction", "parent", "SID", "URL", "nonce"])("signed recipient %s mismatches cannot change funding", async (fault) => {
    await send(); const root = firstCall(), child = await connectRecipient(); await status(child, "ringing"); delivery.jobs.length = 0;
    const params = { AccountSid: accountSid, CallSid: child.sid, ParentCallSid: root.sid, From: from, To: to,
      Direction: "outbound-dial", CallStatus: "completed", CallDuration: "42" };
    const url = new URL(child.statusCallback ?? "");
    if (fault === "account") params.AccountSid = "AC00000000000000000000000000004999";
    if (fault === "caller") params.From = "+16135550498";
    if (fault === "recipient") params.To = "+16135550498";
    if (fault === "direction") params.Direction = "outbound-api";
    if (fault === "parent") params.ParentCallSid = callSid();
    if (fault === "SID") params.CallSid = callSid();
    if (fault === "URL") url.searchParams.set("unexpected", "true");
    if (fault === "nonce") url.searchParams.delete("credit_reservation");
    expect((await signedPost(url.toString(), params)).status).toBe(403); expect(delivery.jobs).toHaveLength(0);
    expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
    const [saved] = await sql`select status from public.call where sid = ${child.sid}`; expect(saved.status).toBe("ringing");
  });
  test.each(["account", "caller", "device", "direction", "parent", "URL", "nonce"])("signed setup %s mismatches cannot issue a recipient", async (fault) => {
    await send(); const root = firstCall();
    const params = { AccountSid: accountSid, CallSid: root.sid, ParentCallSid: "", From: from, To: root.to,
      Direction: "outbound-api", CallStatus: "in-progress" };
    const url = new URL(root.url);
    if (fault === "account") params.AccountSid = "AC00000000000000000000000000004999";
    if (fault === "caller") params.From = "+16135550498";
    if (fault === "device") params.To = `client:${otherActor}`;
    if (fault === "direction") params.Direction = "outbound-dial";
    if (fault === "parent") params.ParentCallSid = callSid();
    if (fault === "URL") url.searchParams.set("unexpected", "true");
    if (fault === "nonce") url.searchParams.delete("credit_reservation");
    const response = await signedPost(url.toString(), params, true);
    expect(response.status).toBe(403); expect(await response.text()).not.toContain("<Dial");
    const [saved] = await sql`select recipient_instruction_issued_at from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(saved.recipient_instruction_issued_at).toBeNull(); expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
  });
  test("an accepted setup SID survives a local call insert failure and replay repairs it", async () => {
    const name = `owned_manual_fault_${randomUUID().replaceAll("-", "")}`, intent = randomUUID();
    await sql.unsafe(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $fault$
      BEGIN IF NEW.workspace = '${workspaceId}'::uuid THEN RAISE EXCEPTION 'owned manual persistence fault'; END IF; RETURN NEW; END; $fault$`);
    try {
      await sql.unsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON public.call FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
      expect(await send({ dial_intent_id: intent })).toMatchObject({ status: 200 });
      expect(await state()).toMatchObject({ credits: 100, holds: 1, calls: 0, ledger: 0 });
      const [saved] = await sql`select setup_sid from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
      expect(saved.setup_sid).toBe(firstCall().sid);
    } finally { await sql.unsafe(`DROP TRIGGER IF EXISTS ${name} ON public.call`); await sql.unsafe(`DROP FUNCTION public.${name}()`); }
    expect(await send({ dial_intent_id: intent })).toMatchObject({ status: 200 });
    expect(await state()).toMatchObject({ credits: 100, holds: 1, calls: 1 }); expect(provider.create).toHaveBeenCalledOnce(); expect(provider.update).not.toHaveBeenCalled();
  });
  test.each(["no history", "ambiguous child", "wrong child parent", "different account"])("uncertain bridge recovery retains funding with %s", async (fault) => {
    await send(); const root = firstCall(), child = await connectRecipient(); root.status = "completed"; root.endTime = new Date();
    child.status = "completed"; child.duration = "42"; child.endTime = new Date(); await ageForRecovery();
    if (fault === "no history") provider.events.mockResolvedValue([]);
    if (fault === "ambiguous child") { const second = { ...child, sid: callSid() }; provider.records.set(second.sid, second); }
    if (fault === "wrong child parent") child.parentCallSid = callSid();
    if (fault === "different account") provider.accountSid = "AC00000000000000000000000000004999";
    expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 0, released: 0, pending: 1 });
    expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 }); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("funded household completion works when all query-pool connections enter together", async () => {
    const sibling = await addHouseholdSibling(); await send(); const child = await connectRecipient(); await billWithoutQueueEffects(child);
    const { db } = await import("@/server/db"), { sql: query } = await import("drizzle-orm");
    const { QUERY_POOL_MAX } = await import("@/server/db-pool-size");
    const { findVoiceReservationForCall } = await import("@/server/voice-bridge-reservation.server");
    const { dequeueFundedVoiceAttempt } = await import("@/server/voice-attempt-queue.server");
    const saved = await findVoiceReservationForCall(workspaceId, child.sid); if (!saved) throw new Error("Owned reservation required");
    const transaction = db.transaction.bind(db); let entered = 0, release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async function<T>(work: Parameters<typeof transaction<T>>[0], config: Parameters<typeof transaction>[1]) {
      return transaction(async (tx) => {
        await tx.execute(query`SET LOCAL idle_in_transaction_session_timeout = '1500ms'`);
        if (++entered === QUERY_POOL_MAX) release(); await barrier;
        return work(tx);
      }, config);
    });
    try { await Promise.all(Array.from({ length: QUERY_POOL_MAX }, () => dequeueFundedVoiceAttempt(saved))); }
    finally { release(); spy.mockRestore(); }
    const rows = await sql`select queue_state from public.campaign_queue where id in (${queueId}, ${sibling.queue})`;
    expect(rows).toHaveLength(2); expect(rows.every((row) => row.queue_state === "dequeued")).toBe(true);
    expect(await state()).toMatchObject({ credits: 96, holds: 0, ledger: 1 });
  });
  test.each([{ seconds: "42", credits: 96 }, { seconds: "61", credits: 91 }])("polling cannot settle missing final seconds before SDK $seconds", async ({ seconds, credits }) => {
    await send(); const root = firstCall(), child = await connectRecipient(); await status(child, "ringing"); delivery.jobs.length = 0;
    root.status = "completed"; root.endTime = new Date(); child.status = "completed"; child.duration = null; child.endTime = new Date();
    const { loader } = await import("../../app/routes/api+/call-status-poll.loader.server");
    const response = await asRouteResponse(loader(routeArgs(new Request(`https://manual-credit.example.test/api/call-status-poll?workspaceId=${workspaceId}&callSid=${child.sid}`))));
    expect(response.status).toBe(200); await expect(response.json()).resolves.toMatchObject({ status: "completed", callSid: child.sid });
    await ageForRecovery(); expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 0, pending: 1 });
    expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
    child.duration = seconds; await ageForRecovery(); expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 1, pending: 0 });
    expect(await state()).toMatchObject({ credits, holds: 0, ledger: 1 });
  });
  test("funded pending calls do not consume the legacy open-sync budget", async () => {
    await send(); const root = firstCall(), child = await connectRecipient(); await status(child, "ringing"); delivery.jobs.length = 0;
    await sql`update public.call set date_created = now() - interval '3 hours' where workspace = ${workspaceId}::uuid`;
    const legacy: ProviderCall = { ...child, sid: callSid(), parentCallSid: null, status: "completed", duration: "42", direction: "outbound-api", endTime: new Date() };
    provider.records.set(legacy.sid, legacy);
    await billing.processCallStatusWebhook({ sid: legacy.sid, account_sid: accountSid, to, from, direction: "outbound-api", status: "ringing", duration: "0" }, { workspaceId, skipBilling: true });
    await sql`update public.call set date_created = now() - interval '150 minutes' where sid = ${legacy.sid}`;
    const fundedBefore = await sql`select sid, status from public.call where sid in (${root.sid}, ${child.sid}) order by sid`;
    const { triggerTwilioOpenSync } = await import("@/lib/twilio-open-sync.server");
    expect(await triggerTwilioOpenSync({ workspaceId, callLimit: 2 })).toMatchObject({ ok: true });
    const [saved] = await sql`select status, duration from public.call where sid = ${legacy.sid}`; expect(saved).toMatchObject({ status: "completed", duration: "42" });
    const funded = await sql`select sid, status from public.call where sid in (${root.sid}, ${child.sid}) order by sid`; expect(funded).toEqual(fundedBefore);
    expect(await state()).toMatchObject({ credits: 96, holds: 1, ledger: 1 });
  });
  test.each(["poll", "open-sync"])("%s protects a funded child found through its parent before SID binding", async (path) => {
    await send(); const root = firstCall(), child = await connectRecipient();
    await billing.processCallStatusWebhook({ sid: child.sid, parent_call_sid: root.sid, account_sid: accountSid, to, from,
      direction: "outbound-dial", status: "ringing", duration: "0" }, { workspaceId, skipBilling: true });
    root.status = "completed"; root.endTime = new Date(); child.status = "completed"; child.duration = null; child.endTime = new Date();
    if (path === "poll") {
      const { loader } = await import("../../app/routes/api+/call-status-poll.loader.server");
      expect((await asRouteResponse(loader(routeArgs(new Request(`https://manual-credit.example.test/api/call-status-poll?workspaceId=${workspaceId}&callSid=${child.sid}`))))).status).toBe(200);
    } else {
      const { triggerTwilioOpenSync } = await import("@/lib/twilio-open-sync.server");
      expect(await triggerTwilioOpenSync({ workspaceId })).toMatchObject({ ok: true });
    }
    for (let scan = 0; scan < 2; scan++) {
      await ageForRecovery(); expect(await recovery.runVoiceCreditRecovery()).toMatchObject({ settled: 0, pending: 1 });
      expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
    }
  });
  test("zero credits still refuse before the provider", async () => {
    await sql`update public.workspace set credits = 0 where id = ${workspaceId}::uuid`;
    expect(await send()).toMatchObject({ status: 402 }); expect(provider.create).not.toHaveBeenCalled();
  });
  test("one credit cannot start the staffed first minute", async () => {
    await sql`update public.workspace set credits = 1 where id = ${workspaceId}::uuid`;
    expect(await send()).toMatchObject({ status: 402 }); expect(provider.create).not.toHaveBeenCalled();
  });
  test("fifty concurrent retries reserve one staffed operation before provider creation", async () => {
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    const intent = randomUUID(); const create = provider.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; }); const gate = new Promise<void>((resolve) => { release = resolve; });
    provider.create.mockImplementation(async (args) => { const row = await create(args); enter(); await gate; return row; });
    const sends = Array.from({ length: 50 }, () => send({ dial_intent_id: intent }));
    try { await entered; await new Promise((resolve) => setTimeout(resolve, 100)); } finally { release(); }
    await Promise.all(sends);
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toMatchObject({ credits: 4, holds: 1, ledger: 0 });
  });
  test("the authenticated actor owns the selected browser device", async () => {
    expect(await send({ user_id: otherActor })).toMatchObject({ status: 403 }); expect(provider.create).not.toHaveBeenCalled();
  });
  test("a supplied outreach attempt must belong to this workspace and contact", async () => {
    expect(await send({ outreach_id: String(foreignAttemptId) })).toMatchObject({ status: 404 }); expect(provider.create).not.toHaveBeenCalled();
  });
  test("the contact must match the owned queue entry", async () => {
    expect(await send({ contact_id: String(contactId + 100000) })).toMatchObject({ status: 404 }); expect(provider.create).not.toHaveBeenCalled();
  });
  test("a foreign queue ID keeps the uniform 404", async () => {
    expect(await send({ queue_id: String(foreignQueueId) })).toMatchObject({ status: 404 }); expect(provider.create).not.toHaveBeenCalled();
  });
  test("a supplied dial intent must be a UUID", async () => {
    expect(await send({ dial_intent_id: "invalid-intent" })).toMatchObject({ status: 400 }); expect(provider.create).not.toHaveBeenCalled();
  });
  test("an unverified phone device still refuses before the provider", async () => {
    expect(await send({ selected_device: "+16135550498" })).toMatchObject({ status: 400 }); expect(provider.create).not.toHaveBeenCalled();
  });
  test("a non-member workspace still returns 404", async () => {
    expect(await send({ workspace_id: foreignId })).toMatchObject({ status: 404 }); expect(provider.create).not.toHaveBeenCalled();
  });
  test("one completed recipient keeps its existing four-credit SID debit", async () => {
    expect(await send()).toMatchObject({ status: 200 }); expect(provider.create).toHaveBeenCalledOnce();
    const root = firstCall(), child = callSid();
    for (let delivery = 0; delivery < 2; delivery++) await billing.processCallStatusWebhook({
      sid: child, parent_call_sid: root.sid, account_sid: accountSid, to, from, direction: "outbound-dial", status: "completed", duration: "42",
    });
    expect(await state()).toMatchObject({ credits: 96, calls: 2, ledger: 1 });
  });
  test("the setup leg is not a second customer debit", async () => {
    expect(await send()).toMatchObject({ status: 200 });
    const root = firstCall();
    await billing.processCallStatusWebhook({ sid: root.sid, status: "completed", duration: "42" }, { workspaceId });
    expect(await state()).toMatchObject({ credits: 100, ledger: 0 });
  });
});
