import { randomUUID } from "node:crypto";
import postgres from "postgres";
import twilio from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import TwilioResponse from "twilio/lib/http/response";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";

vi.hoisted(() => {
  process.env.TZ = "UTC"; process.env.BASE_URL = "https://parent-capture.example.test"; process.env.TWILIO_VALIDATE_WEBHOOKS = "true";
});
const io = vi.hoisted(() => ({ client: undefined as ReturnType<typeof twilio> | undefined,
  requests: [] as { method: string; uri: string; data: unknown }[], physical: {} as Record<string, unknown>,
  rootRequestSid: "", reply: {} as Record<string, unknown>, beforeGet: vi.fn(), beforePost: vi.fn(), beforeClient: vi.fn(),
  error: null as Error | null, status: 200,
}));
vi.mock("@/lib/database/workspace.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  createWorkspaceTwilioInstance: async () => {
    await io.beforeClient();
    if (!io.client) throw new Error("Owned Twilio transport required");
    return io.client;
  },
}));
vi.mock("@/lib/workspace-events.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(), emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID(), otherActor = randomUUID();
const accountSid = `AC${randomUUID().replaceAll("-", "")}`, token = "owned-parent-token";
const phone = "+16135551001", callerId = "+16135551000", customer = "+16135551099", baseUrl = "https://parent-capture.example.test";
const ca = () => `CA${randomUUID().replaceAll("-", "")}`, re = () => `RE${randomUUID().replaceAll("-", "")}`;
const fault = `parent_recording_${randomUUID().replaceAll("-", "")}`;
let sql: postgres.Sql, expectedCredits = 100, expectedLedger = 0;
let audio: typeof import("@/server/voice-audio-connection.server");
let journal: typeof import("@/server/voice-parent-recording.server");
let dispatch: typeof import("@/lib/voice-parent-recording.server");
let recordings: typeof import("@/server/voice-recording-operation.server");
type Connection = NonNullable<Awaited<ReturnType<typeof audio.findVoiceAudioConnection>>>;

describe("owned parent bridge capture (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned integration database required");
    sql = postgres(url, { max: 3, onnotice: () => {} });
    await sql`insert into public."user" (id, username) values (${actor}::uuid, ${`parent-${actor}@example.test`}),
      (${otherActor}::uuid, ${`parent-${otherActor}@example.test`})`;
    await sql`insert into public.workspace (id, name, credits, twilio_data) values
      (${workspaceId}::uuid, 'Owned parent recording fixture', 100, ${sql.json({ sid: accountSid, authToken: token })}),
      (${foreignId}::uuid, 'Foreign parent recording control', 100, '{}'::jsonb)`;
    audio = await import("@/server/voice-audio-connection.server");
    journal = await import("@/server/voice-parent-recording.server");
    dispatch = await import("@/lib/voice-parent-recording.server");
    recordings = await import("@/server/voice-recording-operation.server");
  });
  function client(selectedAccount = accountSid) {
    const http = new RequestClient({ autoRetry: false });
    vi.spyOn(http, "request").mockImplementation(async options => {
      const method = options.method.toUpperCase();
      io.requests.push({ method, uri: options.uri, data: options.data });
      if (method === "GET" && options.uri === `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${io.rootRequestSid}.json`) {
        await io.beforeGet();
        return new TwilioResponse(200, JSON.stringify(io.physical), {});
      }
      if (method !== "POST" || options.uri !== `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${io.rootRequestSid}/Recordings.json`)
        throw new Error("Owned recording request required");
      await io.beforePost();
      if (io.error) throw io.error;
      return new TwilioResponse(io.status, JSON.stringify(io.status === 200 ? io.reply : { code: 21220, message: "Owned provider rejection" }), {});
    });
    return twilio(selectedAccount, token, { accountSid: selectedAccount, httpClient: http });
  }
  async function clearFault() {
    await sql.unsafe(`drop trigger if exists ${fault} on public.workspace_voice_recording_operation`);
    await sql.unsafe(`drop function if exists public.${fault}()`);
  }
  async function rejectWriteWhen(condition: string) {
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$
      begin if ${condition} then raise exception 'Owned parent recording write fault'; end if; return new; end $$`);
    await sql.unsafe(`create trigger ${fault} before update on public.workspace_voice_recording_operation
      for each row execute function public.${fault}()`);
  }
  beforeEach(async () => {
    io.requests.length = 0; io.beforeGet.mockReset(); io.beforePost.mockReset(); io.beforeClient.mockReset(); io.error = null; io.status = 200;
    io.client = client(); expectedCredits = 100; expectedLedger = 0;
    await clearFault();
    await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
    await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_audio_intent where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_audio_connection where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await sql`update public.workspace set credits = 100, disabled = false, archived_at = null,
      twilio_data = ${sql.json({ sid: accountSid, authToken: token })} where id = ${workspaceId}::uuid`;
    await sql`update public."user" set access_level = 'standard' where id = ${actor}::uuid`;
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`parent:${workspaceId}:${actor}`}, ${workspaceId}, ${actor}, 'caller') on conflict (id) do update set role_id = 'caller'`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server"); invalidateWorkspaceTwilioData(workspaceId);
  });
  afterEach(async () => {
    await clearFault();
    const [owned] = await sql`select credits, (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger
      from public.workspace where id = ${workspaceId}::uuid`;
    const [foreign] = await sql`select credits, (select count(*)::int from public.workspace_voice_recording_operation where workspace = ${foreignId}::uuid) as recordings
      from public.workspace where id = ${foreignId}::uuid`;
    expect(owned).toEqual({ credits: expectedCredits, ledger: expectedLedger }); expect(foreign).toEqual({ credits: 100, recordings: 0 });
    expect(io.requests.filter(x => x.method === "POST").every(x => /\/Calls\/CA[0-9a-f]{32}\/Recordings\.json$/.test(x.uri))).toBe(true);
  });
  afterAll(async () => {
    try {
      if (sql) {
        await clearFault(); await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public."user" where id in (${actor}::uuid, ${otherActor}::uuid)`;
      }
    } finally {
      await sql?.end();
      if (audio) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  async function fixture(sdk = false, issued = true) {
    const reservationId = randomUUID(), root = ca(), child = ca(), id = randomUUID(), replacement = ca(), cf = `CF${randomUUID().replaceAll("-", "")}`;
    const rootTo = sdk ? "" : phone, rootFrom = sdk ? `client:${actor}` : callerId, direction = sdk ? "inbound" : "outbound-api";
    await sql`insert into public.workspace_voice_reservation
      (id, workspace, kind, credits, account_sid, recipient, caller_id, user_id, setup_to, setup_client_identity,
       setup_sid, provider_sid, state, lease_token, lease_expires_at, send_started_at, recipient_instruction_issued_at, setup_continuation_url)
      values (${reservationId}::uuid, ${workspaceId}::uuid, 'staffed', 4, ${accountSid}, ${customer}, ${callerId}, ${actor},
       ${rootTo}, ${sdk ? actor : null}, ${root}, ${child}, 'active', ${randomUUID()}::uuid, now() + interval '5 minutes', now(), ${issued ? new Date() : null},
       ${`${baseUrl}/api/voice-continuation?credit_reservation=${reservationId}`})`;
    await sql`insert into public.call (sid, workspace, user_id, account_sid, "to", "from", direction, status, parent_call_sid)
      values (${root}, ${workspaceId}::uuid, ${actor}, ${accountSid}, ${rootTo}, ${rootFrom}, ${direction}, 'in-progress', null),
       (${child}, ${workspaceId}::uuid, ${actor}, ${accountSid}, ${customer}, ${callerId}, 'outbound-dial', 'in-progress', ${root})`;
    await sql`insert into public.workspace_voice_audio_connection
      (id, workspace, user_id, intent_id, target_kind, target_key, requested_call_sid, reservation_id, customer_sid, original_agent_sid,
       source_agent_sid, generation, transport, destination, account_sid, caller_id, conference_id, conference_sid, voice_url,
       status_callback, conference_callback, state, provider_sid, send_started_at, voice_issued_at, joined_at, lease_token, lease_expires_at)
      values (${id}::uuid, ${workspaceId}::uuid, ${actor}, ${randomUUID()}::uuid, 'direct', ${`direct:${reservationId}`}, ${child},
       ${reservationId}::uuid, ${child}, ${root}, ${root}, 1, 'phone', ${phone}, ${accountSid}, ${callerId}, ${`parent-${id}`}, ${cf},
       ${`${baseUrl}/api/voice-audio?connection=${id}&event=voice`}, ${`${baseUrl}/api/voice-audio?connection=${id}&event=status`},
       ${`${baseUrl}/api/voice-audio?connection=${id}&event=conference`}, 'ready', ${replacement}, now(), now(), now(), ${randomUUID()}::uuid, now() + interval '5 minutes')`;
    const connection = await audio.findVoiceAudioConnection(id); if (!connection) throw new Error("Owned joined replacement required");
    io.rootRequestSid = root;
    io.physical = { sid: root, account_sid: accountSid, to: rootTo, from: rootFrom, direction, parent_call_sid: null, status: "in-progress" };
    io.reply = { sid: re(), account_sid: accountSid, call_sid: root, source: "StartCallRecordingAPI", status: "in-progress", channels: 2,
      start_time: new Date().toUTCString(), duration: null };
    return { connection, reservationId, root, child };
  }
  async function nextPhoneAttempt(previous: Connection) {
    const id = randomUUID();
    await sql`update public.workspace_voice_audio_connection set state = 'failed', terminal_at = now() where id = ${previous.id}::uuid`;
    await sql`insert into public.workspace_voice_audio_connection
      select (jsonb_populate_record(null::public.workspace_voice_audio_connection, to_jsonb(c) ||
        ${sql.json({ id, intent_id: randomUUID(), generation: previous.generation + 1, provider_sid: ca(), state: "ready", terminal_at: null })})).*
      from public.workspace_voice_audio_connection c where id = ${previous.id}::uuid`;
    const next = await audio.findVoiceAudioConnection(id); if (!next) throw new Error("Next owned phone attempt required");
    return next;
  }
  const posts = () => io.requests.filter(x => x.method === "POST");
  const stored = () => sql`select * from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
  async function callback(connection: Connection, status = "in-progress") {
    const owner = await journal.findVoiceParentRecording(connection); if (!owner) throw new Error("Owned recording nonce required");
    const params = { AccountSid: accountSid, CallSid: owner.source_call_sid, RecordingSid: String(io.reply.sid), RecordingSource: "StartCallRecordingAPI",
      RecordingStatus: status, RecordingChannels: "2", RecordingStartTime: String(io.reply.start_time), ...(status === "completed" ? { RecordingDuration: "71" } : {}) };
    const { action } = await import("../../app/routes/api+/voice-recording.action.server");
    return asRouteResponse(action(routeArgs(new Request(owner.callback_url, { method: "POST", headers: {
      "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": twilio.getExpectedTwilioSignature(token, owner.callback_url, params),
    }, body: new URLSearchParams(params) }))));
  }

  test.each([false, true])("records the real original root with one saved nonce (SDK=%s)", async sdk => {
    const f = await fixture(sdk), result = await dispatch.ensureVoiceParentRecording(f.connection), row = result.operation;
    expect(row).toMatchObject({ workspace: workspaceId, user_id: actor, reservation_id: f.reservationId, kind: "parent", intent_id: f.connection.id,
      logical_call_sid: f.root, source_call_sid: f.root, source_parent_sid: null, source_to: sdk ? "" : phone,
      source_from: sdk ? `client:${actor}` : callerId, source_direction: sdk ? "inbound" : "outbound-api", state: "accepted", provider_sid: io.reply.sid });
    expect(row.send_started_at).not.toBeNull(); expect(row.callback_url).toBe(`${baseUrl}/api/voice-recording?recording=${row.id}`);
    expect(posts()).toEqual([{ method: "POST", uri: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${f.root}/Recordings.json`,
      data: { RecordingChannels: "dual", RecordingTrack: "both", Trim: "do-not-trim", RecordingStatusCallbackMethod: "POST",
        RecordingStatusCallbackEvent: ["in-progress", "completed", "absent"],
        RecordingStatusCallback: `${row.callback_url}#ct=1000&rt=3000&tt=15000&rc=2&rp=ct,rt,5xx` } }]);
    expect(await stored()).toHaveLength(1);
    expect((await audio.findVoiceAudioConnection(f.connection.id))?.state).toBe("ready");
  });
  test("concurrent callers commit one checkpoint and one provider POST", async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 20 }, () => dispatch.ensureVoiceParentRecording(f.connection)));
    expect(new Set(results.map(x => x.operation.id)).size).toBe(1); expect(posts()).toHaveLength(1); expect(await stored()).toHaveLength(1);
    expect((await journal.findVoiceParentRecording(f.connection))?.provider_sid).toBe(io.reply.sid);
  });
  test("zero available balance takes no new hold and no debit", async () => {
    const f = await fixture(); expectedCredits = 0;
    await sql`update public.workspace set credits = 0 where id = ${workspaceId}::uuid`;
    await dispatch.ensureVoiceParentRecording(f.connection);
    const [row] = await sql`select count(*)::int as reservations, sum(credits)::int as held from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(row).toEqual({ reservations: 1, held: 4 }); expect(posts()).toHaveLength(1);
  });
  test("accepted replay survives removed membership and a terminal customer without provider I/O", async () => {
    const f = await fixture(), first = await dispatch.ensureVoiceParentRecording(f.connection);
    await sql`delete from public.workspace_member where workspace_id = ${workspaceId} and user_id = ${actor}`;
    await sql`update public.workspace_voice_reservation set state = 'settled', terminal_status = 'completed', terminal_duration = '42' where id = ${f.reservationId}::uuid`;
    io.requests.length = 0;
    const replay = await dispatch.ensureVoiceParentRecording(f.connection);
    expect(replay.operation.id).toBe(first.operation.id); expect(replay.operation.provider_sid).toBe(io.reply.sid); expect(replay.replayed).toBe(true);
    expect(io.requests).toHaveLength(0);
  });
  test("early signed acceptance wins over a lost provider response", async () => {
    const f = await fixture(); io.error = new Error("Owned lost response");
    io.beforePost.mockImplementationOnce(async () => { expect((await callback(f.connection)).status).toBe(204); });
    const result = await dispatch.ensureVoiceParentRecording(f.connection);
    expect(result.operation.provider_sid).toBe(io.reply.sid); expect(result.operation.state).toBe("accepted"); expect(posts()).toHaveLength(1);
  });
  test.each([400, 429])("a definite %s rejection is retained and cannot repeat the same intent", async status => {
    const f = await fixture(); io.status = status;
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toMatchObject({ status });
    expect((await journal.findVoiceParentRecording(f.connection))?.state).toBe("failed");
    await dispatch.ensureVoiceParentRecording(f.connection); expect(posts()).toHaveLength(1);
  });
  test.each([408, 500])("an uncertain %s response keeps the send checkpoint", async status => {
    const f = await fixture(); io.status = status;
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("needs provider verification");
    const row = await journal.findVoiceParentRecording(f.connection); expect(row).toMatchObject({ state: "creating", provider_sid: null });
    await sql`update public.workspace_voice_recording_operation set lease_expires_at = now() - interval '1 minute' where id = ${row?.id}::uuid`;
    await dispatch.ensureVoiceParentRecording(f.connection); expect(posts()).toHaveLength(1);
  });

  test.each(["root", "customer"] as const)("local %s must still have its funded bridge identity", async leg => {
    const f = await fixture();
    await sql`update public.call set parent_call_sid = ${leg === "root" ? f.child : null} where sid = ${leg === "root" ? f.root : f.child}`;
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("live customer bridge");
    expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(0);
  });

  test.each(["membership", "user disabled", "workspace disabled", "workspace archived", "account changed"])(
    "%s blocks capture before provider I/O", async change => {
      const f = await fixture();
      if (change === "membership") await sql`delete from public.workspace_member where workspace_id = ${workspaceId} and user_id = ${actor}`;
      if (change === "user disabled") await sql`update public."user" set access_level = 'disabled' where id = ${actor}::uuid`;
      if (change === "workspace disabled") await sql`update public.workspace set disabled = true where id = ${workspaceId}::uuid`;
      if (change === "workspace archived") await sql`update public.workspace set archived_at = now() where id = ${workspaceId}::uuid`;
      if (change === "account changed") await sql`update public.workspace set twilio_data = ${sql.json({ sid: `AC${"f".repeat(32)}`, authToken: token })} where id = ${workspaceId}::uuid`;
      await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("actor is unavailable");
      expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(0);
    });

  test.each<{ name: string; patch: Record<string, string | Date | null> }>([
    { name: "joining", patch: { state: "joining" } },
    { name: "cancellation", patch: { cancel_requested_at: new Date() } },
    { name: "terminal", patch: { terminal_at: new Date() } },
    { name: "unissued voice", patch: { voice_issued_at: null } },
    { name: "unconfirmed join", patch: { joined_at: null } },
    { name: "another source", patch: { source_agent_sid: ca() } },
    { name: "replacement source", patch: { source_connection_id: randomUUID() } },
    { name: "committed source", patch: { committed_at: new Date() } },
    { name: "rejected promotion", patch: { promotion_result: "rejected", promotion_requested_at: new Date() } },
    { name: "conference target", patch: { target_kind: "conference" } },
    { name: "wrong target key", patch: { target_key: `direct:${randomUUID()}` } },
    { name: "changed caller", patch: { caller_id: customer } },
    { name: "another request", patch: { requested_call_sid: ca() } },
  ])("$name cannot start a new capture", async ({ patch }) => {
    const f = await fixture();
    await sql`update public.workspace_voice_audio_connection set ${sql(patch)} where id = ${f.connection.id}::uuid`;
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow();
    expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(0);
  });

  test.each<{ name: string; patch: Record<string, string | Date | null> }>([
    { name: "another agent", patch: { user_id: otherActor } },
    { name: "another account", patch: { account_sid: `AC${"f".repeat(32)}` } },
    { name: "IVR", patch: { kind: "ivr" } },
    { name: "room call", patch: { conference_id: "another-room" } },
    { name: "settled", patch: { state: "settled" } },
    { name: "changed parent", patch: { setup_sid: ca() } },
    { name: "changed customer", patch: { provider_sid: ca() } },
    { name: "changed caller", patch: { caller_id: customer } },
    { name: "missing continuation", patch: { setup_continuation_url: null } },
    { name: "ended parent", patch: { setup_terminal_at: new Date() } },
    { name: "ended customer", patch: { terminal_status: "completed" } },
  ])("funded $name is not the current bridge", async ({ patch }) => {
    const f = await fixture();
    await sql`update public.workspace_voice_reservation set ${sql(patch)} where id = ${f.reservationId}::uuid`;
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("funded call is no longer current");
    expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(0);
  });

  test("an unissued customer is not the current bridge", async () => {
    const f = await fixture(false, false);
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("funded call is no longer current");
    expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(0);
  });

  test.each(["root", "customer"] as const)("local %s requires all funded leg fields", async leg => {
    const f = await fixture(), sid = leg === "root" ? f.root : f.child;
    for (const patch of [{ account_sid: `AC${"f".repeat(32)}` }, { user_id: otherActor }, { to: "+16135559999" },
      { from: "+16135559999" }, { direction: "inbound" }, { status: "queued" }, { workspace: foreignId }]) {
      const [original] = await sql`select * from public.call where sid = ${sid}`;
      await sql`update public.call set ${sql(patch)} where sid = ${sid}`;
      await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("live customer bridge");
      await sql`update public.call set ${sql(Object.fromEntries(Object.keys(patch).map(key => [key, original[key]])))} where sid = ${sid}`;
      expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(0);
    }
  });

  test.each(["root", "customer"] as const)("missing %s blocks capture", async leg => {
    const f = await fixture(); await sql`delete from public.call where sid = ${leg === "root" ? f.root : f.child}`;
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("live customer bridge");
    expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(0);
  });

  test("a successor commit on another row retires the original source", async () => {
    const f = await fixture(), id = randomUUID();
    await sql`insert into public.workspace_voice_audio_connection
      (id, workspace, user_id, intent_id, target_kind, target_key, generation, transport, destination, account_sid,
       caller_id, conference_id, voice_url, status_callback, conference_callback, state, source_agent_sid, committed_at, lease_token, lease_expires_at)
      select ${id}::uuid, workspace, user_id, ${randomUUID()}::uuid, 'idle', 'idle', 2, transport, destination, account_sid,
       caller_id, conference_id, voice_url, status_callback, conference_callback, 'retired', source_agent_sid, now(), lease_token, lease_expires_at
      from public.workspace_voice_audio_connection where id = ${f.connection.id}::uuid`;
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("funded call is no longer current");
    expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(0);
  });

  test("a pending room stop blocks a new capture", async () => {
    const f = await fixture();
    await sql`update public.workspace_voice_audio_connection set conference_stop_requested_at = now(), conference_stop_call_sid = ${f.child} where id = ${f.connection.id}::uuid`;
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("current joined replacement");
    expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(0);
  });

  test.each([false, true])("provider root fields must match the original source (SDK=%s)", async sdk => {
    const f = await fixture(sdk), original = { ...io.physical };
    for (const patch of [{ sid: ca() }, { account_sid: `AC${"f".repeat(32)}` }, { to: customer }, { from: customer },
      { direction: sdk ? "outbound-api" : "inbound" }, { parent_call_sid: ca() }, { status: "completed" }]) {
      io.physical = { ...original, ...patch };
      await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow();
      expect(posts()).toHaveLength(0); expect(await stored()).toHaveLength(0);
    }
  });

  test("a mismatched SDK account cannot make a provider request", async () => {
    const f = await fixture(); io.client = client(`AC${"f".repeat(32)}`);
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("original provider account");
    expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(0);
  });

  test.each(["membership", "source", "customer"])("rechecks %s after the provider GET", async change => {
    const f = await fixture();
    io.beforeGet.mockImplementationOnce(async () => {
      if (change === "membership") await sql`delete from public.workspace_member where workspace_id = ${workspaceId} and user_id = ${actor}`;
      if (change === "source") await sql`update public.workspace_voice_audio_connection set source_agent_sid = ${ca()} where id = ${f.connection.id}::uuid`;
      if (change === "customer") await sql`update public.call set status = 'completed' where sid = ${f.child}`;
    });
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow();
    expect(io.requests.map(x => x.method)).toEqual(["GET"]); expect(await stored()).toHaveLength(0);
  });

  test.each<{ name: string; patch: Record<string, unknown> }>([
    { name: "missing RE", patch: { sid: null } }, { name: "invalid RE", patch: { sid: ca() } },
    { name: "another account", patch: { account_sid: `AC${"f".repeat(32)}` } },
    { name: "another root", patch: { call_sid: ca() } }, { name: "Dial source", patch: { source: "DialVerb" } },
    { name: "unknown source", patch: { source: "UnknownSource" } }, { name: "paused", patch: { status: "paused" } },
    { name: "stopped", patch: { status: "stopped" } }, { name: "unknown status", patch: { status: "new-status" } },
    { name: "invalid channels", patch: { channels: 3 } }, { name: "invalid duration", patch: { duration: "NaN" } },
    { name: "negative duration", patch: { duration: "-1" } }, { name: "padded duration", patch: { duration: "01" } },
    { name: "oversize duration", patch: { duration: "2147483648" } }, { name: "invalid start", patch: { start_time: "invalid" } },
  ])("an accepted ACK with $name stays pending without another POST", async ({ patch }) => {
    const f = await fixture(); io.reply = { ...io.reply, ...patch };
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("needs provider verification");
    expect((await stored())[0]).toMatchObject({ state: "creating", provider_sid: null });
    await dispatch.ensureVoiceParentRecording(f.connection); expect(posts()).toHaveLength(1);
  });

  test("processing ACK binds identity without inventing an active recording receipt", async () => {
    const f = await fixture(); io.reply.status = "processing";
    const result = await dispatch.ensureVoiceParentRecording(f.connection);
    expect(result.operation).toMatchObject({ state: "accepted", provider_sid: io.reply.sid, provider_status: null, terminal_at: null });
    expect((await audio.findVoiceAudioConnection(f.connection.id))?.state).toBe("ready"); expect(posts()).toHaveLength(1);
  });

  test("terminal signed receipt wins over a late progress ACK and callback", async () => {
    const f = await fixture();
    io.beforePost.mockImplementationOnce(async () => { expect((await callback(f.connection, "completed")).status).toBe(204); });
    const result = await dispatch.ensureVoiceParentRecording(f.connection);
    expect(result.operation).toMatchObject({ state: "accepted", provider_status: "completed", recording_duration_seconds: 71 });
    expect((await callback(f.connection)).status).toBe(204);
    expect((await stored())[0]).toMatchObject({ provider_status: "completed", recording_duration_seconds: 71 });
  });

  test("an accepted ACK keeps identity after recovery rotates the lease", async () => {
    const f = await fixture(), nextLease = randomUUID();
    let previous: Awaited<ReturnType<typeof journal.findVoiceParentRecording>> = null;
    io.beforePost.mockImplementationOnce(async () => {
      previous = await journal.findVoiceParentRecording(f.connection);
      await sql`update public.workspace_voice_recording_operation set lease_token = ${nextLease}::uuid where workspace = ${workspaceId}::uuid`;
    });
    const result = await dispatch.ensureVoiceParentRecording(f.connection);
    expect(result.operation).toMatchObject({ lease_token: nextLease, provider_sid: io.reply.sid, state: "accepted" });
    if (!previous) throw new Error("Previous recovery lease required");
    const { recordRecoveredVoiceRecording } = await import("@/server/voice-recording-receipt.server");
    expect(await recordRecoveredVoiceRecording(previous, { requestUrl: result.operation.callback_url, accountSid, callSid: f.root,
      recordingSid: String(io.reply.sid), source: "StartCallRecordingAPI", status: "completed", durationSeconds: 99 })).toBeNull();
    expect((await stored())[0].provider_status).toBe("in-progress"); expect(posts()).toHaveLength(1);
  });

  test("a failed send checkpoint commits no POST and a safe prepared retry can send once", async () => {
    const f = await fixture(); await rejectWriteWhen("new.state = 'creating'");
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toMatchObject({ cause: { message: "Owned parent recording write fault" } });
    expect(posts()).toHaveLength(0); expect((await stored())[0]).toMatchObject({ state: "prepared", send_started_at: null });
    await clearFault();
    await dispatch.ensureVoiceParentRecording(f.connection); await dispatch.ensureVoiceParentRecording(f.connection);
    expect(posts()).toHaveLength(1); expect(await stored()).toHaveLength(1);
  });

  test("a failed ACK write remains uncertain and a signed callback repairs it", async () => {
    const f = await fixture(); await rejectWriteWhen("new.provider_sid is not null");
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("needs provider verification");
    expect((await stored())[0]).toMatchObject({ state: "creating", provider_sid: null });
    await clearFault(); await dispatch.ensureVoiceParentRecording(f.connection);
    expect(posts()).toHaveLength(1); expect((await callback(f.connection)).status).toBe(204);
    expect((await stored())[0]).toMatchObject({ state: "accepted", provider_sid: io.reply.sid });
  });

  test("rechecks the live bridge at the committed send boundary", async () => {
    const f = await fixture();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$
      begin update public.call set status = 'completed' where sid = '${f.child}'; return new; end $$`);
    await sql.unsafe(`create trigger ${fault} after insert on public.workspace_voice_recording_operation
      for each row execute function public.${fault}()`);
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("live customer bridge");
    expect(posts()).toHaveLength(0); expect((await stored())[0]).toMatchObject({ state: "prepared", send_started_at: null });
    await clearFault(); await sql`update public.call set status = 'in-progress' where sid = ${f.child}`;
    await dispatch.ensureVoiceParentRecording(f.connection); expect(posts()).toHaveLength(1);
  });

  test.each(["client", "GET"])("a late %s completion cannot start capture after the read budget", async boundary => {
    const f = await fixture(); let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    (boundary === "client" ? io.beforeClient : io.beforeGet).mockImplementationOnce(async () => { enter(); await held; });
    const rejected = expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toThrow("source verification timed out");
    await entered; await rejected; release();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(io.requests.map(x => x.method)).toEqual(boundary === "client" ? [] : ["GET"]);
    expect(await stored()).toHaveLength(0);
  });

  test("recording a bridge keeps one funded customer settlement", async () => {
    const f = await fixture(); await dispatch.ensureVoiceParentRecording(f.connection);
    await sql`update public.call set status = 'completed', duration = '42' where sid = ${f.child}`;
    const { findCallBySid } = await import("@/lib/telephony-db.server"), { billTerminalCallStatus } = await import("@/lib/twilio-call-status.server");
    const customerCall = await findCallBySid(f.child); if (!customerCall) throw new Error("Owned customer required");
    expectedCredits = 96; expectedLedger = 1;
    await billTerminalCallStatus(customerCall); await billTerminalCallStatus(customerCall);
    const [entry] = await sql`select call_sid, amount from public.transaction_history where workspace = ${workspaceId}::uuid`;
    expect(entry.call_sid).toBe(f.child); expect(Number(entry.amount)).toBe(-4);
    expect(await stored()).toHaveLength(1); expect(posts()).toHaveLength(1);
  });

  test("an expired unsent preparation renews its lease and sends only its saved nonce", async () => {
    const f = await fixture(), prepared = await journal.prepareVoiceParentRecording(f.connection, {
      sid: f.root, accountSid, to: phone, from: callerId, direction: "outbound-api", parentCallSid: null,
    });
    await sql`update public.workspace_voice_recording_operation set lease_expires_at = now() - interval '1 minute' where id = ${prepared.id}::uuid`;
    expect(await journal.claimVoiceParentRecordingSend(f.connection, prepared)).toBeNull(); expect(posts()).toHaveLength(0);
    const result = await dispatch.ensureVoiceParentRecording(f.connection);
    expect(result.operation.id).toBe(prepared.id); expect(result.operation.callback_url).toBe(prepared.callback_url);
    expect(result.operation.lease_token).not.toBe(prepared.lease_token); expect(posts()).toHaveLength(1);
  });

  test("a definite rejection permits a fresh phone attempt with its own recording intent", async () => {
    const f = await fixture(); io.status = 400;
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toMatchObject({ status: 400 });
    const next = await nextPhoneAttempt(f.connection); io.status = 200;
    const result = await dispatch.ensureVoiceParentRecording(next);
    expect(result.operation).toMatchObject({ intent_id: next.id, state: "accepted" }); expect(posts()).toHaveLength(2);
    expect((await stored()).map(x => x.state).sort()).toEqual(["accepted", "failed"]);
  });

  test("a new phone attempt reuses the accepted bridge recording without provider I/O", async () => {
    const f = await fixture(), first = await dispatch.ensureVoiceParentRecording(f.connection), next = await nextPhoneAttempt(f.connection);
    io.requests.length = 0;
    const result = await dispatch.ensureVoiceParentRecording(next);
    expect(result.operation.id).toBe(first.operation.id); expect(result.operation.intent_id).toBe(f.connection.id);
    expect(io.requests).toHaveLength(0); expect(await stored()).toHaveLength(1);
  });

  test.each(["completed", "absent"])("a fresh phone attempt can replace a confirmed %s capture and retain its old part", async status => {
    const f = await fixture(), first = await dispatch.ensureVoiceParentRecording(f.connection);
    expect((await callback(f.connection, status)).status).toBe(204);
    const next = await nextPhoneAttempt(f.connection); io.reply.sid = re();
    const results = await Promise.all(Array.from({ length: 20 }, () => dispatch.ensureVoiceParentRecording(next)));
    expect(new Set(results.map(x => x.operation.id)).size).toBe(1); expect(results[0].operation.id).not.toBe(first.operation.id);
    expect(await journal.findVoiceParentRecording(next)).toMatchObject({ intent_id: next.id, state: "accepted", provider_status: "in-progress", provider_sid: io.reply.sid });
    expect(posts()).toHaveLength(2);
    const previous = await recordings.findVoiceRecordingOperation(first.operation.id);
    expect(previous).toMatchObject({ state: "accepted", provider_status: status, provider_sid: first.operation.provider_sid });
    expect(previous?.terminal_at).not.toBeNull(); expect(await stored()).toHaveLength(2);
    if (status === "completed") {
      if (!previous?.provider_sid) throw new Error("Completed owned recording required");
      const { startVoiceRecordingCopy, finishVoiceRecordingCopy } = await import("@/server/voice-recording-copy.server");
      const { callRecordingPartStoragePath } = await import("@/lib/call-recording-storage.server");
      const claimed = await startVoiceRecordingCopy(workspaceId, previous.id, previous.lease_token);
      if (!claimed) throw new Error("Old completed part delivery lease required");
      const path = callRecordingPartStoragePath({ workspaceId, callSid: f.root, accountSid, recordingSid: previous.provider_sid });
      expect(await finishVoiceRecordingCopy(claimed, path)).toBe(true);
      expect(await recordings.findVoiceRecordingOperation(first.operation.id)).toMatchObject({ state: "accepted", audio_url: path });
      expect((await journal.findVoiceParentRecording(next))?.audio_url).toBeNull();
    }
    io.requests.length = 0;
    const replay = await dispatch.ensureVoiceParentRecording(f.connection);
    expect(replay.operation.id).toBe(first.operation.id); expect(replay.operation.provider_status).toBe(status);
    expect(io.requests).toHaveLength(0);
  });

  test("an old rejected recording intent cannot adopt a later attempt's accepted identity", async () => {
    const f = await fixture(); io.status = 400;
    await expect(dispatch.ensureVoiceParentRecording(f.connection)).rejects.toMatchObject({ status: 400 });
    const rejected = await journal.findVoiceParentRecording(f.connection), next = await nextPhoneAttempt(f.connection); io.status = 200;
    const accepted = await dispatch.ensureVoiceParentRecording(next); io.requests.length = 0;
    const replay = await dispatch.ensureVoiceParentRecording(f.connection);
    expect(replay.operation.id).toBe(rejected?.id); expect(replay.operation.state).toBe("failed");
    expect(replay.operation.id).not.toBe(accepted.operation.id); expect(io.requests).toHaveLength(0);
  });

  test.each(["active phase", "same terminal intent"])("the database still rejects a second parent owner for %s", async conflict => {
    const f = await fixture(), first = await dispatch.ensureVoiceParentRecording(f.connection);
    if (conflict === "same terminal intent") expect((await callback(f.connection, "completed")).status).toBe(204);
    const patch = { id: randomUUID(), intent_id: conflict === "same terminal intent" ? first.operation.intent_id : randomUUID(),
      state: "prepared", send_started_at: null, provider_sid: null, provider_status: null, terminal_at: null,
      recording_started_at: null, recording_duration_seconds: null, channels: null, audio_url: null };
    await expect(sql`insert into public.workspace_voice_recording_operation
      select (jsonb_populate_record(null::public.workspace_voice_recording_operation, to_jsonb(r) || ${sql.json(patch)})).*
      from public.workspace_voice_recording_operation r where id = ${first.operation.id}::uuid`).rejects.toMatchObject({ code: "23505" });
    expect(await stored()).toHaveLength(1); expect(posts()).toHaveLength(1);
  });

  test.each(["dial", "customer"])("a terminal %s phase still has one permanent owner", async kind => {
    const f = await fixture(), first = await dispatch.ensureVoiceParentRecording(f.connection);
    expect((await callback(f.connection, "completed")).status).toBe(204);
    await sql`update public.workspace_voice_recording_operation set kind = ${kind} where id = ${first.operation.id}::uuid`;
    const patch = { id: randomUUID(), intent_id: randomUUID(), provider_sid: re() };
    await expect(sql`insert into public.workspace_voice_recording_operation
      select (jsonb_populate_record(null::public.workspace_voice_recording_operation, to_jsonb(r) || ${sql.json(patch)})).*
      from public.workspace_voice_recording_operation r where id = ${first.operation.id}::uuid`).rejects.toMatchObject({ code: "23505" });
    expect(await stored()).toHaveLength(1); expect(posts()).toHaveLength(1);
  });
});
