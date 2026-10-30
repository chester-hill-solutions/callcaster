import { randomUUID } from "node:crypto";
import postgres from "postgres";
import twilio from "twilio";
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { asRouteResponse, routeArgs } from "./route-result";
import type { VoiceAudioConnectionInput } from "@/lib/voice-audio-connection";
import { type VoiceAudioProviderIdentity } from "@/server/voice-audio-callback.server";
import { issueVoiceAudioInstruction, observeVoiceAudioConferenceEvent, type VoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";

vi.hoisted(() => { process.env.TZ = "UTC"; process.env.BASE_URL = "https://audio-connection.example.test"; process.env.TWILIO_VALIDATE_WEBHOOKS = "true"; });

export type ApiPhysical = { sid: string; accountSid: string; to: string; from: string; direction: string; parentCallSid: string | null;
  status: string; duration: string | null; dateCreated: Date; dateUpdated: Date; endTime: Date | null; voiceUrl: string; statusCallback: string };

const web = vi.hoisted(() => ({ userId: "", accountSid: "", authenticated: true, create: vi.fn(), fetch: vi.fn(), update: vi.fn(), records: new Map<string, ApiPhysical>() }));

const rooms = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), list: vi.fn(), participant: vi.fn(), records: new Map<string, { sid: string; accountSid: string; friendlyName: string; status: string }>() }));

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
    conferences: Object.assign((id: string) => ({ fetch: () => rooms.fetch(id), update: (args: { status: string }) => rooms.update(id, args),
      participants: (callSid: string) => ({ fetch: () => rooms.participant(id, callSid) }) }), { list: rooms.list }),
  }),
}));

vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(),
  emitPostgresChangeEvent: vi.fn(), emitQueueEvent: vi.fn(), emitPredictiveBroadcast: vi.fn(),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

export const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID(), otherActor = randomUUID();

export const accountSid = `AC${randomUUID().replaceAll("-", "")}`;

export const phone = "+16135550601", otherPhone = "+16135550602", callerId = "+16135550600", customer = "+16135550699";

export const baseUrl = "https://audio-connection.example.test";

export const sid = () => `CA${randomUUID().replaceAll("-", "")}`;

export const fault = `audio_receipt_${randomUUID().replaceAll("-", "")}`;

export let sql: postgres.Sql;

export let journal: typeof import("@/server/voice-audio-connection.server");

export let dispatch: typeof import("@/lib/voice-audio-dispatch.server");

type Input = VoiceAudioConnectionInput & { baseUrl: string };

type Connection = Awaited<ReturnType<typeof journal.findVoiceAudioConnection>> & {};

export async function clearFault() {
  await sql.unsafe(`drop trigger if exists ${fault} on public.call`);
  await sql.unsafe(`drop trigger if exists ${fault} on public.workspace_voice_audio_connection`);
  await sql.unsafe(`drop trigger if exists ${fault} on public.workspace_voice_recording_operation`);
  await sql.unsafe(`drop function if exists public.${fault}()`);
}

export function input(overrides: Partial<Input> = {}): Input {
  return { workspaceId, userId: actor, intentId: randomUUID(), transport: "phone", phoneNumber: phone, baseUrl, ...overrides };
}

export async function prepare(args = input()) {
  const result = await journal.prepareVoiceAudioConnection(args);
  if (!result.ok) throw new Error(`Audio fixture preparation refused: ${result.reason}`);
  return result.connection;
}

export async function state() {
  const [row] = await sql`select credits,
    (select count(*)::int from public.workspace_voice_audio_connection where workspace = ${workspaceId}::uuid) as operations,
    (select count(*)::int from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid) as reservations,
    (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger,
    (select count(*)::int from public.outreach_attempt where workspace = ${workspaceId}::uuid) as attempts,
    (select count(*)::int from public.campaign_queue where workspace = ${workspaceId}::uuid) as queue
    from public.workspace where id = ${workspaceId}::uuid`;
  return row;
}

