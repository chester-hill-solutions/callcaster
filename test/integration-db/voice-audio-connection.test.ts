import { randomUUID } from "node:crypto";
import postgres from "postgres";
import twilio from "twilio";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import type { VoiceAudioConnectionInput } from "@/lib/voice-audio-connection";
import { isVoiceAudioLeg } from "@/server/voice-audio-classification.server";
import { bindVoiceAudioProviderReceipt, type VoiceAudioProviderIdentity } from "@/server/voice-audio-callback.server";
import { issueVoiceAudioInstruction, observeVoiceAudioConferenceEvent, type VoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";
import { voiceAudioConferenceTwiml } from "@/lib/voice-audio-twiml.server";

vi.hoisted(() => { process.env.TZ = "UTC"; process.env.BASE_URL = "https://audio-connection.example.test"; process.env.TWILIO_VALIDATE_WEBHOOKS = "true"; });
type ApiPhysical = { sid: string; accountSid: string; to: string; from: string; direction: string; parentCallSid: string | null;
  status: string; duration: string | null; dateCreated: Date; dateUpdated: Date; endTime: Date | null; voiceUrl: string; statusCallback: string };
const web = vi.hoisted(() => ({ userId: "", accountSid: "", authenticated: true, create: vi.fn(), fetch: vi.fn(), update: vi.fn(), records: new Map<string, ApiPhysical>() }));
const rooms = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), list: vi.fn(), records: new Map<string, { sid: string; accountSid: string; friendlyName: string; status: string }>() }));
vi.mock("@/lib/api-auth.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api-auth.server")>(),
  requireJsonAuth: async () => web.authenticated ? { authType: "session", user: { id: web.userId } } : Response.json({ error: "Unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth.server")>(),
  getSession: async () => ({ user: { id: web.userId }, headers: new Headers({ "Set-Cookie": "audio-session=refreshed" }) }),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  createWorkspaceTwilioInstance: async () => ({ accountSid: web.accountSid,
    calls: Object.assign((id: string) => ({ fetch: () => web.fetch(id), update: (args: { status: string }) => web.update(id, args) }), { create: web.create }),
    conferences: Object.assign((id: string) => ({ fetch: () => rooms.fetch(id), update: (args: { status: string }) => rooms.update(id, args) }), { list: rooms.list }),
  }),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(),
  emitPostgresChangeEvent: vi.fn(), emitQueueEvent: vi.fn(), emitPredictiveBroadcast: vi.fn(),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID(), otherActor = randomUUID();
const accountSid = `AC${randomUUID().replaceAll("-", "")}`;
const phone = "+16135550601", otherPhone = "+16135550602", callerId = "+16135550600", customer = "+16135550699";
const baseUrl = "https://audio-connection.example.test";
const sid = () => `CA${randomUUID().replaceAll("-", "")}`;
const fault = `audio_receipt_${randomUUID().replaceAll("-", "")}`;
let sql: postgres.Sql;
let journal: typeof import("@/server/voice-audio-connection.server");
let dispatch: typeof import("@/lib/voice-audio-dispatch.server");
type Input = VoiceAudioConnectionInput & { baseUrl: string };
type Connection = Awaited<ReturnType<typeof journal.findVoiceAudioConnection>> & {};

describe("owned agent audio connection journal (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned database URL required");
    sql = postgres(url, { max: 3, onnotice: () => {} });
    await sql`insert into public."user" (id, username) values (${actor}::uuid, ${`audio-${actor}@example.test`}),
      (${otherActor}::uuid, ${`audio-${otherActor}@example.test`})`;
    await sql`insert into public.workspace (id, name, credits, twilio_data) values
      (${workspaceId}::uuid, 'Owned audio journal fixture', 100, ${sql.json({ sid: accountSid, authToken: "owned-audio-token" })}),
      (${foreignId}::uuid, 'Foreign audio control', 100, '{}'::jsonb)`;
    await sql`insert into public.workspace_number (workspace, phone_number, type, capabilities, handset_enabled)
      values (${workspaceId}::uuid, ${callerId}, 'local', '{"voice":true}'::jsonb, true)`;
    journal = await import("@/server/voice-audio-connection.server");
    dispatch = await import("@/lib/voice-audio-dispatch.server");
  });
  async function clearFault() {
    await sql.unsafe(`drop trigger if exists ${fault} on public.call`);
    await sql.unsafe(`drop trigger if exists ${fault} on public.workspace_voice_audio_connection`);
    await sql.unsafe(`drop function if exists public.${fault}()`);
  }
  beforeEach(async () => {
    vi.clearAllMocks();
    web.userId = actor; web.accountSid = accountSid; web.authenticated = true; web.records.clear();
    rooms.records.clear();
    rooms.fetch.mockReset().mockImplementation(async (id: string) => { const room = rooms.records.get(id); if (!room) throw new Error("Owned audio conference required"); return room; });
    rooms.update.mockReset().mockImplementation(async (id: string, args: { status: string }) => { const room = rooms.records.get(id); if (!room) throw new Error("Owned audio conference required"); room.status = args.status; return room; });
    rooms.list.mockReset().mockImplementation(async () => [...rooms.records.values()].filter((r) => r.status === "in-progress"));
    web.create.mockReset().mockImplementation(async (args: { to: string; from: string; url: string; statusCallback: string }) => {
      const physical: ApiPhysical = { sid: sid(), accountSid, to: args.to, from: args.from, direction: "outbound-api", parentCallSid: null,
        status: "ringing", duration: null, dateCreated: new Date(), dateUpdated: new Date(), endTime: null, voiceUrl: args.url, statusCallback: args.statusCallback };
      web.records.set(physical.sid, physical); return physical;
    });
    web.fetch.mockReset().mockImplementation(async (id: string) => { const physical = web.records.get(id); if (!physical) throw new Error("Owned audio API call required"); return physical; });
    web.update.mockReset().mockImplementation(async (id: string, args: { status: string }) => {
      const physical = web.records.get(id); if (!physical) throw new Error("Owned audio API call required");
      physical.status = args.status; physical.endTime = new Date(); return physical;
    });
    const { resetRateLimitsForTests } = await import("@/lib/platform-rate-limit.server"); resetRateLimitsForTests();
    await clearFault();
    await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
    await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_audio_connection where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.handset_session where workspace_id = ${workspaceId}::uuid`;
    await sql`update public.workspace set credits = 100, disabled = false, archived_at = null,
      twilio_data = ${sql.json({ sid: accountSid, authToken: "owned-audio-token" })} where id = ${workspaceId}::uuid`;
    await sql`update public."user" set access_level = 'standard', verified_audio_numbers = ${sql.array([phone, otherPhone])}
      where id = ${actor}::uuid`;
    await sql`update public.workspace_number set phone_number = ${callerId}, suspended_at = null, handset_enabled = true where workspace = ${workspaceId}::uuid`;
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`audio:${workspaceId}:${actor}`}, ${workspaceId}, ${actor}, 'caller') on conflict (id) do update set role_id = 'caller'`;
  });
  afterEach(async () => {
    await clearFault();
    const [foreign] = await sql`select credits,
      (select count(*)::int from public.workspace_voice_audio_connection where workspace = ${foreignId}::uuid) as operations,
      (select count(*)::int from public.transaction_history where workspace = ${foreignId}::uuid) as ledger
      from public.workspace where id = ${foreignId}::uuid`;
    expect(foreign).toEqual({ credits: 100, operations: 0, ledger: 0 });
  });
  afterAll(async () => {
    try {
      if (sql) {
        await clearFault();
        await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public."user" where id in (${actor}::uuid, ${otherActor}::uuid)`;
      }
    } finally {
      await sql?.end();
      if (journal) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });

  function input(overrides: Partial<Input> = {}): Input {
    return { workspaceId, userId: actor, intentId: randomUUID(), transport: "phone", phoneNumber: phone, baseUrl, ...overrides };
  }
  async function prepare(args = input()) {
    const result = await journal.prepareVoiceAudioConnection(args);
    if (!result.ok) throw new Error(`Audio fixture preparation refused: ${result.reason}`);
    return result.connection;
  }
  async function state() {
    const [row] = await sql`select credits,
      (select count(*)::int from public.workspace_voice_audio_connection where workspace = ${workspaceId}::uuid) as operations,
      (select count(*)::int from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid) as reservations,
      (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger,
      (select count(*)::int from public.outreach_attempt where workspace = ${workspaceId}::uuid) as attempts,
      (select count(*)::int from public.campaign_queue where workspace = ${workspaceId}::uuid) as queue
      from public.workspace where id = ${workspaceId}::uuid`;
    return row;
  }
  async function funded(conference = false) {
    const id = randomUUID(), parent = sid(), child = sid(), room = `${actor}~${randomUUID()}`;
    const cf = `CF${randomUUID().replaceAll("-", "")}`;
    await sql`insert into public.workspace_voice_reservation
      (id, workspace, kind, credits, account_sid, recipient, caller_id, user_id, setup_to, setup_client_identity,
       setup_sid, provider_sid, state, lease_token, lease_expires_at, send_started_at, setup_continuation_url,
       conference_id, conference_sid, status_callback)
      values (${id}::uuid, ${workspaceId}::uuid, 'staffed', 4, ${accountSid}, ${customer}, ${callerId}, ${actor},
       ${conference ? phone : ""}, ${conference ? null : actor}, ${parent}, ${child}, 'active', ${randomUUID()}::uuid,
       now() + interval '5 minutes', now(), ${`${baseUrl}/api/voice-continuation?credit_reservation=${id}`},
       ${conference ? room : null}, ${conference ? cf : null}, ${`${baseUrl}/api/auto-dial/status?credit_reservation=${id}&credit_leg=recipient`})`;
    await sql`insert into public.call (sid, workspace, user_id, account_sid, "to", "from", direction, status, parent_call_sid, conference_id)
      values (${parent}, ${workspaceId}::uuid, ${actor}, ${accountSid}, ${conference ? phone : ""}, ${conference ? callerId : `client:${actor}`},
        ${conference ? "outbound-api" : "inbound"}, 'in-progress', null, ${conference ? room : null}),
      (${child}, ${workspaceId}::uuid, ${actor}, ${accountSid}, ${customer}, ${callerId}, ${conference ? "outbound-api" : "outbound-dial"},
        'in-progress', ${conference ? null : parent}, ${conference ? room : null})`;
    return { id, parent, child, room, cf, args: input({ callSid: child, expectedAgentSid: parent }) };
  }
  async function claim(row: Connection) {
    const result = await journal.claimVoiceAudioSend(row);
    if (!result.ok) throw new Error(`Audio fixture claim refused: ${result.reason}`);
    return result.connection;
  }
  function receipt(row: Connection, overrides: Partial<VoiceAudioProviderIdentity> = {}): VoiceAudioProviderIdentity {
    return { connectionId: row.id, event: "status", requestUrl: row.status_callback, accountSid,
      callSid: sid(), to: row.destination, from: row.caller_id, direction: "outbound-api", parentCallSid: null, ...overrides };
  }
  async function issued(args = input()) {
    const row = await claim(await prepare(args)), accepted = await journal.recordVoiceAudioProvider(row, sid());
    const result = await issueVoiceAudioInstruction(accepted, "1");
    if (!result.ok) throw new Error(`Audio fixture instruction refused: ${result.reason}`);
    return result.connection;
  }
  function joined(row: Connection, overrides: Partial<VoiceAudioConferenceEvent> = {}): VoiceAudioConferenceEvent {
    return { workspaceId, accountSid, requestUrl: row.conference_callback, conferenceId: row.conference_id,
      conferenceSid: row.conference_sid ?? `CF${randomUUID().replaceAll("-", "")}`, callSid: row.provider_sid ?? "",
      participantLabel: `audio:${row.id}:${row.generation}`, muted: row.target_kind === "idle" && !row.source_agent_sid ? "false" : "true",
      event: "participant-join", ...overrides };
  }
  async function apiPost(body: unknown = { workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() }) {
    const { action } = await import("../../app/routes/api+/connect-phone-device.action.server");
    return asRouteResponse(action(routeArgs(new Request(`${baseUrl}/api/connect-phone-device`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }))));
  }
  async function apiControl(row: Connection, method: "GET" | "DELETE" = "GET", targetWorkspace = workspaceId) {
    const request = new Request(`${baseUrl}/api/connect-phone-device?workspaceId=${targetWorkspace}&connection_id=${row.id}`, { method });
    if (method === "GET") { const { loader } = await import("../../app/routes/api+/connect-phone-device.loader.server"); return asRouteResponse(loader(routeArgs(request))); }
    const { action } = await import("../../app/routes/api+/connect-phone-device.action.server"); return asRouteResponse(action(routeArgs(request)));
  }
  async function signedAudio(url: string, params: Record<string, string>, validSignature = true, extraFields: [string, string][] = []) {
    const { action } = await import("../../app/routes/api+/voice-audio.action.server");
    const body = new URLSearchParams([...Object.entries(params), ...extraFields]);
    return asRouteResponse(action(routeArgs(new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": validSignature ? twilio.getExpectedTwilioSignature("owned-audio-token", url, params) : "invalid" }, body }))));
  }
  async function signedPredictive(url: string, params: Record<string, string>) {
    const { action } = await import("../../app/routes/api+/auto-dial/status.action.server");
    return asRouteResponse(action(routeArgs(new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": twilio.getExpectedTwilioSignature("owned-audio-token", url, params) }, body: new URLSearchParams(params) }))));
  }
  async function parentContinuationFixture(rest = false) {
    const target = await funded();
    if (rest) {
      await sql`update public.workspace_voice_reservation set setup_to = ${phone}, setup_client_identity = null where id = ${target.id}::uuid`;
      await sql`update public.call set "to" = ${phone}, "from" = ${callerId}, direction = 'outbound-api' where sid = ${target.parent}`;
    }
    const ready = await observeVoiceAudioConferenceEvent(joined(await issued(target.args)));
    if (!ready) throw new Error("Owned joined replacement required");
    await sql`update public.workspace_voice_audio_connection set state = 'switching', promotion_requested_at = now() where id = ${ready.id}::uuid`;
    const common = { accountSid, status: "in-progress", duration: null, dateCreated: new Date(), dateUpdated: new Date(), endTime: null,
      voiceUrl: "", statusCallback: "" };
    web.records.set(target.parent, { ...common, sid: target.parent, to: rest ? phone : "", from: rest ? callerId : `client:${actor}`,
      direction: rest ? "outbound-api" : "inbound", parentCallSid: null });
    web.records.set(target.child, { ...common, sid: target.child, to: customer, from: callerId, direction: "outbound-dial", parentCallSid: target.parent });
    const url = `${baseUrl}/api/voice-continuation?credit_reservation=${target.id}`;
    const params = { AccountSid: accountSid, CallSid: target.parent, DialCallSid: target.child, DialCallStatus: "completed",
      From: rest ? callerId : `client:${actor}`, To: rest ? phone : customer, Direction: rest ? "outbound-api" : "inbound" };
    return { target, row: ready, url, params };
  }
  async function signedParent(url: string, params: Record<string, string>, valid = true, extras: [string, string][] = [], method = "POST") {
    const { action } = await import("../../app/routes/api+/voice-continuation.action.server");
    return asRouteResponse(action(routeArgs(new Request(url, { method, headers: { "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": valid ? twilio.getExpectedTwilioSignature("owned-audio-token", url, params) : "invalid" },
      body: new URLSearchParams([...Object.entries(params), ...extras]),
    }))));
  }
  async function endedReplacementFixture(committed = false) {
    const f = await parentContinuationFixture();
    if (committed) await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${f.row.id}::uuid`;
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    await observeVoiceAudioStatus(f.row, "completed", "10");
    const conferenceSid = f.row.conference_sid;
    if (!conferenceSid) throw new Error("Owned conference SID required");
    rooms.records.set(conferenceSid, { sid: conferenceSid, accountSid, friendlyName: f.row.conference_id, status: "in-progress" });
    return { ...f, conferenceSid };
  }
  function bridgeParams(f: Awaited<ReturnType<typeof endedReplacementFixture>>, leg: "parent" | "customer", joined: boolean) {
    return { AccountSid: accountSid, CallSid: leg === "parent" ? f.target.parent : f.target.child,
      ConferenceSid: f.conferenceSid, FriendlyName: f.row.conference_id, Muted: "false",
      StatusCallbackEvent: joined ? "participant-join" : "participant-leave", ...(joined ? {} : { ReasonParticipantLeft: "participant_hung_up" }) };
  }
  function voiceParams(row: Connection, providerSid = sid()) {
    return { AccountSid: accountSid, CallSid: providerSid, To: row.destination, From: row.caller_id, Direction: "outbound-api", CallStatus: "in-progress" };
  }

  test("prepares an idle connection without claiming a contact, a customer hold or a debit", async () => {
    const row = await prepare();
    expect(row).toMatchObject({ state: "prepared", target_kind: "idle", generation: 1, destination: phone, account_sid: accountSid,
      customer_sid: null, reservation_id: null, provider_sid: null, send_started_at: null });
    expect(row.conference_id).toMatch(new RegExp(`^${actor}~`));
    expect(await state()).toEqual({ credits: 100, operations: 1, reservations: 0, ledger: 0, attempts: 0, queue: 0 });
  });
  test.each(["DELETE", "PUT", "PATCH"])("parent continuation rejects signed %s without processing the call", async (method) => {
    const f = await parentContinuationFixture(), before = await state();
    const response = await signedParent(f.url, f.params, true, [], method);
    expect(response.status).toBe(405); expect(response.headers.get("Allow")).toBe("POST");
    expect(web.fetch).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test("normalizes a verified destination before saving it", async () => {
    expect((await prepare(input({ phoneNumber: ` ${phone} ` }))).destination).toBe(phone);
  });
  test.each(["owner", "admin", "member", "caller"])("permits the existing %s workspace role", async (role) => {
    await sql`update public.workspace_member set role_id = ${role} where workspace_id = ${workspaceId}`;
    expect((await prepare()).user_id).toBe(actor);
  });
  test("replays one intent and refuses a changed destination under that intent", async () => {
    const args = input(), row = await prepare(args);
    expect(await journal.prepareVoiceAudioConnection(args)).toMatchObject({ ok: true, replayed: true, connection: { id: row.id } });
    expect(await journal.prepareVoiceAudioConnection({ ...args, phoneNumber: otherPhone })).toEqual({ ok: false, reason: "intent_conflict" });
    expect((await state()).operations).toBe(1);
  });
  test("legacy idle retries reuse a pending connection without an intent from the client", async () => {
    const row = await prepare();
    expect(await journal.prepareVoiceAudioConnection(input())).toMatchObject({ ok: true, replayed: true, connection: { id: row.id } });
  });
  test("a different replacement cannot bypass an existing pending attempt", async () => {
    await prepare();
    expect(await journal.prepareVoiceAudioConnection(input({ phoneNumber: otherPhone }))).toEqual({ ok: false, reason: "connection_pending" });
  });
  test.each(["failed", "canceled", "retired"])("a nonterminal %s leg must finish cleanup before another phone can ring", async (audioState) => {
    const row = await claim(await prepare()), providerSid = sid();
    await journal.recordVoiceAudioProvider(row, providerSid);
    await sql`update public.workspace_voice_audio_connection set state = ${audioState} where id = ${row.id}::uuid`;
    expect(await journal.prepareVoiceAudioConnection(input({ phoneNumber: otherPhone }))).toEqual({ ok: false, reason: "connection_pending" });
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    const accepted = await journal.findVoiceAudioConnection(row.id); if (!accepted) throw new Error("Accepted audio operation required");
    await observeVoiceAudioStatus(accepted, "completed", "0");
    expect(await journal.prepareVoiceAudioConnection(input({ phoneNumber: otherPhone }))).toMatchObject({ ok: true, connection: { generation: 2 } });
  });
  test("concurrent retries create and send one physical agent leg", async () => {
    const args = input();
    const rows = await Promise.all(Array.from({ length: 8 }, () => prepare(args)));
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    const providerSid = sid(), create = vi.fn(async () => ({ sid: providerSid }));
    await Promise.all(rows.map((r) => dispatch.dispatchVoiceAudioConnection(r, create)));
    expect(create).toHaveBeenCalledTimes(1);
    expect(await journal.findVoiceAudioConnection(rows[0].id)).toMatchObject({ provider_sid: providerSid, state: "joining" });
    expect((await state()).reservations).toBe(0);
  });
  const refusals = [
    ["foreign workspace", "agent_not_found"], ["missing workspace", "workspace_not_found"],
    ["different user", "agent_not_found"], ["removed membership", "agent_not_found"],
    ["disabled user", "agent_not_found"], ["disabled workspace", "workspace_unavailable"],
    ["archived workspace", "workspace_not_found"], ["unverified phone", "device_not_verified"],
    ["suspended caller ID", "caller_id_unavailable"], ["missing caller ID", "caller_id_unavailable"],
    ["missing provider account", "caller_id_unavailable"], ["zero idle credits", "insufficient_credits"],
  ] as const;
  async function deny(kind: string, args: Input) {
    if (kind === "foreign workspace") return { ...args, workspaceId: foreignId };
    if (kind === "missing workspace") return { ...args, workspaceId: randomUUID() };
    if (kind === "different user") return { ...args, userId: otherActor };
    if (kind === "unverified phone") return { ...args, phoneNumber: "+16135550777" };
    if (kind === "removed membership") await sql`delete from public.workspace_member where workspace_id = ${workspaceId}`;
    if (kind === "disabled user") await sql`update public."user" set access_level = 'disabled' where id = ${actor}::uuid`;
    if (kind === "disabled workspace") await sql`update public.workspace set disabled = true where id = ${workspaceId}::uuid`;
    if (kind === "archived workspace") await sql`update public.workspace set archived_at = now() where id = ${workspaceId}::uuid`;
    if (kind === "suspended caller ID") await sql`update public.workspace_number set suspended_at = now() where workspace = ${workspaceId}::uuid`;
    if (kind === "missing caller ID") await sql`update public.workspace_number set phone_number = null where workspace = ${workspaceId}::uuid`;
    if (kind === "missing provider account") await sql`update public.workspace set twilio_data = '{}'::jsonb where id = ${workspaceId}::uuid`;
    if (kind === "zero idle credits") await sql`update public.workspace set credits = 0 where id = ${workspaceId}::uuid`;
    return args;
  }
  test.each(refusals)("refuses %s before saving a provider send", async (kind, reason) => {
    expect(await journal.prepareVoiceAudioConnection(await deny(kind, input()))).toEqual({ ok: false, reason });
    expect((await state()).operations).toBe(0);
  });
  test("held customer credits cannot fund a new idle connection", async () => {
    const target = await funded();
    await sql`update public.workspace_voice_reservation set user_id = ${otherActor} where id = ${target.id}::uuid`;
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    expect(await journal.prepareVoiceAudioConnection(input())).toEqual({ ok: false, reason: "insufficient_credits" });
  });
  test("an idle connection cannot replace audio for the actor's funded browser call", async () => {
    await funded();
    expect(await journal.prepareVoiceAudioConnection(input())).toEqual({ ok: false, reason: "stale_audio" });
    expect((await state()).operations).toBe(0);
  });
  test("replaces a funded customer's audio at zero available balance without a second hold", async () => {
    const target = await funded();
    await sql`update public.workspace set credits = 0 where id = ${workspaceId}::uuid`;
    const before = await state(), row = await prepare(target.args);
    expect(row).toMatchObject({ target_kind: "direct", customer_sid: target.child, reservation_id: target.id, source_agent_sid: target.parent });
    await dispatch.dispatchVoiceAudioConnection(row, async () => ({ sid: sid() }));
    expect(await state()).toEqual({ ...before, operations: 1 });
  });
  test("keeps an old manual call's audio when no parent continuation was saved", async () => {
    const target = await funded();
    await sql`update public.workspace_voice_reservation set setup_continuation_url = null where id = ${target.id}::uuid`;
    expect(await journal.prepareVoiceAudioConnection(target.args)).toEqual({ ok: false, reason: "handoff_unavailable" });
  });
  test("rejects a stale source agent SID", async () => {
    const target = await funded();
    expect(await journal.prepareVoiceAudioConnection({ ...target.args, expectedAgentSid: sid() })).toEqual({ ok: false, reason: "stale_audio" });
  });
  test("cannot replace a different agent's funded customer", async () => {
    const target = await funded();
    await sql`update public.workspace_voice_reservation set user_id = ${otherActor} where id = ${target.id}::uuid`;
    expect(await journal.prepareVoiceAudioConnection(target.args)).toEqual({ ok: false, reason: "target_not_found" });
  });
  test("cannot move a terminal customer into a new audio connection", async () => {
    const target = await funded();
    await sql`update public.call set status = 'completed' where sid = ${target.child}`;
    expect(await journal.prepareVoiceAudioConnection(target.args)).toEqual({ ok: false, reason: "target_inactive" });
  });
  test("does not send an original-account call through changed workspace credentials", async () => {
    const target = await funded();
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: `AC${"9".repeat(32)}`, authToken: "owned-changed-token" })} where id = ${workspaceId}::uuid`;
    expect(await journal.prepareVoiceAudioConnection(target.args)).toEqual({ ok: false, reason: "account_changed" });
  });
  test("uses the original conference callback and generation for an existing conference", async () => {
    const target = await funded(true), row = await prepare(target.args);
    expect(row).toMatchObject({ target_kind: "conference", conference_id: target.room, conference_sid: target.cf });
    const url = new URL(row.conference_callback);
    expect(url.pathname).toBe("/api/auto-dial/status");
    expect(url.searchParams.get("credit_reservation")).toBe(target.id);
    expect(url.searchParams.get("conference_events")).toBe("1");
    expect(url.searchParams.has("credit_leg")).toBe(false);
  });
  test("derives the computer destination from the funded agent identity", async () => {
    const target = await funded();
    const row = await prepare({ ...target.args, transport: "computer", phoneNumber: undefined });
    expect(row.destination).toBe(`client:${actor}`);
  });
  test.each(["missing", "foreign", "expired", "valid"])("checks a saved handset client identity with a %s session", async (mode) => {
    const target = await funded(), identity = `handset-${randomUUID()}`;
    await sql`update public.workspace_voice_reservation set setup_client_identity = ${identity} where id = ${target.id}::uuid`;
    if (mode !== "missing") await sql`insert into public.handset_session (id, workspace_id, user_id, client_identity, status, expires_at)
      values (${randomUUID()}::uuid, ${workspaceId}::uuid, ${mode === "foreign" ? otherActor : actor}, ${identity}, 'active',
        ${new Date(Date.now() + (mode === "expired" ? -60_000 : 60_000))})`;
    const result = await journal.prepareVoiceAudioConnection({ ...target.args, transport: "computer", phoneNumber: undefined });
    if (mode === "valid") expect(result).toMatchObject({ ok: true, connection: { destination: `client:${identity}` } });
    else expect(result).toEqual({ ok: false, reason: "device_not_verified" });
  });
  test.each(["removed membership", "disabled user", "disabled workspace", "unverified phone", "suspended caller ID", "zero idle credits"])(
    "rechecks %s after preparation and before the provider POST", async (kind) => {
      const row = await prepare();
      if (kind === "unverified phone") await sql`update public."user" set verified_audio_numbers = '{}' where id = ${actor}::uuid`;
      else await deny(kind, input());
      const create = vi.fn(async () => ({ sid: sid() }));
      expect(await dispatch.dispatchVoiceAudioConnection(row, create)).toMatchObject({ ok: false });
      expect(create).not.toHaveBeenCalled();
      expect((await journal.findVoiceAudioConnection(row.id))?.send_started_at).toBeNull();
    },
  );
  test("an expired unsent lease cannot issue a provider call", async () => {
    const row = await prepare();
    await sql`update public.workspace_voice_audio_connection set lease_expires_at = now() - interval '1 minute' where id = ${row.id}::uuid`;
    const create = vi.fn(async () => ({ sid: sid() }));
    expect(await dispatch.dispatchVoiceAudioConnection(row, create)).toEqual({ ok: false, reason: "connection_pending" });
    expect(create).not.toHaveBeenCalled();
  });
  test.each([400, 403, 429])("a definite provider %s rejection fails this attempt without billing", async (status) => {
    const row = await prepare(), failure = Object.assign(new Error("Owned provider rejection"), { status });
    const create = vi.fn(async () => { throw failure; });
    await expect(dispatch.dispatchVoiceAudioConnection(row, create)).rejects.toBe(failure);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("failed");
    expect(await dispatch.dispatchVoiceAudioConnection(row, create)).toEqual({ ok: false, reason: "connection_pending" });
    expect(create).toHaveBeenCalledTimes(1);
    expect((await state()).ledger).toBe(0);
  });
  test.each([408, 500, undefined])("provider %s uncertainty never repeats creation", async (status) => {
    const row = await prepare(), failure = Object.assign(new Error("Owned uncertain response"), { status });
    const create = vi.fn(async () => { throw failure; });
    await expect(dispatch.dispatchVoiceAudioConnection(row, create)).rejects.toBeInstanceOf(dispatch.VoiceAudioConnectionPendingError);
    const saved = await journal.findVoiceAudioConnection(row.id);
    expect(saved).toMatchObject({ state: "creating", provider_sid: null, last_error: "Agent audio creation or acknowledgement needs recovery" });
    expect(saved?.send_started_at).toBeInstanceOf(Date);
    expect(await journal.prepareVoiceAudioConnection(input())).toMatchObject({ ok: true, connection: { id: row.id } });
    expect(await dispatch.dispatchVoiceAudioConnection(row, create)).toEqual({ ok: false, reason: "connection_pending" });
    expect(create).toHaveBeenCalledTimes(1);
  });
  test("an early provider receipt survives a lost create response", async () => {
    const row = await prepare(), providerSid = sid();
    const result = await dispatch.dispatchVoiceAudioConnection(row, async (started) => {
      await journal.recordVoiceAudioProvider(started, providerSid);
      throw new Error("Owned lost response after webhook receipt");
    });
    expect(result).toMatchObject({ ok: true, replayed: true, connection: { provider_sid: providerSid } });
  });
  test("call-row repair failure preserves the accepted SID and its audio classification", async () => {
    const row = await prepare(), providerSid = sid();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin
      if new.workspace = '${workspaceId}'::uuid then raise exception 'owned audio receipt fault'; end if; return new; end $$`);
    await sql.unsafe(`create trigger ${fault} before insert on public.call for each row execute function public.${fault}()`);
    const result = await dispatch.dispatchVoiceAudioConnection(row, async () => ({ sid: providerSid }));
    expect(result).toMatchObject({ ok: true, connection: { provider_sid: providerSid } });
    expect(await isVoiceAudioLeg(workspaceId, providerSid)).toBe(true);
    expect(await isVoiceAudioLeg(foreignId, providerSid)).toBe(false);
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: providerSid, last_error: "Accepted audio call record needs recovery" });
    await clearFault();
    await journal.recordVoiceAudioProvider(row, providerSid);
    const [call] = await sql`select sid, contact_id, outreach_attempt_id, queue_id from public.call where sid = ${providerSid}`;
    expect(call).toEqual({ sid: providerSid, contact_id: null, outreach_attempt_id: null, queue_id: null });
  });
  test("a provider SID cannot be rebound to another accepted leg", async () => {
    const row = await claim(await prepare()), providerSid = sid();
    await journal.recordVoiceAudioProvider(row, providerSid);
    await expect(journal.recordVoiceAudioProvider(row, sid())).rejects.toThrow("does not match its send");
    expect((await journal.findVoiceAudioConnection(row.id))?.provider_sid).toBe(providerSid);
  });
  test.each(["voice", "status"] as const)("binds an early %s receipt only to its saved send", async (event) => {
    const row = await claim(await prepare()), providerSid = sid();
    const bound = await bindVoiceAudioProviderReceipt(receipt(row, { event, requestUrl: event === "voice" ? row.voice_url : row.status_callback, callSid: providerSid }));
    expect(bound).toMatchObject({ id: row.id, provider_sid: providerSid, state: "joining" });
    expect(await isVoiceAudioLeg(workspaceId, providerSid)).toBe(true);
  });
  test.each([
    { accountSid: `AC${"0".repeat(32)}` }, { to: otherPhone }, { from: otherPhone },
    { direction: "inbound" }, { direction: "outbound-dial" }, { parentCallSid: sid() },
    { requestUrl: `${baseUrl}/api/voice-audio?event=status&connection=unknown` },
    { event: "voice" as const }, { callSid: "not-a-provider-sid" },
  ])("rejects a provider receipt with changed identity %#", async (overrides) => {
    const row = await claim(await prepare());
    await expect(bindVoiceAudioProviderReceipt(receipt(row, overrides))).rejects.toThrow();
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: null, state: "creating" });
    const [calls] = await sql`select count(*)::int as count from public.call where workspace = ${workspaceId}::uuid`;
    expect(calls.count).toBe(0);
  });
  test("does not accept a provider receipt before the before-send checkpoint", async () => {
    const row = await prepare();
    await expect(bindVoiceAudioProviderReceipt(receipt(row))).rejects.toThrow("does not match its send");
    expect((await journal.findVoiceAudioConnection(row.id))?.provider_sid).toBeNull();
  });
  test("membership removal after send cannot erase a real accepted receipt", async () => {
    const row = await claim(await prepare()), providerSid = sid();
    await sql`delete from public.workspace_member where workspace_id = ${workspaceId}`;
    expect(await bindVoiceAudioProviderReceipt(receipt(row, { callSid: providerSid }))).toMatchObject({ provider_sid: providerSid });
    expect(await isVoiceAudioLeg(workspaceId, providerSid)).toBe(true);
    expect((await state()).ledger).toBe(0);
  });
  test("a failed attempt retains its generation while a new intent uses the next generation", async () => {
    const row = await claim(await prepare());
    await journal.failUnacceptedVoiceAudio(row);
    const next = await prepare();
    expect(next.generation).toBe(2);
    expect(next.id).not.toBe(row.id);
    const providerSid = sid();
    await bindVoiceAudioProviderReceipt(receipt(row, { callSid: providerSid }));
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: providerSid, state: "failed", generation: 1 });
    expect(await journal.findVoiceAudioConnection(next.id)).toMatchObject({ provider_sid: null, state: "prepared", generation: 2 });
  });
  test("rechecks a funded customer terminal transition immediately before send", async () => {
    const target = await funded(), row = await prepare(target.args);
    await sql`update public.call set status = 'completed' where sid = ${target.child}`;
    const create = vi.fn(async () => ({ sid: sid() }));
    expect(await dispatch.dispatchVoiceAudioConnection(row, create)).toEqual({ ok: false, reason: "target_inactive" });
    expect(create).not.toHaveBeenCalled();
  });
  test("keeps the existing fallback caller ID when no handset number is selected", async () => {
    await sql`update public.workspace_number set handset_enabled = false where workspace = ${workspaceId}::uuid`;
    expect((await prepare()).caller_id).toBe(callerId);
  });
  test.each(["joining", "active", "retired", "failed", "canceled"])("a %s audio leg cannot bill or write customer outcomes", async (audioState) => {
    const target = await funded(), row = await claim(await prepare(target.args)), providerSid = sid();
    await journal.recordVoiceAudioProvider(row, providerSid);
    await sql`update public.workspace_voice_audio_connection set state = ${audioState} where id = ${row.id}::uuid`;
    await sql`update public.call set status = 'completed', duration = '42' where sid = ${providerSid}`;
    const before = await state();
    const { findCallBySid } = await import("@/lib/telephony-db.server");
    const { billTerminalCallStatus } = await import("@/lib/twilio-call-status.server");
    const { runCallStatusSideEffects } = await import("@/lib/worker/webhook-side-effects.server");
    const { parseTwilioVoiceCallback } = await import("@/lib/twilio/voice-callback");
    const saved = await findCallBySid(providerSid);
    if (!saved) throw new Error("Accepted audio call row required");
    expect(await billTerminalCallStatus(saved)).toBeNull();
    const event = parseTwilioVoiceCallback({ AccountSid: accountSid, CallSid: providerSid, CallStatus: "completed", CallDuration: "42" });
    await runCallStatusSideEffects({ callSid: providerSid, event });
    await runCallStatusSideEffects({ callSid: providerSid, event });
    expect(await state()).toEqual(before);
    const [customerHold] = await sql`select state from public.workspace_voice_reservation where id = ${target.id}::uuid`;
    expect(customerHold.state).toBe("active");
    const [jobs] = await sql`select count(*)::int as count from public.job where workspace_id = ${workspaceId}::uuid`;
    expect(jobs.count).toBe(0);
  });
  test("the funded customer still settles once while its replacement audio is excluded", async () => {
    const target = await funded(), row = await claim(await prepare(target.args)), providerSid = sid();
    await journal.recordVoiceAudioProvider(row, providerSid);
    await sql`update public.call set status = 'completed', duration = '42' where sid in (${providerSid}, ${target.child})`;
    const { findCallBySid } = await import("@/lib/telephony-db.server");
    const { billTerminalCallStatus } = await import("@/lib/twilio-call-status.server");
    const audio = await findCallBySid(providerSid), customerCall = await findCallBySid(target.child);
    if (!audio || !customerCall) throw new Error("Owned calls required");
    for (let n = 0; n < 2; n++) { await billTerminalCallStatus(audio); await billTerminalCallStatus(customerCall); }
    expect(await state()).toMatchObject({ credits: 96, ledger: 1, reservations: 1 });
    const [entry] = await sql`select call_sid, amount from public.transaction_history where workspace = ${workspaceId}::uuid`;
    expect(entry.call_sid).toBe(target.child);
    expect(Number(entry.amount)).toBe(-4);
  });
  test("excludes audio before a limited legacy recovery query while preserving an unfunded control", async () => {
    const row = await claim(await prepare());
    const providerSid = `CAf${randomUUID().replaceAll("-", "").slice(1)}`;
    const legacySid = `CA0${randomUUID().replaceAll("-", "").slice(1)}`;
    await journal.recordVoiceAudioProvider(row, providerSid);
    await sql`insert into public.call (sid, workspace, account_sid, status, direction) values
      (${legacySid}, ${workspaceId}::uuid, ${accountSid}, 'in-progress', 'outbound-api')`;
    const { db } = await import("@/server/db");
    const { call } = await import("@/db/schema");
    const { and, eq, desc } = await import("drizzle-orm");
    const { unreservedVoiceCallPredicate } = await import("@/server/voice-bridge-reservation.server");
    const rows = await db.select({ sid: call.sid }).from(call).where(and(eq(call.workspace, workspaceId),
      unreservedVoiceCallPredicate(workspaceId))).orderBy(desc(call.sid)).limit(1);
    expect(rows).toEqual([{ sid: legacySid }]);
  });
  test("accepted and answered are not a confirmed audio connection", async () => {
    const row = await claim(await prepare()), accepted = await journal.recordVoiceAudioProvider(row, sid());
    expect(accepted.state).toBe("joining");
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    expect((await observeVoiceAudioStatus(accepted, "in-progress")).state).toBe("joining");
    const result = await issueVoiceAudioInstruction(accepted);
    expect(result).toMatchObject({ ok: true, connection: { state: "joining", committed_at: null } });
  });
  test("commits the first idle phone only after its owned conference join", async () => {
    const row = await issued(), before = await state(), event = joined(row);
    expect(await observeVoiceAudioConferenceEvent(event)).toMatchObject({ state: "active", conference_sid: event.conferenceSid });
    const connected = await journal.findVoiceAudioConnection(row.id);
    expect(connected?.joined_at).toBeInstanceOf(Date); expect(connected?.committed_at).toBeInstanceOf(Date);
    expect(await state()).toEqual(before);
    const xml = voiceAudioConferenceTwiml(row);
    expect(xml).toContain('endConferenceOnExit="false"'); expect(xml).toContain('muted="false"');
    expect(xml).toContain(`participantLabel="audio:${row.id}:1"`); expect(xml).toContain(`>${row.conference_id}</Conference>`);
    expect(xml).not.toContain("<Number"); expect(xml).not.toContain("record=");
  });
  test("joins a live replacement muted and keeps the original customer and hold", async () => {
    const target = await funded(), row = await issued(target.args), before = await state();
    expect(voiceAudioConferenceTwiml(row)).toContain('muted="true"');
    expect(await observeVoiceAudioConferenceEvent(joined(row))).toMatchObject({ state: "ready", committed_at: null, source_agent_sid: target.parent });
    expect(await state()).toEqual(before);
    const [parent] = await sql`select status from public.call where sid = ${target.parent}`;
    expect(parent.status).toBe("in-progress");
  });
  test.each(["account", "room", "callback", "label", "mute", "conference SID"])("rejects a join with wrong %s", async (field) => {
    const row = await issued(), event = joined(row);
    if (field === "account") event.accountSid = `AC${"0".repeat(32)}`;
    if (field === "room") event.conferenceId = `${actor}~${randomUUID()}`;
    if (field === "callback") event.requestUrl += "&untrusted=1";
    if (field === "label") event.participantLabel = `audio:${row.id}:2`;
    if (field === "mute") event.muted = "true";
    if (field === "conference SID") await sql`update public.workspace_voice_audio_connection set conference_sid = ${`CF${"f".repeat(32)}`} where id = ${row.id}::uuid`;
    await expect(observeVoiceAudioConferenceEvent(event)).rejects.toThrow();
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ state: "joining", joined_at: null, committed_at: null });
  });
  test("cannot attribute an unknown participant or a different workspace to the audio owner", async () => {
    const row = await issued();
    expect(await observeVoiceAudioConferenceEvent(joined(row, { callSid: sid() }))).toBeNull();
    expect(await observeVoiceAudioConferenceEvent(joined(row, { workspaceId: foreignId }))).toBeNull();
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("joining");
  });
  test("does not accept a conference participant before its saved voice instruction", async () => {
    const row = await claim(await prepare()), accepted = await journal.recordVoiceAudioProvider(row, sid());
    await expect(observeVoiceAudioConferenceEvent(joined(accepted))).rejects.toThrow("does not match its conference");
  });
  test("duplicate conference joins retain the committed generation and timestamps", async () => {
    const row = await issued(), event = joined(row), first = await observeVoiceAudioConferenceEvent(event);
    expect(await observeVoiceAudioConferenceEvent(event)).toEqual(first);
  });
  test("a phone leave before its late join cannot reactivate the operation", async () => {
    const row = await issued(), event = joined(row);
    expect(await observeVoiceAudioConferenceEvent({ ...event, event: "participant-leave" })).toMatchObject({ state: "failed" });
    expect(await observeVoiceAudioConferenceEvent(event)).toMatchObject({ state: "failed", committed_at: null });
  });
  test("a canceled replacement cannot become effective on a late join", async () => {
    const row = await issued();
    const { cancelOwnedVoiceAudioConnection } = await import("@/server/voice-audio-lifecycle.server");
    await cancelOwnedVoiceAudioConnection({ workspaceId, userId: actor, connectionId: row.id });
    expect(await observeVoiceAudioConferenceEvent(joined(row))).toMatchObject({ state: "joining", committed_at: null });
  });
  test("membership revocation between instruction and join prevents idle activation", async () => {
    const row = await issued(); await sql`delete from public.workspace_member where workspace_id = ${workspaceId}`;
    expect(await observeVoiceAudioConferenceEvent(joined(row))).toMatchObject({ state: "failed", committed_at: null });
  });
  test("a funded browser call started while the phone joins keeps its original audio", async () => {
    const row = await issued(), target = await funded();
    expect(await observeVoiceAudioConferenceEvent(joined(row))).toMatchObject({ state: "failed", committed_at: null });
    const [customer] = await sql`select status, parent_call_sid from public.call where sid = ${target.child}`;
    expect(customer).toEqual({ status: "in-progress", parent_call_sid: target.parent });
    expect((await state()).reservations).toBe(1);
  });
  test("a funded browser call started before the phone answers prevents its first instruction", async () => {
    const row = await claim(await prepare()), accepted = await journal.recordVoiceAudioProvider(row, sid());
    await funded();
    expect(await issueVoiceAudioInstruction(accepted)).toEqual({ ok: false, reason: "stale_audio" });
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ voice_issued_at: null });
  });
  test("an already issued instruction replays its saved room before mutable device checks", async () => {
    const row = await issued();
    await sql`update public."user" set verified_audio_numbers = '{}' where id = ${actor}::uuid`;
    await sql`update public.workspace_number set suspended_at = now() where workspace = ${workspaceId}::uuid`;
    const replay = await issueVoiceAudioInstruction(row);
    expect(replay).toMatchObject({ ok: true, replayed: true, connection: { id: row.id, conference_id: row.conference_id } });
  });
  test("a later phone joins through the first participant's callback without retiring the current phone", async () => {
    const first = await issued(), connected = await observeVoiceAudioConferenceEvent(joined(first));
    if (!connected) throw new Error("First audio participant required");
    const next = await issued(input({ phoneNumber: otherPhone }));
    expect(next.conference_callback).toBe(first.conference_callback);
    expect(voiceAudioConferenceTwiml(next)).toContain('muted="true"');
    expect(await observeVoiceAudioConferenceEvent(joined(next))).toMatchObject({ state: "ready", committed_at: null });
    expect((await journal.findVoiceAudioConnection(first.id))?.state).toBe("active");
    await sql`update public.workspace_voice_audio_connection set state = 'retired', retired_at = now() where id = ${first.id}::uuid`;
    expect(await observeVoiceAudioConferenceEvent(joined(connected, { event: "participant-leave" }))).toMatchObject({ state: "retired" });
    expect((await journal.findVoiceAudioConnection(next.id))?.state).toBe("ready");
  });
  test("the session API creates one connection-only leg and returns an owned pending snapshot", async () => {
    const response = await apiPost(); expect(response.status).toBe(200); expect(response.headers.get("Set-Cookie")).toBe("audio-session=refreshed");
    const body = await response.json(); expect(body).toMatchObject({ success: true, connection_state: "joining", generation: 1, transport: "phone", cancel_requested: false });
    const row = await journal.findVoiceAudioConnection(body.connection_id); if (!row) throw new Error("Saved API connection required");
    expect(web.create).toHaveBeenCalledExactlyOnceWith({ to: phone, from: callerId, url: row.voice_url, method: "POST",
      statusCallback: row.status_callback, statusCallbackMethod: "POST", statusCallbackEvent: ["initiated", "ringing", "answered", "completed"] });
    expect((await apiControl(row)).status).toBe(200);
    expect(await state()).toMatchObject({ reservations: 0, attempts: 0, queue: 0, ledger: 0 });
    expect(row.conference_id).not.toContain("undefined");
  });
  test("concurrent session retries send at most one provider POST", async () => {
    const body = { workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() };
    const responses = await Promise.all(Array.from({ length: 8 }, () => apiPost(body)));
    expect(responses.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    expect(responses.some((r) => r.status === 200)).toBe(true); expect(web.create).toHaveBeenCalledTimes(1);
    expect((await state()).operations).toBe(1);
  });
  test("API auth, tenant membership and device checks stop before provider create", async () => {
    web.authenticated = false; expect((await apiPost()).status).toBe(401);
    web.authenticated = true; web.userId = otherActor; expect((await apiPost()).status).toBe(404);
    web.userId = actor; expect((await apiPost({ workspaceId: foreignId, phoneNumber: phone })).status).toBe(404);
    expect((await apiPost({ workspaceId, phoneNumber: "+16135550777" })).status).toBe(403);
    expect(web.create).not.toHaveBeenCalled(); expect((await state()).operations).toBe(0);
  });
  test("the API preserves the uniform 402 body before a new idle connection", async () => {
    await sql`update public.workspace set credits = 0 where id = ${workspaceId}::uuid`;
    const response = await apiPost(); expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({ error: "Insufficient credits", creditsError: true });
    expect(web.create).not.toHaveBeenCalled();
  });
  test("the API exposes uncertain creation without retrying the provider POST", async () => {
    web.create.mockRejectedValueOnce(Object.assign(new Error("Owned uncertain API response"), { status: 500 }));
    const body = { workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() };
    const first = await apiPost(body); expect(first.status).toBe(409);
    await expect(first.json()).resolves.toMatchObject({ reason: "voice_audio_pending", connection_state: "creating" });
    expect((await apiPost(body)).status).toBe(409); expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("a late accepted API response honors cancellation instead of restoring audio", async () => {
    let entered: () => void = () => undefined, release: () => void = () => undefined;
    const posted = new Promise<void>((resolve) => { entered = resolve; }), acknowledged = new Promise<void>((resolve) => { release = resolve; });
    const create = web.create.getMockImplementation(); if (!create) throw new Error("Owned provider create required");
    web.create.mockImplementationOnce(async (...args) => { const physical = await create(...args); entered(); await acknowledged; return physical; });
    const intent = randomUUID(), sending = apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent });
    await posted;
    let canceled: Response | undefined, response: Response | undefined, stopsBeforeAck = -1;
    try {
      const [record] = await sql`select id from public.workspace_voice_audio_connection where workspace = ${workspaceId}::uuid and intent_id = ${intent}::uuid`;
      const row = await journal.findVoiceAudioConnection(record.id); if (!row) throw new Error("In-flight audio journal required");
      canceled = await apiControl(row, "DELETE"); stopsBeforeAck = web.update.mock.calls.length;
    } finally { release(); response = await sending; }
    if (!canceled || !response) throw new Error("Audio cancellation responses required");
    expect(canceled.status).toBe(200);
    await expect(canceled.json()).resolves.toMatchObject({ connection_state: "creating", cancel_requested: true });
    expect(stopsBeforeAck).toBe(0); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ connection_state: "canceled", cancel_requested: true });
    expect(web.create).toHaveBeenCalledTimes(1); expect(web.update).toHaveBeenCalledTimes(1);
  });
  test("a definite provider API refusal has a safe visible error and no uncertain retry", async () => {
    web.create.mockRejectedValueOnce(Object.assign(new Error("owned-provider-secret-marker"), { status: 400 }));
    const body = { workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() };
    const response = await apiPost(body); expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Unable to connect the agent device" });
    expect((await apiPost(body)).status).toBe(409); expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("GET and DELETE are owned by the session and cannot end another user's audio", async () => {
    const response = await apiPost(), body = await response.json(), row = await journal.findVoiceAudioConnection(body.connection_id);
    if (!row) throw new Error("Saved API connection required");
    expect((await apiControl(row, "GET", foreignId)).status).toBe(404);
    web.userId = otherActor; expect((await apiControl(row)).status).toBe(404); expect((await apiControl(row, "DELETE")).status).toBe(404);
    expect(web.update).not.toHaveBeenCalled();
    web.userId = actor; const canceled = await apiControl(row, "DELETE"); expect(canceled.status).toBe(200);
    await expect(canceled.json()).resolves.toMatchObject({ connection_state: "canceled", cancel_requested: true });
    expect(web.update).toHaveBeenCalledExactlyOnceWith(row.provider_sid, { status: "canceled" });
  });
  test("a signed phone answer needs press 1 before the saved conference is issued", async () => {
    const row = await claim(await prepare()), params = voiceParams(row);
    const response = await signedAudio(row.voice_url, params), prompt = await response.text();
    expect(response.status).toBe(200); expect(prompt).toContain("<Gather"); expect(prompt).toContain('numDigits="1"'); expect(prompt).toContain("press 1");
    expect(prompt).not.toContain("<Conference"); expect((await journal.findVoiceAudioConnection(row.id))?.voice_issued_at).toBeNull();
    const confirmed = await signedAudio(row.voice_url, { ...params, Digits: "1" }), xml = await confirmed.text();
    expect(confirmed.status).toBe(200); expect(xml).toContain(`>${row.conference_id}</Conference>`); expect(xml).not.toContain("<Number");
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: params.CallSid, state: "joining", committed_at: null });
  });
  test.each(["signature", "account", "destination", "sender", "direction", "parent", "callback", "alias", "duplicate"])(
    "the signed endpoint rejects changed %s before issuing audio", async (field) => {
      const row = await claim(await prepare()), params: Record<string, string> = voiceParams(row);
      if (field === "account") params.AccountSid = `AC${"0".repeat(32)}`;
      if (field === "destination") params.To = otherPhone;
      if (field === "sender") params.From = otherPhone;
      if (field === "direction") params.Direction = "inbound";
      if (field === "parent") params.ParentCallSid = sid();
      if (field === "alias") params.call_sid = sid();
      const url = field === "callback" ? row.voice_url + "&extra=1" : row.voice_url;
      const response = await signedAudio(url, params, field !== "signature", field === "duplicate" ? [["To", otherPhone]] : []);
      expect(response.status).toBe(403);
      expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: null, voice_issued_at: null, committed_at: null });
    },
  );
  test("signed answered status cannot activate the transport; the owned join does", async () => {
    const row = await claim(await prepare()), params = voiceParams(row);
    expect((await signedAudio(row.status_callback, params)).status).toBe(204);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("joining");
    expect((await signedAudio(row.voice_url, { ...params, Digits: "1" })).status).toBe(200);
    const event = { AccountSid: accountSid, CallSid: params.CallSid, FriendlyName: row.conference_id, ConferenceSid: `CF${randomUUID().replaceAll("-", "")}`,
      ParticipantLabel: `audio:${row.id}:1`, Muted: "false", StatusCallbackEvent: "participant-join" };
    expect((await signedAudio(row.conference_callback, event)).status).toBe(204);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("active");
    expect(await state()).toMatchObject({ reservations: 0, ledger: 0, attempts: 0, queue: 0 });
  });
  test.each([false, true])("owned conference delivery retries failures with the saved signed URL, live=%s", async (live) => {
    const target = live ? await funded() : null, row = await claim(await prepare(target?.args)), params = voiceParams(row);
    const response = await signedAudio(row.voice_url, { ...params, Digits: "1" }); expect(response.status).toBe(200);
    const xml = await response.text(), callback = xml.match(/<Conference[^>]*statusCallback="([^"]+)"/);
    if (!callback) throw new Error("Conference callback required");
    const url = new URL(callback[1].replaceAll("&amp;", "&"));
    expect(url.hash).toBe("#ct=1000&rt=3000&tt=15000&rc=2&rp=ct,rt,5xx");
    url.hash = ""; expect(url.href).toBe(row.conference_callback);
    const event = { AccountSid: accountSid, CallSid: params.CallSid, FriendlyName: row.conference_id,
      ConferenceSid: `CF${randomUUID().replaceAll("-", "")}`, ParticipantLabel: `audio:${row.id}:1`,
      Muted: String(live), StatusCallbackEvent: "participant-join" };
    expect((await signedAudio(url.href, event)).status).toBe(204);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe(live ? "ready" : "active");
  });
  test.each(["", "2", "11"])("an absent or wrong confirmation %s cannot join customer audio", async (digits) => {
    const row = await claim(await prepare()), params = { ...voiceParams(row), Digits: digits };
    const response = await signedAudio(row.voice_url, params), xml = await response.text();
    expect(response.status).toBe(200); expect(xml).toContain("<Hangup"); expect(xml).not.toContain("<Conference");
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ voice_issued_at: null, committed_at: null });
  });
  test("terminal signed audio status stays outside customer billing and outcomes", async () => {
    const row = await claim(await prepare()), params = { ...voiceParams(row), CallStatus: "completed", CallDuration: "61" };
    expect((await signedAudio(row.status_callback, params)).status).toBe(204);
    expect((await signedAudio(row.status_callback, params)).status).toBe(204);
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ state: "failed", terminal_status: "completed" });
    expect(await state()).toMatchObject({ ledger: 0, attempts: 0, queue: 0, reservations: 0 });
  });
  test("the first funded conference callback accepts replacement audio without dispatching a customer", async () => {
    const target = await funded(true), row = await issued(target.args), before = await state();
    const params = { AccountSid: accountSid, CallSid: row.provider_sid ?? "", FriendlyName: target.room, ConferenceSid: target.cf,
      ParticipantLabel: `audio:${row.id}:1`, Muted: "true", StatusCallbackEvent: "participant-join" };
    const response = await signedPredictive(row.conference_callback, params); expect(response.status).toBe(200);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("ready");
    expect(web.create).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test.each(["label", "mute"])("the funded callback rejects a wrong replacement %s before participant work", async (field) => {
    const target = await funded(true), row = await issued(target.args);
    const params = { AccountSid: accountSid, CallSid: row.provider_sid ?? "", FriendlyName: target.room, ConferenceSid: target.cf,
      ParticipantLabel: field === "label" ? `audio:${row.id}:999` : `audio:${row.id}:1`, Muted: field === "mute" ? "false" : "true", StatusCallbackEvent: "participant-join" };
    expect((await signedPredictive(row.conference_callback, params)).status).toBe(403);
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ state: "joining", joined_at: null });
    expect(web.create).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
  });
  test("a retired original browser cannot end the conference on its delayed leave", async () => {
    const target = await funded(true), row = await issued(target.args);
    await observeVoiceAudioConferenceEvent(joined(row));
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${row.id}::uuid`;
    rooms.records.set(target.cf, { sid: target.cf, accountSid, friendlyName: target.room, status: "in-progress" });
    const params = { AccountSid: accountSid, CallSid: target.parent, FriendlyName: target.room, ConferenceSid: target.cf,
      StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedPredictive(row.conference_callback, params)).status).toBe(200);
    expect(rooms.update).not.toHaveBeenCalled(); expect(rooms.records.get(target.cf)?.status).toBe("in-progress");
    const [customer] = await sql`select status from public.call where sid = ${target.child}`;
    expect(customer.status).toBe("in-progress"); expect((await state()).ledger).toBe(0);
  });
  test("an uncommitted replacement hangup keeps the existing customer conference", async () => {
    const target = await funded(true), row = await issued(target.args);
    await observeVoiceAudioConferenceEvent(joined(row));
    rooms.records.set(target.cf, { sid: target.cf, accountSid, friendlyName: target.room, status: "in-progress" });
    const event = { AccountSid: accountSid, CallSid: row.provider_sid ?? "", FriendlyName: target.room, ConferenceSid: target.cf,
      ParticipantLabel: `audio:${row.id}:1`, Muted: "true", StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedPredictive(row.conference_callback, event)).status).toBe(200);
    expect(rooms.update).not.toHaveBeenCalled(); expect(rooms.records.get(target.cf)?.status).toBe("in-progress");
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("failed");
  });
  test("a newer committed audio generation fences a late old phone leave before its retirement stamp", async () => {
    const target = await funded(true), first = await issued(target.args); await observeVoiceAudioConferenceEvent(joined(first));
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${first.id}::uuid`;
    const next = await issued({ ...target.args, intentId: randomUUID(), phoneNumber: otherPhone, expectedAgentSid: first.provider_sid ?? "" });
    await observeVoiceAudioConferenceEvent(joined(next));
    await sql`update public.workspace_voice_audio_connection set state = 'failed' where id = ${first.id}::uuid`;
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${next.id}::uuid`;
    rooms.records.set(target.cf, { sid: target.cf, accountSid, friendlyName: target.room, status: "in-progress" });
    const event = { AccountSid: accountSid, CallSid: first.provider_sid ?? "", FriendlyName: target.room, ConferenceSid: target.cf,
      ParticipantLabel: `audio:${first.id}:1`, Muted: "false", StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedPredictive(first.conference_callback, event)).status).toBe(200);
    expect(rooms.update).not.toHaveBeenCalled(); expect((await journal.findVoiceAudioConnection(next.id))?.state).toBe("active");
  });
  test.each([false, true])("the current phone ends its conference even when terminal status arrives first: %s", async (statusFirst) => {
    const target = await funded(true), row = await issued(target.args);
    await observeVoiceAudioConferenceEvent(joined(row));
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${row.id}::uuid`;
    rooms.records.set(target.cf, { sid: target.cf, accountSid, friendlyName: target.room, status: "in-progress" });
    const status = { ...voiceParams(row, row.provider_sid ?? ""), CallStatus: "completed", CallDuration: "61" };
    if (statusFirst) expect((await signedAudio(row.status_callback, status)).status).toBe(204);
    const event = { AccountSid: accountSid, CallSid: row.provider_sid ?? "", FriendlyName: target.room, ConferenceSid: target.cf,
      ParticipantLabel: `audio:${row.id}:1`, Muted: "false", StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedPredictive(row.conference_callback, event)).status).toBe(200);
    expect(rooms.update).toHaveBeenCalledExactlyOnceWith(target.cf, { status: "completed" });
    if (!statusFirst) expect((await signedAudio(row.status_callback, status)).status).toBe(204);
    expect((await state()).ledger).toBe(0);
    const [customer] = await sql`select status from public.call where sid = ${target.child}`;
    expect(customer.status).toBe("in-progress");
  });
  test("a provider stop failure on the current phone returns 500 for retry", async () => {
    const row = await issued(), event = joined(row); await observeVoiceAudioConferenceEvent(event);
    rooms.records.set(event.conferenceSid, { sid: event.conferenceSid, accountSid, friendlyName: row.conference_id, status: "in-progress" });
    rooms.update.mockRejectedValueOnce(new Error("Owned conference stop failure"));
    const params = { AccountSid: accountSid, CallSid: row.provider_sid ?? "", FriendlyName: row.conference_id, ConferenceSid: event.conferenceSid,
      ParticipantLabel: `audio:${row.id}:1`, Muted: "false", StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedAudio(row.conference_callback, params)).status).toBe(500);
    expect((await signedAudio(row.conference_callback, params)).status).toBe(204);
    expect(rooms.records.get(event.conferenceSid)?.status).toBe("completed");
  });
  test.each([false, true])("signed parent continuation preserves the existing customer and original audio, REST=%s", async (rest) => {
    const f = await parentContinuationFixture(rest), before = await state();
    const identity = () => sql`select r.provider_sid, r.setup_sid, r.account_sid, r.conference_id, c.sid, c.direction, c.parent_call_sid
      from public.workspace_voice_reservation r join public.call c on c.sid = r.provider_sid where r.id = ${f.target.id}::uuid`;
    const prior = await identity();
    for (let retry = 0; retry < 3; retry++) {
      const response = await signedParent(f.url, f.params); expect(response.status).toBe(200); const xml = await response.text();
      expect(xml).toContain(`>${f.row.conference_id}</Conference>`); expect(xml).toContain('endConferenceOnExit="false"');
      expect(xml).toContain('muted="false"'); expect(xml).toContain(`participantLabel="parent:${f.row.id}:${f.row.generation}"`);
      const callback = xml.match(/<Conference[^>]*statusCallback="([^"]+)"/);
      if (!callback) throw new Error("Original parent conference callback required");
      const url = new URL(callback[1].replaceAll("&amp;", "&"));
      expect(url.hash).toBe("#ct=1000&rt=3000&tt=15000&rc=2&rp=ct,rt,5xx");
      url.hash = ""; expect(url.href).toBe(f.row.conference_callback);
      expect(xml).not.toContain("<Number");
    }
    expect(await state()).toEqual(before); expect(await identity()).toEqual(prior);
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ state: "switching", committed_at: null });
    expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
  });
  test.each(["ordinary", "unjoined", "committed", "wrong-customer", "wrong-actor", "settled-customer", "ended-parent"])("parent continuation cannot adopt %s audio", async (change) => {
    const f = await parentContinuationFixture();
    if (change === "ordinary") await sql`update public.workspace_voice_audio_connection set promotion_requested_at = null, state = 'ready' where id = ${f.row.id}::uuid`;
    if (change === "unjoined") await sql`update public.workspace_voice_audio_connection set joined_at = null where id = ${f.row.id}::uuid`;
    if (change === "committed") await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${f.row.id}::uuid`;
    if (change === "wrong-customer") await sql`update public.workspace_voice_audio_connection set customer_sid = ${sid()} where id = ${f.row.id}::uuid`;
    if (change === "wrong-actor") await sql`update public.workspace_voice_audio_connection set user_id = ${otherActor} where id = ${f.row.id}::uuid`;
    if (change === "settled-customer") await sql`update public.workspace_voice_reservation set state = 'settled' where id = ${f.target.id}::uuid`;
    if (change === "ended-parent") await sql`update public.workspace_voice_reservation set setup_terminal_at = now(), setup_terminal_status = 'completed' where id = ${f.target.id}::uuid`;
    const before = await state(), response = await signedParent(f.url, f.params);
    expect(response.status).toBe(200); expect(await response.text()).toContain("<Hangup");
    expect(web.fetch).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test.each(["failed", "canceled", "retired"])("a %s replacement still lets the original parent rejoin its customer", async (failureState) => {
    const f = await parentContinuationFixture();
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    if (failureState === "canceled") await sql`update public.workspace_voice_audio_connection set cancel_requested_at = now() where id = ${f.row.id}::uuid`;
    await observeVoiceAudioStatus(f.row, "completed", "10");
    if (failureState === "retired") await sql`update public.workspace_voice_audio_connection set state = 'retired', retired_at = now() where id = ${f.row.id}::uuid`;
    const before = await state(), response = await signedParent(f.url, f.params);
    expect(response.status).toBe(200); expect(await response.text()).toContain(`>${f.row.conference_id}</Conference>`);
    expect(await state()).toEqual(before);
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ state: failureState, committed_at: null });
    expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });
  test("a failed old promotion cannot restore the original parent after a newer transport commits", async () => {
    const f = await parentContinuationFixture(), nextId = randomUUID();
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    await observeVoiceAudioStatus(f.row, "completed", "10");
    const now = new Date().toISOString(), nextRoom = `${actor}~${randomUUID()}`;
    const overrides = { id: nextId, intent_id: randomUUID(), generation: f.row.generation + 1, destination: otherPhone,
      state: "active", provider_sid: sid(), conference_id: nextRoom, conference_sid: `CF${randomUUID().replaceAll("-", "")}`,
      voice_url: `${baseUrl}/api/voice-audio?connection=${nextId}&event=voice`, status_callback: `${baseUrl}/api/voice-audio?connection=${nextId}&event=status`,
      conference_callback: `${baseUrl}/api/voice-audio?connection=${nextId}&event=conference`, committed_at: now, joined_at: now,
      customer_joined_at: now, parent_joined_at: now, terminal_at: null, terminal_status: null, retired_at: null, cancel_requested_at: null };
    await sql`insert into public.workspace_voice_audio_connection
      select (jsonb_populate_record(null::public.workspace_voice_audio_connection, to_jsonb(prior) || ${sql.json(overrides)}::jsonb)).*
      from public.workspace_voice_audio_connection prior where prior.id = ${f.row.id}::uuid`;
    const response = await signedParent(f.url, f.params); expect(response.status).toBe(200);
    expect(await response.text()).toContain("<Hangup"); expect(web.fetch).not.toHaveBeenCalled();
  });
  test.each(["AccountSid", "CallSid", "DialCallSid", "From", "To", "Direction", "ParentCallSid", "call_sid", "dial_call_sid"])("signed parent rejects conflicting %s", async (key) => {
    const f = await parentContinuationFixture(true), params = { ...f.params, [key]: key.endsWith("Sid") || key === "call_sid" ? sid() : "wrong" };
    const before = await state(), response = await signedParent(f.url, params);
    expect(response.status).toBe(403); expect(web.fetch).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test.each([["CallSid", "call_sid"], ["DialCallSid", "dial_call_sid"]])("parent normalizes signed %s only after raw signature validation", async (canonical, alias) => {
    const f = await parentContinuationFixture(), params: Record<string, string> = { ...f.params };
    params[alias] = params[canonical] ?? ""; delete params[canonical];
    const response = await signedParent(f.url, params); expect(response.status).toBe(200);
    expect(await response.text()).toContain(`>${f.row.conference_id}</Conference>`);
  });
  test.each(["signature", "duplicate-form", "duplicate-query", "extra-query", "foreign-nonce", "unsaved-url"])("parent rejects %s before any provider read", async (change) => {
    const f = await parentContinuationFixture(); let url = f.url;
    if (change === "duplicate-query") url += `&credit_reservation=${f.target.id}`;
    if (change === "extra-query") url += "&other=1";
    if (change === "foreign-nonce") url = `${baseUrl}/api/voice-continuation?credit_reservation=${randomUUID()}`;
    if (change === "unsaved-url") await sql`update public.workspace_voice_reservation set setup_continuation_url = null where id = ${f.target.id}::uuid`;
    const before = await state(), response = await signedParent(url, f.params, change !== "signature", change === "duplicate-form" ? [["CallSid", f.target.parent]] : []);
    expect(response.status).toBe(403); expect(web.fetch).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test.each([
    ["parent", "sid"], ["parent", "accountSid"], ["parent", "to"], ["parent", "from"], ["parent", "direction"], ["parent", "parentCallSid"],
    ["child", "sid"], ["child", "accountSid"], ["child", "to"], ["child", "from"], ["child", "direction"], ["child", "parentCallSid"],
  ])("parent continuation checks actual %s %s", async (leg, field) => {
    const f = await parentContinuationFixture(), id = leg === "parent" ? f.target.parent : f.target.child;
    const physical = web.records.get(id); if (!physical) throw new Error("Owned physical call required");
    web.records.set(id, { ...physical, [field]: field === "sid" || field === "parentCallSid" ? sid() : "wrong" });
    const before = await state(), response = await signedParent(f.url, f.params);
    expect(response.status).toBe(403); expect(await state()).toEqual(before); expect(web.update).not.toHaveBeenCalled();
  });
  test.each(["parent", "child"])("an ended %s cannot resume a manual promotion", async (leg) => {
    const f = await parentContinuationFixture(), id = leg === "parent" ? f.target.parent : f.target.child;
    const physical = web.records.get(id); if (!physical) throw new Error("Owned physical call required"); physical.status = "completed";
    const before = await state(), response = await signedParent(f.url, f.params);
    expect(response.status).toBe(200); expect(await response.text()).toContain("<Hangup"); expect(await state()).toEqual(before);
  });
  test("a temporary provider read failure preserves the original parent without committing replacement audio", async () => {
    const f = await parentContinuationFixture(), before = await state();
    web.fetch.mockRejectedValueOnce(new Error("Owned parent read failure"));
    const first = await signedParent(f.url, f.params); expect(first.status).toBe(200);
    expect(await first.text()).toContain(`>${f.row.conference_id}</Conference>`);
    const response = await signedParent(f.url, f.params); expect(response.status).toBe(200);
    expect(await response.text()).toContain(`>${f.row.conference_id}</Conference>`);
    expect(await state()).toEqual(before); expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ state: "switching", committed_at: null });
  });
  test("unavailable original API credentials cannot send provider reads to another account or drop the parent", async () => {
    const f = await parentContinuationFixture(), before = await state(); web.accountSid = `AC${randomUUID().replaceAll("-", "")}`;
    const response = await signedParent(f.url, f.params); expect(response.status).toBe(200);
    expect(await response.text()).toContain(`>${f.row.conference_id}</Conference>`);
    expect(web.fetch).not.toHaveBeenCalled(); expect(web.create).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test("a slow provider read cannot keep the parent continuation waiting beyond its voice response budget", async () => {
    const f = await parentContinuationFixture(), releases: Array<() => void> = [];
    web.fetch.mockImplementation((id: string) => new Promise<ApiPhysical>((resolve) => {
      const physical = web.records.get(id); if (!physical) throw new Error("Owned physical call required");
      releases.push(() => resolve(physical));
    }));
    const pending = signedParent(f.url, f.params); let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([pending, new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("Original audio was not preserved within 3 seconds")), 3000);
      })]);
      expect(response.status).toBe(200); expect(await response.text()).toContain(`>${f.row.conference_id}</Conference>`);
      expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ state: "switching", committed_at: null });
    } finally {
      clearTimeout(deadline); for (const release of releases) release(); await pending;
    }
  });
  test.each(["parent", "customer"] as const)("an ended replacement still records its owned %s conference join", async (leg) => {
    const f = await endedReplacementFixture(), before = await state();
    const response = await signedAudio(f.row.conference_callback, bridgeParams(f, leg, true)); expect(response.status).toBe(204);
    const saved = await journal.findVoiceAudioConnection(f.row.id);
    expect(leg === "parent" ? saved?.parent_joined_at : saved?.customer_joined_at).toBeInstanceOf(Date);
    expect(saved).toMatchObject({ state: "failed", committed_at: null, terminal_status: "completed" });
    expect(await state()).toEqual(before); expect(rooms.update).not.toHaveBeenCalled();
  });
  test.each([
    { leg: "parent" as const, statusFirst: false }, { leg: "parent" as const, statusFirst: true }, { leg: "customer" as const, statusFirst: false },
  ])("a genuine current $leg hangup ends its owned manual room, statusFirst=$statusFirst", async ({ leg, statusFirst }) => {
    const f = await endedReplacementFixture();
    if (statusFirst) {
      await sql`update public.call set status = 'completed' where sid = ${f.target.parent}`;
      await sql`update public.workspace_voice_reservation set setup_terminal_at = now(), setup_terminal_status = 'completed' where id = ${f.target.id}::uuid`;
    }
    const before = await state(), response = await signedAudio(f.row.conference_callback, bridgeParams(f, leg, false));
    expect(response.status).toBe(204); expect(rooms.records.get(f.conferenceSid)?.status).toBe("completed");
    expect(await state()).toEqual(before);
    const [child] = await sql`select status from public.call where sid = ${f.target.child}`;
    expect(child.status).toBe("in-progress"); expect(web.update).not.toHaveBeenCalled();
  });
  test("a retired original parent cannot end the customer room through the first callback owner", async () => {
    const f = await endedReplacementFixture(true);
    const response = await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false)); expect(response.status).toBe(204);
    expect(rooms.records.get(f.conferenceSid)?.status).toBe("in-progress"); expect(rooms.fetch).not.toHaveBeenCalled();
    expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stop_requested_at).toBeNull();
  });
  test("a manual-room stop failure retries its exact room without customer outcomes", async () => {
    const f = await endedReplacementFixture(), before = await state(), params = bridgeParams(f, "parent", false);
    rooms.update.mockRejectedValueOnce(new Error("Owned manual room stop failure"));
    expect((await signedAudio(f.row.conference_callback, params)).status).toBe(500);
    expect((await signedAudio(f.row.conference_callback, params)).status).toBe(204);
    expect(rooms.records.get(f.conferenceSid)?.status).toBe("completed"); expect(await state()).toEqual(before);
  });
  test.each(["sid", "accountSid", "friendlyName"])("manual room stop refuses a provider %s mismatch", async (field) => {
    const f = await endedReplacementFixture(), physical = rooms.records.get(f.conferenceSid);
    if (!physical) throw new Error("Owned provider conference required");
    rooms.records.set(f.conferenceSid, { ...physical, [field]: "foreign" });
    const before = await state(), response = await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false));
    expect(response.status).toBe(500); expect(rooms.update).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  async function failRoomStop() {
    const f = await endedReplacementFixture(); rooms.update.mockRejectedValueOnce(new Error("Owned room stop needs recovery"));
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false))).status).toBe(500);
    return f;
  }
  async function ageRoomStop(row: Connection) {
    await sql`update public.workspace_voice_audio_connection set lease_expires_at = now() - interval '1 minute' where id = ${row.id}::uuid`;
  }
  test("a terminal callback owner retains its room stop after status repair and worker restart", async () => {
    const f = await failRoomStop(), before = await state();
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    await observeVoiceAudioStatus(f.row, "completed", "10"); await ageRoomStop(f.row);
    const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toEqual({ examined: 1, closed: 1, expired: 0, pending: 0 });
    expect(rooms.records.get(f.conferenceSid)?.status).toBe("completed");
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ conference_stop_call_sid: f.target.parent,
      conference_stop_requested_at: expect.any(Date), conference_stopped_at: expect.any(Date), terminal_status: "completed" });
    expect(await state()).toEqual(before); expect(web.fetch).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });
  test("a lost accepted room-stop reply is recovered without another provider update", async () => {
    const f = await endedReplacementFixture(), before = await state();
    rooms.update.mockImplementationOnce(async (id: string) => {
      const room = rooms.records.get(id); if (!room) throw new Error("Owned conference required");
      room.status = "completed"; throw new Error("Lost room-stop acknowledgement");
    });
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "customer", false))).status).toBe(500);
    await ageRoomStop(f.row); const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, closed: 1 });
    expect(rooms.update).toHaveBeenCalledOnce(); expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stopped_at).toBeInstanceOf(Date);
    expect(await state()).toEqual(before);
  });
  test("worker stop failures keep the room intent for a later retry", async () => {
    const f = await failRoomStop(); await ageRoomStop(f.row); rooms.update.mockRejectedValueOnce(new Error("Room stop still unavailable"));
    const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1 });
    expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stopped_at).toBeNull();
    await ageRoomStop(f.row); expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, closed: 1 });
    expect(rooms.records.get(f.conferenceSid)?.status).toBe("completed");
  });
  test.each(["sid", "accountSid", "friendlyName"])("room-stop recovery retains intent on a provider %s mismatch", async (field) => {
    const f = await failRoomStop(), room = rooms.records.get(f.conferenceSid); if (!room) throw new Error("Owned conference required");
    rooms.records.set(f.conferenceSid, { ...room, [field]: "foreign" }); rooms.update.mockClear(); await ageRoomStop(f.row);
    const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1 });
    expect(rooms.update).not.toHaveBeenCalled(); expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stopped_at).toBeNull();
  });
  test("new audio intent cannot adopt an agent while its previous room stop is pending", async () => {
    const f = await failRoomStop();
    const response = await apiPost({ workspaceId, phoneNumber: phone, callSid: f.target.child,
      expected_agent_sid: f.target.parent, connection_intent_id: randomUUID() });
    expect(response.status).toBe(409); expect(web.create).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ operations: 1 });
  });
  test("a prepared replacement cannot send after the current room starts ending", async () => {
    const f = await endedReplacementFixture(), next = await prepare({ ...f.target.args, intentId: randomUUID() });
    expect(next.id).not.toBe(f.row.id); expect(next.state).toBe("prepared");
    rooms.update.mockRejectedValueOnce(new Error("Owned room stop pending"));
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false))).status).toBe(500);
    expect(await journal.claimVoiceAudioSend(next)).toEqual({ ok: false, reason: "connection_pending" });
    expect((await journal.findVoiceAudioConnection(next.id))?.send_started_at).toBeNull();
  });
  test("a saved room stop prevents the original parent from rejoining", async () => {
    const f = await failRoomStop(), response = await signedParent(f.url, f.params);
    expect(response.status).toBe(200); expect(await response.text()).toContain("<Hangup");
  });
  test("a room-stop checkpoint failure prevents provider I/O", async () => {
    const f = await endedReplacementFixture();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin raise exception 'Owned room stop write fault'; end $$`);
    await sql.unsafe(`create trigger ${fault} before update of conference_stop_requested_at on public.workspace_voice_audio_connection
      for each row when (new.conference_stop_requested_at is not null) execute function public.${fault}()`);
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false))).status).toBe(500);
    expect(rooms.fetch).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
  });
  test("concurrent workers claim a terminal owner's pending room stop once", async () => {
    const f = await failRoomStop(); await ageRoomStop(f.row);
    const { claimVoiceAudioRecovery } = await import("@/server/voice-audio-lifecycle.server");
    const claims = await Promise.all(Array.from({ length: 3 }, () => claimVoiceAudioRecovery(1)));
    expect(claims.flat().map(r => r.id)).toEqual([f.row.id]);
  });
  test("an old stop lease cannot perform provider I/O after another worker claims it", async () => {
    const f = await failRoomStop(), old = await journal.findVoiceAudioConnection(f.row.id); if (!old) throw new Error("Saved stop required");
    await ageRoomStop(f.row); const { claimVoiceAudioRecovery } = await import("@/server/voice-audio-lifecycle.server");
    const [claimed] = await claimVoiceAudioRecovery(1); if (!claimed) throw new Error("Claimed stop required");
    rooms.fetch.mockClear(); rooms.update.mockClear(); const { attemptVoiceAudioConferenceStop } = await import("@/lib/voice-audio-stop.server");
    expect(await attemptVoiceAudioConferenceStop(old)).toBeNull(); expect(rooms.fetch).not.toHaveBeenCalled();
    expect(await attemptVoiceAudioConferenceStop(claimed)).toMatchObject({ conference_stopped_at: expect.any(Date) });
    expect(rooms.update).toHaveBeenCalledOnce();
  });
  test("a room acknowledgement write failure is recovered after the provider has stopped it", async () => {
    const f = await endedReplacementFixture();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin raise exception 'Owned stop acknowledgement fault'; end $$`);
    await sql.unsafe(`create trigger ${fault} before update of conference_stopped_at on public.workspace_voice_audio_connection
      for each row when (new.conference_stopped_at is not null) execute function public.${fault}()`);
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false))).status).toBe(500);
    expect(rooms.records.get(f.conferenceSid)?.status).toBe("completed");
    await clearFault(); await ageRoomStop(f.row); const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, closed: 1 }); expect(rooms.update).toHaveBeenCalledOnce();
    expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stopped_at).toBeInstanceOf(Date);
  });
  test("room-stop recovery cannot use API credentials for another account", async () => {
    const f = await failRoomStop(); await ageRoomStop(f.row); web.accountSid = `AC${randomUUID().replaceAll("-", "")}`;
    rooms.fetch.mockClear(); rooms.update.mockClear(); const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1 });
    expect(rooms.fetch).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
    expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stopped_at).toBeNull();
  });
  test("a room stop in flight blocks a concurrent new audio request", async () => {
    const f = await endedReplacementFixture(); let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }), blocked = new Promise<void>(resolve => { release = resolve; });
    rooms.update.mockImplementationOnce(async (id: string) => {
      entered(); await blocked; const room = rooms.records.get(id); if (!room) throw new Error("Owned room required");
      room.status = "completed"; return room;
    });
    const pending = signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false));
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([started, new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("Owned conference stop did not reach provider I/O")), 3000);
      })]);
      expect((await apiPost({ workspaceId, phoneNumber: phone, callSid: f.target.child,
        expected_agent_sid: f.target.parent, connection_intent_id: randomUUID() })).status).toBe(409);
      expect(web.create).not.toHaveBeenCalled();
    } finally { clearTimeout(deadline); release(); expect((await pending).status).toBe(204); }
  });
  test("an accepted replacement cannot receive join instructions after a room stop starts", async () => {
    const f = await endedReplacementFixture(), next = await claim(await prepare({ ...f.target.args, intentId: randomUUID() }));
    const accepted = await journal.recordVoiceAudioProvider(next, sid()); rooms.update.mockRejectedValueOnce(new Error("Room stop unavailable"));
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false))).status).toBe(500);
    expect(await issueVoiceAudioInstruction(accepted, "1")).toEqual({ ok: false, reason: "stale_audio" });
    expect((await journal.findVoiceAudioConnection(next.id))?.voice_issued_at).toBeNull();
    expect((await journal.findVoiceAudioConnection(next.id))?.cancel_requested_at).toBeInstanceOf(Date);
  });
  test("a late initial phone join cannot activate while an older idle room is ending", async () => {
    const first = await observeVoiceAudioConferenceEvent(joined(await issued())); if (!first?.conference_sid) throw new Error("Active idle phone required");
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server"); await observeVoiceAudioStatus(first, "completed", "10");
    const next = await issued();
    rooms.records.set(first.conference_sid, { sid: first.conference_sid, accountSid, friendlyName: first.conference_id, status: "in-progress" });
    rooms.update.mockRejectedValueOnce(new Error("Idle room stop unavailable"));
    expect((await signedAudio(first.conference_callback, { AccountSid: accountSid, CallSid: first.provider_sid ?? "", FriendlyName: first.conference_id,
      ConferenceSid: first.conference_sid, ParticipantLabel: `audio:${first.id}:${first.generation}`, Muted: "false",
      StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" })).status).toBe(500);
    expect(await observeVoiceAudioConferenceEvent(joined(next))).toMatchObject({ state: "failed", committed_at: null, cancel_requested_at: expect.any(Date) });
  });
});
