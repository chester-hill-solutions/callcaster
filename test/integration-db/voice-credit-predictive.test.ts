import { randomUUID } from "node:crypto";
import postgres from "postgres";
import twilio from "twilio";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";

vi.hoisted(() => { process.env.TZ = "UTC"; process.env.BASE_URL = "https://predictive-credit.example.test"; });
const provider = vi.hoisted(() => ({ accountSid: "AC00000000000000000000000000005879", create: vi.fn(), fetch: vi.fn(),
  list: vi.fn(), events: vi.fn(), conferenceList: vi.fn(), update: vi.fn(), verifiedNumbers: ["+16135550299"] as string[] }));
const windowState = vi.hoisted(() => ({ allowed: true, blocked: new Set<string>() }));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  createWorkspaceTwilioInstance: async () => ({ accountSid: provider.accountSid,
    calls: Object.assign((sid: string) => ({ fetch: () => provider.fetch(sid), update: (args: unknown) => provider.update(sid, args),
      events: { list: () => provider.events(sid) } }), { create: provider.create, list: provider.list }),
    conferences: Object.assign(() => ({ update: provider.update }), { list: provider.conferenceList }),
  }),
}));
vi.mock("@/lib/recipient-calling-window", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/recipient-calling-window")>(),
  recipientCallingWindowStatus: (phone: string) => ({ allowed: windowState.allowed && !windowState.blocked.has(phone), timezone: "America/Toronto", reason: "owned_fixture_clock" }),
}));
vi.mock("@/lib/user-audio.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/user-audio.server")>(), getUserVerifiedAudioNumbers: async () => provider.verifiedNumbers,
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/object-storage.server")>(), createSignedObjectUrl: async () => "https://owned-assets.example.test/voicemail.mp3",
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(), emitQueueEvent: vi.fn(),
  emitPostgresChangeEvent: vi.fn(), emitPredictiveBroadcast: vi.fn(), emitTransactionHistoryInsertEvent: vi.fn(),
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID(), from = "+16135550290";
const accountSid = provider.accountSid, room = `${actor}~${randomUUID()}`;
let sql: postgres.Sql, campaignId: number;
let dialer: typeof import("@/lib/auto-dial.server");
let start: typeof import("@/lib/auto-dial-start.server");
let core: typeof import("@/server/voice-credit-reservation.server");
const sid = () => `CA${randomUUID().replaceAll("-", "")}`;
vi.mock("@/lib/auth.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/auth.server")>(),
  getSession: async () => ({ user: { id: actor }, headers: new Headers() }),
}));