export async function funded(conference = false) {
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

export async function claim(row: Connection) {
  const result = await journal.claimVoiceAudioSend(row);
  if (!result.ok) throw new Error(`Audio fixture claim refused: ${result.reason}`);
  return result.connection;
}

export function receipt(row: Connection, overrides: Partial<VoiceAudioProviderIdentity> = {}): VoiceAudioProviderIdentity {
  return { connectionId: row.id, event: "status", requestUrl: row.status_callback, accountSid,
    callSid: sid(), to: row.destination, from: row.caller_id, direction: "outbound-api", parentCallSid: null, ...overrides };
}

export async function issued(args = input()) {
  const row = await claim(await prepare(args)), accepted = await journal.recordVoiceAudioProvider(row, sid());
  const result = await issueVoiceAudioInstruction(accepted, "1");
  if (!result.ok) throw new Error(`Audio fixture instruction refused: ${result.reason}`);
  return result.connection;
}

export function joined(row: Connection, overrides: Partial<VoiceAudioConferenceEvent> = {}): VoiceAudioConferenceEvent {
  return { workspaceId, accountSid, requestUrl: row.conference_callback, conferenceId: row.conference_id,
    conferenceSid: row.conference_sid ?? `CF${randomUUID().replaceAll("-", "")}`, callSid: row.provider_sid ?? "",
    participantLabel: `audio:${row.id}:${row.generation}`, muted: row.target_kind === "idle" && !row.source_agent_sid ? "false" : "true",
    event: "participant-join", ...overrides };
}

export async function apiPost(body: unknown = { workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() }, expectedActor?: string) {
  const { action } = await import("../../app/routes/api+/connect-phone-device.action.server");
  return asRouteResponse(action(routeArgs(new Request(`${baseUrl}/api/connect-phone-device`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(expectedActor !== undefined ? { "X-Callcaster-Audio-Actor": expectedActor } : {}) }, body: JSON.stringify(body),
  }))));
}

export async function apiControl(row: Connection, method: "GET" | "DELETE" = "GET", targetWorkspace = workspaceId) {
  const request = new Request(`${baseUrl}/api/connect-phone-device?workspaceId=${targetWorkspace}&connection_id=${row.id}`, { method });
  if (method === "GET") { const { loader } = await import("../../app/routes/api+/connect-phone-device.loader.server"); return asRouteResponse(loader(routeArgs(request))); }
  const { action } = await import("../../app/routes/api+/connect-phone-device.action.server"); return asRouteResponse(action(routeArgs(request)));
}

export async function signedAudio(url: string, params: Record<string, string>, validSignature = true,
  options: { extraFields?: [string, string][]; signingToken?: string } = {}) {
  const { action } = await import("../../app/routes/api+/voice-audio.action.server");
  const body = new URLSearchParams([...Object.entries(params), ...(options.extraFields ?? [])]);
  return asRouteResponse(action(routeArgs(new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
    "X-Twilio-Signature": validSignature ? twilio.getExpectedTwilioSignature(options.signingToken ?? "owned-audio-token", url, params) : "invalid" }, body }))));
}

export async function signedPredictive(url: string, params: Record<string, string>) {
  const { action } = await import("../../app/routes/api+/auto-dial/status.action.server");
  return asRouteResponse(action(routeArgs(new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
    "X-Twilio-Signature": twilio.getExpectedTwilioSignature("owned-audio-token", url, params) }, body: new URLSearchParams(params) }))));
}

export async function parentContinuationFixture(rest = false) {
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

export async function signedParent(url: string, params: Record<string, string>, valid = true, extras: [string, string][] = [],
  options: { method?: string; signingToken?: string } = {}) {
  const { action } = await import("../../app/routes/api+/voice-continuation.action.server");
  return asRouteResponse(action(routeArgs(new Request(url, { method: options.method ?? "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
    "X-Twilio-Signature": valid ? twilio.getExpectedTwilioSignature(options.signingToken ?? "owned-audio-token", url, params) : "invalid" },
    body: new URLSearchParams([...Object.entries(params), ...extras]),
  }))));
}