describe("predictive and conference funding (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned database required");
    sql = postgres(url, { max: 4, onnotice: () => {} });
    await sql`insert into public."user" (id, username) values (${actor}::uuid, ${`predictive-credit-${actor}@example.test`})`;
    await sql`insert into public.workspace (id, name, credits, twilio_data) values
      (${workspaceId}::uuid, 'Owned predictive credit fixture', 100, ${sql.json({ sid: accountSid, authToken: "owned-predictive-token" })}),
      (${foreignId}::uuid, 'Foreign predictive control', 100, '{}'::jsonb)`;
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`predictive-credit:${workspaceId}:${actor}`}, ${workspaceId}, ${actor}, 'owner')`;
    await sql`insert into public.workspace_number (workspace, phone_number, type, capabilities)
      values (${workspaceId}::uuid, ${from}, 'local', '{"voice":true}'::jsonb)`;
    const [campaign] = await sql`insert into public.campaign (workspace, title, type, status, caller_id)
      values (${workspaceId}::uuid, 'Owned predictive campaign', 'live_call', 'running', ${from}) returning id`;
    campaignId = Number(campaign.id);
    const schedule = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) =>
      [day, { active: true, intervals: [{ start: "00:00", end: "12:00" }, { start: "12:00", end: "00:00" }] }]));
    await sql`update public.campaign set schedule = ${sql.json(schedule)}, start_date = '2000-01-01', end_date = '2100-01-01' where id = ${campaignId}`;
    for (let index = 0; index < 52; index++) {
      const [contact] = await sql`insert into public.contact (workspace, firstname, phone)
        values (${workspaceId}::uuid, 'Owned recipient', ${`+1613555${String(index).padStart(4, "0")}`}) returning id`;
      await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, queue_order)
        values (${workspaceId}::uuid, ${campaignId}, ${contact.id}, 'queued', ${index})`;
    }
    dialer = await import("@/lib/auto-dial.server"); start = await import("@/lib/auto-dial-start.server");
    core = await import("@/server/voice-credit-reservation.server");
  });
  beforeEach(async () => {
    vi.clearAllMocks(); provider.accountSid = accountSid; provider.verifiedNumbers = ["+16135550299"]; windowState.allowed = true; windowState.blocked.clear();
    provider.create.mockReset().mockImplementation(async (args: { to: string; from: string; url: string; statusCallback?: string }) => ({
      ...args, sid: sid(), accountSid, direction: "outbound-api", parentCallSid: null, status: "queued", duration: null,
      dateCreated: new Date(), dateUpdated: new Date(), startTime: null, endTime: null,
    }));
    provider.conferenceList.mockReset().mockResolvedValue([{ sid: "CF00000000000000000000000000005879", friendlyName: room, status: "in-progress" }]);
    provider.update.mockReset().mockResolvedValue({}); provider.list.mockReset().mockResolvedValue([]);
    provider.events.mockReset().mockResolvedValue([]);
    await sql`delete from public.predictive_machine_operation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
    await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_dialer_intent where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    await sql`update public.workspace set credits = 100 where id = ${workspaceId}::uuid`;
    await sql`update public.campaign set status = 'running', voicemail_drop_enabled = false, voicemail_file = null where id = ${campaignId}`;
    await sql`update public.campaign_queue set queue_state = 'queued', assigned_to_user_id = null, dequeued_at = null,
      dequeued_by = null, dequeued_reason = null, claimed_at = null, provider_status = null,
      attempts = 0, attempt_count = 0, last_attempt_at = null, last_attempt_error = null,
      dispatch_generation = gen_random_uuid(), voice_reservation_id = null where workspace = ${workspaceId}::uuid`;
  });
  afterEach(async () => {
    const [foreign] = await sql`select credits from public.workspace where id = ${foreignId}::uuid`; expect(foreign.credits).toBe(100);
  });
  afterAll(async () => {
    try {
      if (sql) {
        await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public."user" where id = ${actor}::uuid`;
      }
    } finally {
      await sql?.end(); if (dialer) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  const turn = () => dialer.runAutoDialerTurn({ user_id: actor, campaign_id: campaignId, workspace_id: workspaceId, conference_id: room });
  const setup = (dialIntentId?: string) => start.startAutoDialConference({ userId: actor, campaignId, workspaceId, callerId: from, selectedDevice: "computer", dialIntentId });
  test.each([false, true])("a captured Stop blocks only its delayed Start, later new intent: %s", async freshIntent => {
    const stoppedIntent = randomUUID(), conferenceName = `${actor}~${stoppedIntent}`;
    provider.conferenceList.mockResolvedValue([]);
    const { action } = await import("@/routes/api+/auto-dial/end.action.server");
    const before = await state();
    const args = { ...routeArgs(new Request("https://predictive-credit.example.test/api/auto-dial/end", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, conferenceName, dial_intent_id: stoppedIntent, campaignId }),
    })) };
    const stopped = await asRouteResponse(action(args));
    expect(stopped.status).toBe(200);
    await expect(stopped.json()).resolves.toMatchObject({ success: true });
    expect(await state()).toEqual(before); expect(provider.create).not.toHaveBeenCalled();
    const later = await setup(freshIntent ? randomUUID() : stoppedIntent);
    if (freshIntent) {
      expect(later.ok).toBe(true); expect(provider.create).toHaveBeenCalledTimes(1);
    } else {
      expect(provider.create).not.toHaveBeenCalled(); expect(later.ok).toBe(false);
    }
  });
  test("a captured browser Stop ends its accepted setup and returns the uncalled contact before a new Start", async () => {
    const intent = randomUUID(), started = await setup(intent); expect(started.ok).toBe(true);
    const physical = await provider.create.mock.results[0].value;
    provider.fetch.mockResolvedValue(physical); provider.conferenceList.mockResolvedValue([]);
    provider.update.mockImplementation(async (id: string, values: { status: string }) => {
      expect(id).toBe(physical.sid); physical.status = values.status; physical.endTime = new Date(); return physical;
    });
    const { action } = await import("@/routes/api+/auto-dial/end.action.server");
    const args = { ...routeArgs(new Request("https://predictive-credit.example.test/api/auto-dial/end", { method: "POST",
      headers: { "Content-Type": "application/json", "X-Callcaster-Audio-Actor": actor },
      body: JSON.stringify({ workspaceId, campaignId, dial_intent_id: intent }),
    })) };
    const response = await asRouteResponse(action(args)); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ stop_state: "stopped", intent_id: intent });
    expect(physical.status).toBe("canceled"); expect(await state()).toEqual({ credits: 100, holds: 0, ledger: 0 });
    const [old] = await sql`select queue_id from public.workspace_voice_reservation where setup_sid = ${physical.sid}`;
    const [queue] = await sql`select queue_state, assigned_to_user_id from public.campaign_queue where id = ${old.queue_id}`;
    expect(queue).toMatchObject({ queue_state: "queued", assigned_to_user_id: null });
    expect(await setup(randomUUID())).toMatchObject({ ok: true }); expect(provider.create).toHaveBeenCalledTimes(2);
  });
  async function state() {
    const [row] = await sql`select credits,
      (select count(*)::int from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid and state in ('reserved','creating','active')) holds,
      (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) ledger
      from public.workspace where id = ${workspaceId}::uuid`;
    return row;
  }
  async function statusCallback(url: string, callSid: string, to: string, status = "completed", seconds: string | null = "42") {
    const params = { AccountSid: accountSid, CallSid: callSid, To: to, From: from, Direction: "outbound-api", CallStatus: status,
      ...(seconds === null ? {} : { CallDuration: seconds }) };
    const request = new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": twilio.getExpectedTwilioSignature("owned-predictive-token", url, params) }, body: new URLSearchParams(params) });
    const { action } = await import("../../app/routes/api+/auto-dial/status.action.server");
    return asRouteResponse(action(routeArgs(request)));
  }
  async function signedRoute(url: string, params: Record<string, string>, voice = false) {
    const request = new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": twilio.getExpectedTwilioSignature("owned-predictive-token", url, params) }, body: new URLSearchParams(params) });
    const route = voice ? await import("../../app/routes/api+/auto-dial/$roomId.action.server") : await import("../../app/routes/api+/auto-dial/status.action.server");
    return asRouteResponse(route.action(routeArgs(request, voice ? { roomId: decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "") } : {})));
  }
  async function connectAgent() {
    const result = await setup(); if (!result.ok) throw new Error("Owned conference required");
    const [reservation] = await sql`select setup_sid from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    const sent = provider.create.mock.calls[0][0];
    const response = await signedRoute(sent.url, { AccountSid: accountSid, CallSid: reservation.setup_sid, To: sent.to, From: from,
      Direction: "outbound-api", CallStatus: "in-progress", Called: sent.to }, true);
    expect(response.status).toBe(200);
    const xml = await response.text(), callback = xml.match(/<Conference[^>]*statusCallback="([^"]+)"/);
    if (!callback) throw new Error(`Conference callback missing: ${xml}`);
    return { setupSid: reservation.setup_sid, conferenceName: result.conferenceName, url: callback[1].replaceAll("&amp;", "&") };
  }
  function joinParams(agent: { setupSid: string; conferenceName: string }) {
    return { AccountSid: accountSid, CallSid: agent.setupSid, ConferenceSid: "CF00000000000000000000000000005879",
      FriendlyName: agent.conferenceName, StatusCallbackEvent: "participant-join", Timestamp: new Date().toISOString() };
  }
  test("a genuine browser-agent hangup saves Stop before failed room I/O and blocks late sends", async () => {
    const agent = await connectAgent();
    provider.conferenceList.mockImplementation(async () => {
      const [control] = await sql`select stop_requested_at from public.workspace_voice_dialer_intent
        where workspace = ${workspaceId}::uuid and conference_id = ${agent.conferenceName}`;
      expect(control.stop_requested_at).not.toBeNull(); throw new Error("Owned room cleanup unavailable");
    });
    expect((await signedRoute(agent.url, { ...joinParams(agent), StatusCallbackEvent: "participant-leave",
      ReasonParticipantLeft: "participant_hung_up" })).status).toBe(500);
    provider.conferenceList.mockResolvedValue([{ sid: "CF00000000000000000000000000005879", accountSid,
      friendlyName: agent.conferenceName, status: "in-progress" }]);
    expect(await dialer.runAutoDialerTurn({ workspace_id: workspaceId, user_id: actor, campaign_id: campaignId,
      conference_id: agent.conferenceName })).toMatchObject({ success: false, failureKind: "stopped" });
    expect((await signedRoute(agent.url, joinParams(agent))).status).toBe(200);
    expect(provider.create).toHaveBeenCalledTimes(1); expect((await state()).ledger).toBe(0);
  });
  test("terminal browser-agent status saves Stop even when conference leave is missing", async () => {
    const agent = await connectAgent(), sent = provider.create.mock.calls[0][0];
    expect((await statusCallback(sent.statusCallback, agent.setupSid, sent.to)).status).toBe(200);
    const [control] = await sql`select stop_requested_at from public.workspace_voice_dialer_intent
      where workspace = ${workspaceId}::uuid and conference_id = ${agent.conferenceName}`;
    expect(control.stop_requested_at).not.toBeNull();
    provider.conferenceList.mockResolvedValue([{ sid: "CF00000000000000000000000000005879", accountSid,
      friendlyName: agent.conferenceName, status: "in-progress" }]);
    expect(await dialer.runAutoDialerTurn({ workspace_id: workspaceId, user_id: actor, campaign_id: campaignId,
      conference_id: agent.conferenceName })).toMatchObject({ success: false, failureKind: "stopped" });
    expect(provider.create).toHaveBeenCalledTimes(1);
  });
  test('legacy funded browser answers share one human owner and keep the extra contact queued', async () => {
    await turn(); await turn();
    const roots = await sql`select id, provider_sid, recipient, voice_url, queue_id from public.workspace_voice_reservation
      where workspace = ${workspaceId}::uuid order by created_at, id`;
    expect(roots).toHaveLength(2);
    const replies = await Promise.all(roots.map(root => signedRoute(root.voice_url, { AccountSid: accountSid,
      CallSid: root.provider_sid, To: root.recipient, From: from, Direction: 'outbound-api', CallStatus: 'in-progress', AnsweredBy: 'human' }, true)));
    expect(replies.map(reply => reply.status)).toEqual([200, 200]);
    const xml = await Promise.all(replies.map(reply => reply.text()));
    expect(xml.filter(value => value.includes('<Conference'))).toHaveLength(1);
    expect(xml.filter(value => value.includes('<Hangup'))).toHaveLength(1);
    const [extra] = await sql`select id, queue_id, queue_generation from public.workspace_voice_reservation
      where workspace = ${workspaceId}::uuid and human_state = 'refused'`;
    const [queue] = await sql`select queue_state, dequeued_at, dispatch_generation, voice_reservation_id from public.campaign_queue where id = ${extra.queue_id}`;
    expect(queue).toMatchObject({ queue_state: 'queued', dequeued_at: null, voice_reservation_id: null });
    expect(queue.dispatch_generation).not.toBe(extra.queue_generation);
    expect(await state()).toEqual({ credits: 100, holds: 2, ledger: 0 }); expect(provider.update).not.toHaveBeenCalled();
  });
  test("zero credits refuse predictive recipients before the provider", async () => {
    await sql`update public.workspace set credits = 0 where id = ${workspaceId}::uuid`; await turn();
    expect(provider.create).not.toHaveBeenCalled(); expect(await state()).toEqual({ credits: 0, holds: 0, ledger: 0 });
  });
  test("one credit cannot start a staffed predictive recipient", async () => {
    await sql`update public.workspace set credits = 1 where id = ${workspaceId}::uuid`; await turn();
    expect(provider.create).not.toHaveBeenCalled(); expect(await state()).toEqual({ credits: 1, holds: 0, ledger: 0 });
  });
  test("fifty concurrent turns can fund one recipient with four credits", async () => {
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    await Promise.all(Array.from({ length: 50 }, () => turn()));
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toEqual({ credits: 4, holds: 1, ledger: 0 });
  });
  test("predictive turns respect existing shared voice holds", async () => {
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    expect(await core.reserveVoiceCredits({ workspaceId, kind: "staffed", accountSid, to: "+16135550298", from, operationKey: randomUUID() })).toMatchObject({ ok: true });
    await turn(); expect(provider.create).not.toHaveBeenCalled(); expect(await state()).toEqual({ credits: 4, holds: 1, ledger: 0 });
  });
  test.each([500, 408])("HTTP %s retains funded uncertainty before a later turn", async (status) => {
    provider.create.mockRejectedValueOnce({ status }); await turn();
    expect(await state()).toMatchObject({ credits: 100, holds: 1, ledger: 0 });
    const [row] = await sql`select count(*)::int count from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid and last_error is not null`;
    expect(row.count).toBe(1);
  });
  test("a network error retains a funded predictive reservation", async () => {
    provider.create.mockRejectedValueOnce(new Error("Owned predictive timeout")); await turn();
    expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
  });
  test("out-of-window selection leaves claims queued and does not drain the campaign", async () => {
    windowState.allowed = false; await turn(); expect(provider.create).not.toHaveBeenCalled();
    expect((await sql`select count(*)::int count from public.campaign_queue where workspace=${workspaceId}::uuid and queue_state='queued'`)[0].count).toBe(52);
    expect((await sql`select status from public.campaign where id=${campaignId}`)[0].status).toBe("running");
    expect(await sql`select id from public.outreach_attempt where workspace=${workspaceId}::uuid`).toHaveLength(0);
  });
  test("selection reaches the next eligible recipient before releasing a skipped claim", async () => {
    windowState.blocked.add("+16135550000"); await turn();
    expect(provider.create).toHaveBeenCalledOnce(); expect(provider.create.mock.calls[0][0].to).toBe("+16135550001");
    const [skipped] = await sql`select queue_state, assigned_to_user_id from public.campaign_queue where workspace=${workspaceId}::uuid and queue_order=0`;
    expect(skipped).toEqual({ queue_state: "queued", assigned_to_user_id: null });
  });
  test("opted-out recipients dequeue inside the claim transaction and are never dialed", async () => {
    await sql`update public.contact set opt_out=true where workspace=${workspaceId}::uuid and phone='+16135550000'`;
    try {
      await turn(); expect(provider.create).toHaveBeenCalledOnce(); expect(provider.create.mock.calls[0][0].to).toBe("+16135550001");
      const [skipped] = await sql`select queue_state, dequeued_reason from public.campaign_queue where workspace=${workspaceId}::uuid and queue_order=0`;
      expect(skipped).toEqual({ queue_state: "dequeued", dequeued_reason: "Contact opted out" });
    } finally { await sql`update public.contact set opt_out=false where workspace=${workspaceId}::uuid`; }
  });
  test("an actually drained unfunded queue completes the campaign", async () => {
    await sql`update public.campaign_queue set queue_state='dequeued', dequeued_at=now() where workspace=${workspaceId}::uuid`;
    await turn(); expect(provider.create).not.toHaveBeenCalled();
    expect((await sql`select status from public.campaign where id=${campaignId}`)[0].status).toBe("complete");
  });
  test("a signed terminal callback can arrive before the provider response", async () => {
    const accepted = sid();
    provider.create.mockImplementationOnce(async (args: { to: string; from: string; statusCallback: string }) => {
      expect((await statusCallback(args.statusCallback, accepted, args.to)).status).toBe(200);
      return { ...args, sid: accepted, accountSid, direction: "outbound-api", parentCallSid: null, status: "queued", duration: null };
    });
    expect(await turn()).toMatchObject({ success: true });
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toEqual({ credits: 96, holds: 0, ledger: 1 });
    const [saved] = await sql`select status, duration from public.call where sid = ${accepted}`;
    expect(saved).toEqual({ status: "completed", duration: "42" });
  });
  test("missing final seconds retain funding until a complete receipt arrives", async () => {
    await turn(); const sent = provider.create.mock.calls[0][0];
    const [saved] = await sql`select sid from public.call where workspace = ${workspaceId}::uuid`;
    expect((await statusCallback(sent.statusCallback, saved.sid, sent.to, "completed", null)).status).toBe(200);
    expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
    expect((await statusCallback(sent.statusCallback, saved.sid, sent.to)).status).toBe(200);
    expect(await state()).toEqual({ credits: 96, holds: 0, ledger: 1 });
  });
  test("a later terminal value cannot change the frozen receipt or its outcome job", async () => {
    await turn(); const sent = provider.create.mock.calls[0][0];
    const [saved] = await sql`select sid from public.call where workspace = ${workspaceId}::uuid`;
    expect((await statusCallback(sent.statusCallback, saved.sid, sent.to)).status).toBe(200);
    expect((await statusCallback(sent.statusCallback, saved.sid, sent.to, "busy", "0")).status).toBe(200);
    const [receipt] = await sql`select terminal_status, terminal_duration from public.workspace_voice_reservation where provider_sid = ${saved.sid}`;
    expect(receipt).toEqual({ terminal_status: "completed", terminal_duration: "42" });
    const outcomes = await sql`select params from public.job where workspace_id = ${workspaceId}::uuid and type = 'call_status_side_effects'`;
    expect(outcomes).toHaveLength(1); expect(outcomes[0].params.twilioParams).toMatchObject({ CallStatus: "completed", CallDuration: "42" });
    expect(await state()).toEqual({ credits: 96, holds: 0, ledger: 1 });
    expect(await sql`select id from public.predictive_machine_operation where workspace = ${workspaceId}::uuid`).toHaveLength(0);
  });
  test("replayed failed callbacks create one durable continuation and one funded successor", async () => {
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    await turn(); const sent = provider.create.mock.calls[0][0];
    const [saved] = await sql`select sid from public.call where workspace = ${workspaceId}::uuid`;
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => statusCallback(sent.statusCallback, saved.sid, sent.to, i % 2 ? "failed" : "busy", "0")));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const operations = await sql`select id from public.predictive_machine_operation where workspace = ${workspaceId}::uuid`;
    expect(operations).toHaveLength(1);
    const { runPredictiveMachineContinuation } = await import("@/lib/predictive-machine.server");
    await runPredictiveMachineContinuation({ workspaceId, operationId: operations[0].id });
    await runPredictiveMachineContinuation({ workspaceId, operationId: operations[0].id });
    expect(provider.create).toHaveBeenCalledTimes(2);
    expect(await state()).toEqual({ credits: 4, holds: 1, ledger: 0 });
    const [journal] = await sql`select successor_call_sid, successor_voice_url, successor_status_url from public.predictive_machine_operation where id = ${operations[0].id}::uuid`;
    const [funding] = await sql`select provider_sid, voice_url, status_callback from public.workspace_voice_reservation where predictive_operation_id = ${operations[0].id}::uuid`;
    expect(journal).toEqual({ successor_call_sid: funding.provider_sid, successor_voice_url: funding.voice_url, successor_status_url: funding.status_callback });
  });
  test("one affordable recipient retains the staffed SID debit exactly once", async () => {
    await turn(); const [call] = await sql`select sid, "to", "from" from public.call where workspace = ${workspaceId}::uuid limit 1`;
    if (!call) throw new Error("Owned predictive recipient required");
    const { action } = await import("../../app/routes/api+/auto-dial/status.action.server");
    const url = provider.create.mock.calls[0]?.[0]?.statusCallback; if (!url) throw new Error("Saved provider status URL required");
    const params = { AccountSid: accountSid, CallSid: call.sid, To: call.to, From: call.from, Direction: "outbound-api", CallStatus: "completed", CallDuration: "42" };
    for (let attempt = 0; attempt < 2; attempt++) {
      const request = new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": twilio.getExpectedTwilioSignature("owned-predictive-token", url, params) }, body: new URLSearchParams(params) });
      expect((await asRouteResponse(action(routeArgs(request)))).status).toBe(200);
    }
    expect(await state()).toEqual({ credits: 96, holds: 0, ledger: 1 });
  });
  test("transactional predictive admission reserves one affordable claim", async () => {
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    const { admitPredictiveVoiceRecipient } = await import("@/server/predictive-voice-admission.server");
    const admitted = await Promise.all(Array.from({ length: 50 }, () => admitPredictiveVoiceRecipient({ workspaceId, campaignId,
      userId: actor, conferenceId: room, accountSid })));
    expect(admitted.filter((result) => result.ok)).toHaveLength(1);
    const [claims] = await sql`select count(*)::int count from public.campaign_queue where workspace = ${workspaceId}::uuid and queue_state = 'assigned'`;
    const [attempts] = await sql`select count(*)::int count from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    expect(claims.count).toBe(1); expect(attempts.count).toBe(1); expect(await state()).toEqual({ credits: 4, holds: 1, ledger: 0 });
    expect(provider.create).not.toHaveBeenCalled();
  });
  test("a refused transactional admission leaves no claim or outreach", async () => {
    await sql`update public.workspace set credits = 1 where id = ${workspaceId}::uuid`;
    const { admitPredictiveVoiceRecipient } = await import("@/server/predictive-voice-admission.server");
    expect(await admitPredictiveVoiceRecipient({ workspaceId, campaignId, userId: actor, conferenceId: room, accountSid })).toMatchObject({ ok: false, reason: "insufficient_credits" });
    const [claims] = await sql`select count(*)::int count from public.campaign_queue where workspace = ${workspaceId}::uuid and queue_state = 'assigned'`;
    const [attempts] = await sql`select count(*)::int count from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    expect(claims.count).toBe(0); expect(attempts.count).toBe(0); expect(await state()).toEqual({ credits: 1, holds: 0, ledger: 0 });
  });
  test("both predictive journals must keep the final credit-tagged URLs", async () => {
    const { admitPredictiveVoiceRecipient } = await import("@/server/predictive-voice-admission.server");
    await expect(admitPredictiveVoiceRecipient({ workspaceId, campaignId, userId: actor, conferenceId: room, accountSid,
      prepareSend: async () => ({ voiceUrl: "https://predictive-credit.example.test/api/auto-dial/unfunded", statusCallback: "https://predictive-credit.example.test/api/auto-dial/status" }),
    })).rejects.toThrow("lost funding identity");
    expect(await state()).toEqual({ credits: 100, holds: 0, ledger: 0 });
    const [claims] = await sql`select count(*)::int count from public.campaign_queue where workspace = ${workspaceId}::uuid and queue_state = 'assigned'`;
    const [attempts] = await sql`select count(*)::int count from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    expect(claims.count).toBe(0); expect(attempts.count).toBe(0); expect(provider.create).not.toHaveBeenCalled();
  });
  test("a direct accepted SID survives call-row failure before recovery", async () => {
    const name = `owned_predictive_fault_${randomUUID().replaceAll("-", "")}`;
    await sql.unsafe(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $fault$
      BEGIN IF NEW.workspace = '${workspaceId}'::uuid THEN RAISE EXCEPTION 'owned predictive call fault'; END IF; RETURN NEW; END; $fault$`);
    let acceptedSid = "";
    try {
      await sql.unsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON public.call FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
      const { dispatchReservedVoiceCall } = await import("@/lib/voice-credit-dispatch.server");
      const result = await dispatchReservedVoiceCall({ workspaceId, kind: "staffed", accountSid, to: "+16135550298", from,
        operationKey: randomUUID(), voiceUrl: "https://predictive-credit.example.test/api/auto-dial/owned",
        statusCallback: "https://predictive-credit.example.test/api/auto-dial/status",
        create: async (urls) => { const saved = await provider.create({ to: "+16135550298", from, url: urls.voiceUrl, statusCallback: urls.statusCallback }); acceptedSid = saved.sid; return saved; },
      });
      expect(result).toMatchObject({ ok: true, callSid: acceptedSid });
      const [saved] = await sql`select provider_sid from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
      expect(saved.provider_sid).toBe(acceptedSid); expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
    } finally { await sql.unsafe(`DROP TRIGGER IF EXISTS ${name} ON public.call`); await sql.unsafe(`DROP FUNCTION public.${name}()`); }
    expect(provider.create).toHaveBeenCalledOnce();
  });
  test("one credit cannot create the conference agent setup", async () => {
    await sql`update public.workspace set credits = 1 where id = ${workspaceId}::uuid`;
    expect(await setup()).toMatchObject({ ok: false, status: 402 }); expect(provider.create).not.toHaveBeenCalled();
  });
  test("four-credit conference setup reserves the first recipient exactly once", async () => {
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    expect(await setup()).toMatchObject({ ok: true }); expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toEqual({ credits: 4, holds: 1, ledger: 0 });
  });
  test("a repeated start intent selects one first recipient and sends one setup", async () => {
    const intent = randomUUID();
    const results = await Promise.all(Array.from({ length: 12 }, () => setup(intent)));
    expect(results.some((result) => result.ok)).toBe(true); expect(provider.create).toHaveBeenCalledOnce();
    expect(await setup(intent)).toMatchObject({ ok: true, conferenceName: `${actor}~${intent}` });
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
    expect(await sql`select id from public.outreach_attempt where workspace = ${workspaceId}::uuid`).toHaveLength(1);
  });
  test("agent join sends the already funded first recipient once, after conference TwiML", async () => {
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    const agent = await connectAgent(); expect(provider.create).toHaveBeenCalledOnce();
    const responses = await Promise.all(Array.from({ length: 12 }, () => signedRoute(agent.url, joinParams(agent))));
    expect(responses.every((response) => response.status === 200)).toBe(true); expect(provider.create).toHaveBeenCalledTimes(2);
    expect(await state()).toEqual({ credits: 4, holds: 1, ledger: 0 });
    const [recipient] = await sql`select provider_sid from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect((await signedRoute(agent.url, { ...joinParams(agent), CallSid: recipient.provider_sid })).status).toBe(200);
    const [saved] = await sql`select direction, parent_call_sid from public.call where sid = ${recipient.provider_sid}`;
    expect(saved).toEqual({ direction: "outbound-api", parent_call_sid: null });
  });
  test("conference events cannot supply final recipient seconds", async () => {
    const agent = await connectAgent(); await signedRoute(agent.url, joinParams(agent));
    const [recipient] = await sql`select provider_sid from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    const response = await signedRoute(agent.url, { ...joinParams(agent), CallSid: recipient.provider_sid,
      StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up", Duration: "999", CallDuration: "999" });
    expect(response.status).toBe(200); expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
    const [saved] = await sql`select duration from public.call where sid = ${recipient.provider_sid}`;
    expect(saved.duration).toBeNull();
    const sent = provider.create.mock.calls[1][0];
    expect((await statusCallback(sent.statusCallback, recipient.provider_sid, sent.to)).status).toBe(200);
    expect(await state()).toEqual({ credits: 96, holds: 0, ledger: 1 });
  });
  test("a signed event for a different conference cannot start a recipient", async () => {
    const agent = await connectAgent();
    expect((await signedRoute(agent.url, { ...joinParams(agent), FriendlyName: `${actor}~${randomUUID()}` })).status).toBe(403);
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
  });
  test("funded recipient identity overrides the legacy agent phone heuristic", async () => {
    await sql`update public.contact set phone=${from} where id=(select contact_id from public.campaign_queue where workspace=${workspaceId}::uuid and queue_order=0)`;
    try {
      await turn(); const sent = provider.create.mock.calls[0][0];
      const [recipient] = await sql`select provider_sid from public.workspace_voice_reservation where workspace=${workspaceId}::uuid`;
      const response = await signedRoute(sent.url, { AccountSid: accountSid, CallSid: recipient.provider_sid, To: from, From: from,
        Direction: "outbound-api", CallStatus: "in-progress", Called: from, AnsweredBy: "human" }, true);
      expect(response.status).toBe(200); expect(await response.text()).toContain('endConferenceOnExit="true"');
      expect(provider.create).toHaveBeenCalledOnce();
    } finally { await sql`update public.contact set phone='+16135550000' where id=(select contact_id from public.campaign_queue where workspace=${workspaceId}::uuid and queue_order=0)`; }
  });
  test("later recipients use the first participant callback owner after its recipient settles", async () => {
    const agent = await connectAgent(); await signedRoute(agent.url, joinParams(agent));
    const first = provider.create.mock.calls[1][0];
    const [original] = await sql`select provider_sid from public.workspace_voice_reservation where workspace=${workspaceId}::uuid`;
    await statusCallback(first.statusCallback, original.provider_sid, first.to, "busy", "0");
    const [operation] = await sql`select id from public.predictive_machine_operation where workspace=${workspaceId}::uuid`;
    const { runPredictiveMachineContinuation } = await import("@/lib/predictive-machine.server");
    await runPredictiveMachineContinuation({ workspaceId, operationId: operation.id });
    const [next] = await sql`select provider_sid from public.workspace_voice_reservation where predictive_operation_id=${operation.id}::uuid`;
    expect((await signedRoute(agent.url, { ...joinParams(agent), CallSid: next.provider_sid })).status).toBe(200);
    expect((await signedRoute(agent.url, { ...joinParams(agent), CallSid: next.provider_sid, ConferenceSid: 'CF00000000000000000000000000005880' })).status).toBe(403);
    expect(provider.create).toHaveBeenCalledTimes(3); expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
  });
  test.each([false, true])("a rejected first recipient keeps setup funded until verified termination (stop fails: %s)", async (stopFails) => {
    const agent = await connectAgent(), setupRequest = provider.create.mock.calls[0][0];
    if (stopFails) provider.update.mockRejectedValueOnce(new Error("Owned setup stop timeout"));
    provider.create.mockRejectedValueOnce({ status: 400 });
    expect((await signedRoute(agent.url, joinParams(agent))).status).toBe(500);
    expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
    const [refused] = await sql`select recipient_refused_at, recipient_instruction_issued_at from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(refused.recipient_refused_at).not.toBeNull(); expect(refused.recipient_instruction_issued_at).not.toBeNull();
    expect(provider.update).toHaveBeenCalledWith(agent.setupSid, { status: "completed" });
    await signedRoute(agent.url, joinParams(agent)); expect(provider.create).toHaveBeenCalledTimes(2);
    expect((await statusCallback(setupRequest.statusCallback, agent.setupSid, setupRequest.to)).status).toBe(200);
    expect(await state()).toEqual({ credits: 100, holds: 0, ledger: 0 });
    const [claim] = await sql`select queue_state, assigned_to_user_id from public.campaign_queue where workspace = ${workspaceId}::uuid and voice_reservation_id is not null`;
    expect(claim).toEqual({ queue_state: "queued", assigned_to_user_id: null });
  });
  test("a window that closes while the agent rings refuses the first recipient", async () => {
    const agent = await connectAgent(), setupRequest = provider.create.mock.calls[0][0]; windowState.allowed = false;
    expect((await signedRoute(agent.url, joinParams(agent))).status).toBe(200);
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
    windowState.allowed = true;
    await signedRoute(agent.url, joinParams(agent)); expect(provider.create).toHaveBeenCalledOnce();
    await statusCallback(setupRequest.statusCallback, agent.setupSid, setupRequest.to);
    expect(await state()).toEqual({ credits: 100, holds: 0, ledger: 0 });
  });
  test("a campaign paused during setup stops safely without changing sweep-owned status", async () => {
    const agent = await connectAgent(), setupRequest = provider.create.mock.calls[0][0];
    await sql`update public.campaign set status = 'waiting' where id = ${campaignId}`;
    expect((await signedRoute(agent.url, joinParams(agent))).status).toBe(200); expect(provider.create).toHaveBeenCalledOnce();
    await statusCallback(setupRequest.statusCallback, agent.setupSid, setupRequest.to);
    expect(await state()).toEqual({ credits: 100, holds: 0, ledger: 0 });
    expect((await sql`select status from public.campaign where id = ${campaignId}`)[0].status).toBe("waiting");
  });
  test("accepted phone intent replay survives later removal of phone verification", async () => {
    const input = { userId: actor, campaignId, workspaceId, callerId: from, selectedDevice: "+16135550299", dialIntentId: randomUUID() };
    expect(await start.startAutoDialConference(input)).toMatchObject({ ok: true });
    provider.verifiedNumbers = [];
    expect(await start.startAutoDialConference(input)).toMatchObject({ ok: true }); expect(provider.create).toHaveBeenCalledOnce();
  });
  test("funded AMD wait and complete callbacks retain both operation and credit identity", async () => {
    await sql`update public.campaign set voicemail_drop_enabled = true, voicemail_file = 'owned.mp3' where id = ${campaignId}`;
    await turn(); const sent = provider.create.mock.calls[0][0];
    const [reservation] = await sql`select id, provider_sid, voice_url from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    const params = { AccountSid: accountSid, CallSid: reservation.provider_sid, To: sent.to, From: from,
      Direction: "outbound-api", CallStatus: "in-progress", Called: sent.to, AnsweredBy: "machine_end_beep" };
    const initial = await signedRoute(sent.url, params, true); expect(initial.status).toBe(200); expect(await initial.text()).toContain("<Play>");
    const repeated = await signedRoute(sent.url, params, true), xml = await repeated.text();
    const redirect = xml.match(/<Redirect[^>]*>([^<]+)<\/Redirect>/); if (!redirect) throw new Error("Funded machine wait URL required");
    const waitUrl = redirect[1].replaceAll("&amp;", "&"), complete = new URL(waitUrl); complete.searchParams.set("machine", "complete");
    expect(new URL(waitUrl).searchParams.get("credit_reservation")).toBe(reservation.id);
    expect((await signedRoute(waitUrl, params, true)).status).toBe(200);
    expect((await signedRoute(complete.href, params, true)).status).toBe(200);
    complete.searchParams.set("operation", randomUUID());
    expect((await signedRoute(complete.href, params, true)).status).toBe(403);
    expect((await sql`select voice_url from public.workspace_voice_reservation where id = ${reservation.id}::uuid`)[0].voice_url).toBe(reservation.voice_url);
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
  });
  test("a failed outcome insert can retry after the call row is already terminal", async () => {
    await turn(); const sent = provider.create.mock.calls[0][0];
    const [saved] = await sql`select sid from public.call where workspace = ${workspaceId}::uuid`;
    const name = `owned_predictive_job_fault_${randomUUID().replaceAll("-", "")}`;
    await sql.unsafe(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $fault$
      BEGIN IF NEW.workspace_id = '${workspaceId}'::uuid AND NEW.type = 'call_status_side_effects' THEN RAISE EXCEPTION 'owned outcome fault'; END IF; RETURN NEW; END; $fault$`);
    try {
      await sql.unsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON public.job FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
      expect((await statusCallback(sent.statusCallback, saved.sid, sent.to)).status).toBe(500);
      const [receipt] = await sql`select terminal_status from public.workspace_voice_reservation where provider_sid = ${saved.sid}`;
      expect(receipt.terminal_status).toBeNull(); expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
    } finally { await sql.unsafe(`DROP TRIGGER IF EXISTS ${name} ON public.job`); await sql.unsafe(`DROP FUNCTION public.${name}()`); }
    expect((await statusCallback(sent.statusCallback, saved.sid, sent.to)).status).toBe(200);
    expect(await state()).toEqual({ credits: 96, holds: 0, ledger: 1 });
  });
  test("a funded uncertain claim survives stale and exhausted queue sweeps", async () => {
    provider.create.mockRejectedValueOnce(new Error("Owned timeout")); await turn();
    await sql`update public.campaign_queue set claimed_at = now() - interval '20 minutes', attempt_count = 5
      where workspace = ${workspaceId}::uuid and queue_state = 'assigned'`;
    expect((await sql`select public.reset_stale_campaign_queue_claims(${campaignId}::int, null) count`)[0].count).toBe(0);
    const [saved] = await sql`select queue_state, dequeued_at from public.campaign_queue where voice_reservation_id is not null and workspace = ${workspaceId}::uuid`;
    expect(saved).toEqual({ queue_state: "assigned", dequeued_at: null });
    await sql`update public.campaign_queue set queue_state = 'dequeued', dequeued_at = now()
      where workspace = ${workspaceId}::uuid and voice_reservation_id is null`;
    expect((await sql`select public.try_complete_campaign_if_drained(${campaignId}::int) complete`)[0].complete).toBe(false);
    expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
  });
  test("conference recovery proves an independent recipient from its own request history", async () => {
    const agent = await connectAgent();
    provider.create.mockRejectedValueOnce(new Error("Owned recipient timeout"));
    expect((await signedRoute(agent.url, joinParams(agent))).status).toBe(500);
    const [reservation] = await sql`select * from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    const sent = provider.create.mock.calls[1][0], at = new Date(Date.now() - 21 * 60_000), ended = new Date(Date.now() - 20 * 60_000);
    const root = { ...await provider.create.mock.results[0].value, status: "completed", duration: "90", dateCreated: at, dateUpdated: ended, endTime: ended };
    const child = { ...sent, sid: sid(), accountSid, parentCallSid: null, direction: "outbound-api", status: "completed", duration: "42",
      dateCreated: at, dateUpdated: ended, endTime: ended };
    provider.fetch.mockImplementation(async (id: string) => id === agent.setupSid ? root : child);
    provider.list.mockResolvedValue([child]);
    await sql`update public.workspace_voice_reservation set send_started_at = ${at}, recipient_instruction_issued_at = ${at},
      lease_expires_at = now() - interval '1 minute' where id = ${reservation.id}::uuid`;
    const { runVoiceCreditRecovery } = await import("@/lib/voice-credit-recovery.server");
    // Setup history cannot prove the independently created recipient.
    provider.events.mockResolvedValue([{ request: { method: "POST", url: root.url, parameters: { call_sid: child.sid } } }]);
    expect(await runVoiceCreditRecovery()).toMatchObject({ pending: 1, settled: 0 });
    expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute' where id = ${reservation.id}::uuid`;
    provider.events.mockResolvedValue([{ request: { method: "POST", url: sent.statusCallback, parameters: { call_sid: child.sid } } }]);
    expect(await runVoiceCreditRecovery()).toMatchObject({ settled: 1, pending: 0 });
    expect(await state()).toEqual({ credits: 96, holds: 0, ledger: 1 }); expect(provider.create).toHaveBeenCalledTimes(2);
    const [saved] = await sql`select parent_call_sid, direction from public.call where sid = ${child.sid}`;
    expect(saved).toEqual({ parent_call_sid: null, direction: "outbound-api" });
  });
  test("an early funded terminal outcome cannot use the legacy path after a queue rebuild", async () => {
    await turn(); const first = provider.create.mock.calls[0][0];
    const [original] = await sql`select provider_sid from public.workspace_voice_reservation where workspace=${workspaceId}::uuid`;
    await statusCallback(first.statusCallback, original.provider_sid, first.to, "busy", "0");
    const [parent] = await sql`select id from public.predictive_machine_operation where workspace=${workspaceId}::uuid and call_sid=${original.provider_sid}`;
    const accepted = sid(), name = `owned_predictive_continuation_fault_${randomUUID().replaceAll("-", "")}`;
    provider.create.mockImplementationOnce(async (args: { to: string; from: string; statusCallback: string }) => {
      await sql.unsafe(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $fault$
        BEGIN IF NEW.call_sid = '${accepted}' THEN RAISE EXCEPTION 'owned continuation fault'; END IF; RETURN NEW; END; $fault$`);
      try {
        await sql.unsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON public.predictive_machine_operation FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
        expect((await statusCallback(args.statusCallback, accepted, args.to, "busy", "0")).status).toBe(500);
      } finally { await sql.unsafe(`DROP TRIGGER IF EXISTS ${name} ON public.predictive_machine_operation`); await sql.unsafe(`DROP FUNCTION public.${name}()`); }
      await sql`update public.campaign_queue set queue_state='queued', dequeued_at=null, assigned_to_user_id=null,
        voice_reservation_id=null, dispatch_generation=gen_random_uuid() where workspace=${workspaceId}::uuid`;
      return { ...args, sid: accepted, accountSid, direction: "outbound-api", parentCallSid: null, status: "queued", duration: null };
    });
    const { runPredictiveMachineContinuation } = await import("@/lib/predictive-machine.server");
    await runPredictiveMachineContinuation({ workspaceId, operationId: parent.id });
    const [outcome] = await sql`select params from public.job where idempotency_key=${`funded-voice-terminal:${accepted}`}`;
    const { callStatusSideEffectsParams } = await import("@/lib/worker/job-params.server");
    const stored = callStatusSideEffectsParams.parse(outcome.params);
    const { runCallStatusSideEffects } = await import("@/lib/worker/webhook-side-effects.server");
    await runCallStatusSideEffects({ callSid: accepted, event: stored.event });
    expect(await sql`select id from public.predictive_machine_operation where workspace=${workspaceId}::uuid and call_sid=${accepted}`).toHaveLength(0);
    expect(await sql`select id from public.job where workspace_id=${workspaceId}::uuid and type='twilio_open_sync'`).toHaveLength(0);
    expect(provider.create).toHaveBeenCalledTimes(2);
    expect((await sql`select count(*)::int count from public.campaign_queue where workspace=${workspaceId}::uuid and queue_state='queued'`)[0].count).toBe(52);
  });
  test("a queued continuation cannot claim work from a later queue generation", async () => {
    await turn(); const first = provider.create.mock.calls[0][0];
    const [original] = await sql`select provider_sid from public.workspace_voice_reservation where workspace=${workspaceId}::uuid`;
    await statusCallback(first.statusCallback, original.provider_sid, first.to, "busy", "0");
    const [operation] = await sql`select id from public.predictive_machine_operation where workspace=${workspaceId}::uuid`;
    await sql`update public.campaign_queue set queue_state='queued', dequeued_at=null, assigned_to_user_id=null,
      voice_reservation_id=null, dispatch_generation=gen_random_uuid() where workspace=${workspaceId}::uuid`;
    const { runPredictiveMachineContinuation } = await import("@/lib/predictive-machine.server");
    expect(await runPredictiveMachineContinuation({ workspaceId, operationId: operation.id })).toMatchObject({ completed: true, stopped: true });
    expect(provider.create).toHaveBeenCalledOnce(); expect(await state()).toEqual({ credits: 100, holds: 0, ledger: 0 });
  });
  test("a durable terminal outcome repairs its predecessor before it can free funding", async () => {
    await turn(); const first = provider.create.mock.calls[0][0];
    const [original] = await sql`select provider_sid from public.workspace_voice_reservation where workspace=${workspaceId}::uuid`;
    await statusCallback(first.statusCallback, original.provider_sid, first.to, "busy", "0");
    const [parent] = await sql`select id from public.predictive_machine_operation where workspace=${workspaceId}::uuid`;
    const { runPredictiveMachineContinuation } = await import("@/lib/predictive-machine.server");
    await runPredictiveMachineContinuation({ workspaceId, operationId: parent.id });
    const [recipient] = await sql`select provider_sid, recipient from public.workspace_voice_reservation where predictive_operation_id=${parent.id}::uuid`;
    const { enqueueFundedVoiceTerminalOutcome } = await import("@/server/voice-terminal-outcome.server");
    const event = await enqueueFundedVoiceTerminalOutcome(workspaceId, recipient.provider_sid, {
      AccountSid: accountSid, CallSid: recipient.provider_sid, To: recipient.recipient, From: from, Direction: "outbound-api",
      CallStatus: "completed", CallDuration: "42",
    });
    if (!event) throw new Error("Owned terminal receipt required");
    await sql`update public.predictive_machine_operation set successor_call_sid=null where id=${parent.id}::uuid`;
    const name = `owned_predictive_receipt_fault_${randomUUID().replaceAll("-", "")}`;
    await sql.unsafe(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $fault$
      BEGIN IF NEW.id = '${parent.id}'::uuid AND NEW.successor_call_sid IS NOT NULL THEN RAISE EXCEPTION 'owned receipt repair fault'; END IF; RETURN NEW; END; $fault$`);
    const { runCallStatusSideEffects } = await import("@/lib/worker/webhook-side-effects.server");
    try {
      await sql.unsafe(`CREATE TRIGGER ${name} BEFORE UPDATE ON public.predictive_machine_operation FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
      await expect(runCallStatusSideEffects({ callSid: recipient.provider_sid, event })).rejects.toMatchObject({
        cause: expect.objectContaining({ message: "owned receipt repair fault" }),
      });
      expect(await state()).toEqual({ credits: 100, holds: 1, ledger: 0 });
      expect(await sql`select id from public.job where idempotency_key=${`funded-voice-terminal:${recipient.provider_sid}`}`).toHaveLength(1);
    } finally { await sql.unsafe(`DROP TRIGGER IF EXISTS ${name} ON public.predictive_machine_operation`); await sql.unsafe(`DROP FUNCTION public.${name}()`); }
    await runCallStatusSideEffects({ callSid: recipient.provider_sid, event });
    expect(await state()).toEqual({ credits: 96, holds: 0, ledger: 1 });
    expect((await sql`select successor_call_sid from public.predictive_machine_operation where id=${parent.id}::uuid`)[0].successor_call_sid).toBe(recipient.provider_sid);
    expect(provider.create).toHaveBeenCalledTimes(2);
  });
});