export async function endedReplacementFixture(committed = false) {
  const f = await parentContinuationFixture();
  if (committed) await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${f.row.id}::uuid`;
  const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
  await observeVoiceAudioStatus(f.row, "completed", "10");
  const conferenceSid = f.row.conference_sid;
  if (!conferenceSid) throw new Error("Owned conference SID required");
  rooms.records.set(conferenceSid, { sid: conferenceSid, accountSid, friendlyName: f.row.conference_id, status: "in-progress" });
  return { ...f, conferenceSid };
}

export function bridgeParams(f: Awaited<ReturnType<typeof endedReplacementFixture>>, leg: "parent" | "customer", joined: boolean) {
  return { AccountSid: accountSid, CallSid: leg === "parent" ? f.target.parent : f.target.child,
    ConferenceSid: f.conferenceSid, FriendlyName: f.row.conference_id, Muted: "false",
    StatusCallbackEvent: joined ? "participant-join" : "participant-leave", ...(joined ? {} : { ReasonParticipantLeft: "participant_hung_up" }) };
}

export function voiceParams(row: Connection, providerSid = sid()) {
  return { AccountSid: accountSid, CallSid: providerSid, To: row.destination, From: row.caller_id, Direction: "outbound-api", CallStatus: "in-progress" };
}

export const refusals = [
  ["foreign workspace", "agent_not_found"], ["missing workspace", "workspace_not_found"],
  ["different user", "agent_not_found"], ["removed membership", "agent_not_found"],
  ["disabled user", "agent_not_found"], ["disabled workspace", "workspace_unavailable"],
  ["archived workspace", "workspace_not_found"], ["unverified phone", "device_not_verified"],
  ["suspended caller ID", "caller_id_unavailable"], ["missing caller ID", "caller_id_unavailable"],
  ["missing provider account", "caller_id_unavailable"], ["zero idle credits", "insufficient_credits"],
] as const;

export async function deny(kind: string, args: Input) {
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

export async function failRoomStop() {
  const f = await endedReplacementFixture(); await markPromotionReady(f.row);
  rooms.update.mockRejectedValueOnce(new Error("Owned room stop needs recovery"));
  expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false))).status).toBe(500);
  return f;
}

export async function ageRoomStop(row: Connection) {
  await sql`update public.workspace_voice_audio_connection set lease_expires_at = now() - interval '1 minute' where id = ${row.id}::uuid`;
}

export async function markPromotionReady(row: Connection) {
  await sql`update public.workspace_voice_audio_connection set promotion_result = 'ready',
    customer_joined_at = now(), parent_joined_at = now() where id = ${row.id}::uuid`;
}

export function useOwnedAudioFixture() {

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

  beforeEach(async () => {
    vi.clearAllMocks();
    web.userId = actor; web.accountSid = accountSid; web.authenticated = true; web.records.clear();
    rooms.records.clear();
    rooms.fetch.mockReset().mockImplementation(async (id: string) => { const room = rooms.records.get(id); if (!room) throw new Error("Owned audio conference required"); return room; });
    rooms.update.mockReset().mockImplementation(async (id: string, args: { status: string }) => { const room = rooms.records.get(id); if (!room) throw new Error("Owned audio conference required"); room.status = args.status; return room; });
    rooms.list.mockReset().mockImplementation(async () => [...rooms.records.values()].filter((r) => r.status === "in-progress"));
    rooms.participant.mockReset().mockRejectedValue(new Error("Owned audio participant required"));
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
    await sql`delete from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_audio_intent where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_audio_connection where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.handset_session where workspace_id = ${workspaceId}::uuid`;
    await sql`update public.workspace set credits = 100, disabled = false, archived_at = null,
      twilio_data = ${sql.json({ sid: accountSid, authToken: "owned-audio-token" })} where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
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
}

export { web, rooms };
