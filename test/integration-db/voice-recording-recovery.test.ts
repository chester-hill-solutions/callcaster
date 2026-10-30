import { randomUUID } from "node:crypto";
import postgres from "postgres";
import twilio from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import TwilioResponse from "twilio/lib/http/response";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => { process.env.TZ = "UTC"; });
const provider = vi.hoisted(() => ({ accountSid: "", client: undefined as ReturnType<typeof twilio> | undefined,
  requests: [] as { method: string; uri: string }[], responses: new Map<string, unknown>(), beforeRecording: vi.fn(), beforeClient: vi.fn(),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  createWorkspaceTwilioInstance: async () => {
    await provider.beforeClient();
    if (!provider.client) throw new Error("Owned SDK fixture required");
    return provider.client;
  },
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), accountSid = `AC${randomUUID().replaceAll("-", "")}`;
const ca = () => `CA${randomUUID().replaceAll("-", "")}`;
const re = () => `RE${randomUUID().replaceAll("-", "")}`;
const phone = "+16135550901", callerId = "+16135550900", recipient = "+16135550999";
let sql: postgres.Sql;
let journal: typeof import("@/server/voice-recording-operation.server");
let recovery: typeof import("@/lib/voice-recording-recovery.server");
let leases: typeof import("@/server/voice-recording-recovery.server");
let receipts: typeof import("@/server/voice-recording-receipt.server");
type Operation = NonNullable<Awaited<ReturnType<typeof journal.findVoiceRecordingOperation>>>;

describe("original-account recording observation recovery (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned database URL required");
    sql = postgres(url, { max: 3, onnotice: () => {} });
    await sql`insert into public.workspace (id, name, credits, twilio_data) values
      (${workspaceId}::uuid, 'Owned recording recovery fixture', 100, ${sql.json({ sid: accountSid, authToken: "owned-recovery-token" })}),
      (${foreignId}::uuid, 'Foreign recording recovery control', 100, '{}'::jsonb)`;
    journal = await import("@/server/voice-recording-operation.server");
    recovery = await import("@/lib/voice-recording-recovery.server");
    leases = await import("@/server/voice-recording-recovery.server");
    receipts = await import("@/server/voice-recording-receipt.server");
  });
  function sdkClient(selectedAccount = accountSid) {
    const http = new RequestClient({ autoRetry: false });
    vi.spyOn(http, "request").mockImplementation(async (options) => {
      const method = options.method.toUpperCase();
      provider.requests.push({ method, uri: options.uri });
      if (method !== "GET") throw new Error("Recording recovery must never write to the provider");
      if (/\/Recordings\//.test(options.uri)) await provider.beforeRecording();
      if (!provider.responses.has(options.uri)) throw new Error("Owned provider response required");
      return new TwilioResponse(200, JSON.stringify(provider.responses.get(options.uri)), {});
    });
    return twilio(selectedAccount, "owned-sdk-token", { accountSid: selectedAccount, httpClient: http });
  }
  beforeEach(async () => {
    provider.requests.length = 0; provider.responses.clear(); provider.beforeRecording.mockReset(); provider.beforeClient.mockReset();
    provider.client = sdkClient();
    await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
  });
  afterEach(async () => {
    expect(provider.requests.every((row) => row.method === "GET")).toBe(true);
    const [own] = await sql`select credits, (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger
      from public.workspace where id = ${workspaceId}::uuid`;
    const [foreign] = await sql`select credits, (select count(*)::int from public.workspace_voice_recording_operation where workspace = ${foreignId}::uuid) as operations
      from public.workspace where id = ${foreignId}::uuid`;
    expect(own).toEqual({ credits: 100, ledger: 0 }); expect(foreign).toEqual({ credits: 100, operations: 0 });
  });
  afterAll(async () => {
    try {
      if (sql) {
        await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
      }
    } finally {
      await sql?.end();
      if (journal) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  async function fixture(kind: "dial" | "parent" | "customer" = "dial", known = false, child = false) {
    const id = randomUUID(), sourceSid = ca(), parentSid = child ? ca() : null, recordingSid = re();
    const callbackUrl = `https://recording-recovery.example.test/api/voice-recording?recording=${id}`;
    await sql`insert into public.workspace_voice_recording_operation
      (id, workspace, reservation_id, user_id, kind, intent_id, logical_call_sid, source_call_sid,
       source_to, source_from, source_direction, source_parent_sid, account_sid, callback_url, state,
       provider_sid, provider_status, send_started_at, lease_token, lease_expires_at)
      values (${id}::uuid, ${workspaceId}::uuid, ${randomUUID()}::uuid, ${randomUUID()}, ${kind}, ${randomUUID()}::uuid,
       ${parentSid ?? sourceSid}, ${sourceSid}, ${kind === "customer" ? recipient : phone}, ${callerId},
       ${child ? "outbound-dial" : "outbound-api"}, ${parentSid}, ${accountSid}, ${callbackUrl},
       ${known ? "accepted" : "creating"}, ${known ? recordingSid : null}, ${known ? "in-progress" : null},
       now() - interval '30 minutes', ${randomUUID()}::uuid, now() - interval '1 minute')`;
    const row = await journal.findVoiceRecordingOperation(id); if (!row) throw new Error("Owned recovery row required");
    const callUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${sourceSid}.json`;
    const eventsUrl = callUrl.replace(/\.json$/, "/Events.json");
    const recordingUrl = callUrl.replace(/\.json$/, `/Recordings/${recordingSid}.json`);
    const started = new Date(Date.now() - 25 * 60_000).toUTCString().replace("GMT", "+0000");
    const ended = new Date(Date.now() - 20 * 60_000).toUTCString().replace("GMT", "+0000");
    const physical = { sid: sourceSid, account_sid: accountSid, to: row.source_to, from: callerId, direction: row.source_direction,
      parent_call_sid: parentSid, status: "completed", date_created: started, date_updated: ended, end_time: ended };
    const recording = { sid: recordingSid, account_sid: accountSid, call_sid: sourceSid,
      source: kind === "dial" ? "DialVerb" : kind === "customer" && !child ? "OutboundAPI" : "StartCallRecordingAPI",
      status: "completed", duration: "71", start_time: started, channels: 1 };
    const event = { request: { method: "POST", url: callbackUrl, parameters: { account_sid: accountSid, call_sid: sourceSid,
      recording_sid: recordingSid, recording_source: recording.source, recording_status: "completed", recording_duration: "71",
      recording_start_time: started, recording_channels: "1" } }, response: { response_code: 500 } };
    provider.responses.set(callUrl, physical); provider.responses.set(recordingUrl, recording);
    provider.responses.set(eventsUrl, { events: [event], next_page_uri: null });
    return { row, recordingSid, physical, recording, event, callUrl, eventsUrl, recordingUrl };
  }
  const read = (row: Operation) => journal.findVoiceRecordingOperation(row.id);
  const run = () => recovery.runVoiceRecordingLifecycleRecovery();
  async function age(row: Operation) {
    await sql`update public.workspace_voice_recording_operation set lease_expires_at = now() - interval '1 minute' where id = ${row.id}::uuid`;
  }
  async function jobs() { return sql`select params from public.job where workspace_id = ${workspaceId}::uuid`; }

  test.each(["dial", "parent", "customer"] as const)("recovers a lost root %s callback from its exact nonce and real SDK response", async (kind) => {
    const f = await fixture(kind);
    expect(await recovery.runVoiceRecordingRecovery()).toEqual({ lifecycle: { examined: 1, closed: 1, pending: 0 }, copies: { examined: 1, enqueued: 1, pending: 0 } });
    expect(await read(f.row)).toMatchObject({ provider_sid: f.recordingSid, provider_status: "completed", state: "accepted",
      logical_call_sid: f.row.logical_call_sid, recording_duration_seconds: 71, channels: 1, audio_url: null });
    expect((await read(f.row))?.recording_started_at?.getTime()).toBe(new Date(f.recording.start_time).getTime());
    expect(await jobs()).toHaveLength(1);
    expect(provider.requests.map((row) => row.uri)).toEqual([f.callUrl, f.eventsUrl, f.recordingUrl]);
  });
  test("child capture stays pending until its parent-reported recording contract is proved", async () => {
    const f = await fixture("customer", true, true);
    if (!f.row.source_parent_sid) throw new Error("Owned physical child fixture required");
    f.recording.call_sid = f.row.source_parent_sid; f.event.request.parameters.call_sid = f.row.source_parent_sid;
    expect(await run()).toEqual({ examined: 0, closed: 0, pending: 0 });
    await sql`update public.workspace_voice_recording_operation set lease_expires_at = now() + interval '5 minutes' where id = ${f.row.id}::uuid`;
    const before = await read(f.row); if (!before) throw new Error("Owned unsupported child fixture required");
    expect(await recovery.reconcileVoiceRecording(before)).toBe("pending");
    expect(await receipts.recordRecoveredVoiceRecording(before, { requestUrl: f.row.callback_url, accountSid,
      callSid: f.row.source_call_sid, recordingSid: f.recordingSid, source: "StartCallRecordingAPI", status: "completed" })).toBeNull();
    expect(await read(f.row)).toEqual(before); expect(provider.requests).toHaveLength(0);
  });
  test("a known recording needs no event-history discovery", async () => {
    const f = await fixture("dial", true); Object.assign(f.physical, { status: "in-progress", end_time: null });
    expect(await run()).toEqual({ examined: 1, closed: 1, pending: 0 });
    expect(provider.requests.map((row) => row.uri)).toEqual([f.callUrl, f.recordingUrl]);
  });
  test.each(["live", "too recent"])("unknown recording waits when the source is %s", async (change) => {
    const f = await fixture();
    if (change === "live") Object.assign(f.physical, { status: "in-progress", end_time: null });
    else f.physical.end_time = new Date(Date.now() - 15 * 60_000).toUTCString();
    expect(await run()).toEqual({ examined: 1, closed: 0, pending: 1 });
    expect((await read(f.row))?.provider_sid).toBeNull(); expect(provider.requests.map((row) => row.uri)).toEqual([f.callUrl]);
  });
  test.each(["URL", "method", "account", "call", "source", "alias", "missing fields"])("history with changed %s cannot own a time-matching recording", async (change) => {
    const f = await fixture();
    if (change === "URL") f.event.request.url += "&extra=1";
    if (change === "method") f.event.request.method = "GET";
    if (change === "account") f.event.request.parameters.account_sid = `AC${"0".repeat(32)}`;
    if (change === "call") f.event.request.parameters.call_sid = ca();
    if (change === "source") f.event.request.parameters.recording_source = "StartCallRecordingAPI";
    if (change === "alias") Object.assign(f.event.request.parameters, { RecordingSid: re() });
    if (change === "missing fields") f.event.request.parameters.recording_sid = "";
    expect(await run()).toEqual({ examined: 1, closed: 0, pending: 1 });
    expect((await read(f.row))?.provider_sid).toBeNull(); expect(provider.requests.some((row) => row.uri === f.recordingUrl)).toBe(false);
  });
  test("ambiguous nonce history remains pending", async () => {
    const f = await fixture();
    provider.responses.set(f.eventsUrl, { events: [f.event, { request: { ...f.event.request,
      parameters: { ...f.event.request.parameters, recording_sid: re() } } }], next_page_uri: null });
    expect(await run()).toEqual({ examined: 1, closed: 0, pending: 1 });
    expect((await read(f.row))?.provider_sid).toBeNull(); expect(await jobs()).toHaveLength(0);
  });
  test("a history at the fetch limit cannot prove uniqueness", async () => {
    const f = await fixture();
    provider.responses.set(f.eventsUrl, { events: [f.event, ...Array.from({ length: 999 }, () => ({ request: {} }))], next_page_uri: null });
    expect(await run()).toEqual({ examined: 1, closed: 0, pending: 1 });
    expect((await read(f.row))?.provider_sid).toBeNull();
  });
  test("delivery fragments are not part of the callback HTTP target", async () => {
    const f = await fixture(); f.event.request.url += "#ct=1000&rt=3000&tt=15000&rc=2&rp=ct,rt,5xx";
    expect(await run()).toEqual({ examined: 1, closed: 1, pending: 0 });
    expect((await read(f.row))?.provider_sid).toBe(f.recordingSid);
  });
  test.each(["account_sid", "sid", "to", "from", "direction", "parent_call_sid"])("checks the source call's %s through the real SDK", async (field) => {
    const f = await fixture(); Object.assign(f.physical, { [field]: field === "parent_call_sid" ? ca() : "wrong" });
    expect(await run()).toEqual({ examined: 1, closed: 0, pending: 1 });
    expect((await read(f.row))?.provider_sid).toBeNull(); expect(provider.requests).toHaveLength(1);
  });
  test.each([
    ["account", { account_sid: `AC${"1".repeat(32)}` }], ["call", { call_sid: `CA${"1".repeat(32)}` }],
    ["SID", { sid: `RE${"1".repeat(32)}` }], ["source", { source: "Conference" }],
    ["duration scalar", { duration: ["71"] }], ["fractional duration", { duration: "1.5" }],
    ["channels", { channels: 3 }], ["timestamp", { start_time: "bad" }], ["status", { status: "unexpected" }],
  ])("rejects wrong recording %s without replacing the saved SID", async (_name, patch) => {
    const f = await fixture("dial", true); Object.assign(f.recording, patch);
    expect(await run()).toEqual({ examined: 1, closed: 0, pending: 1 });
    expect(await read(f.row)).toMatchObject({ provider_sid: f.recordingSid, provider_status: "in-progress", terminal_at: null });
    expect(await jobs()).toHaveLength(0);
  });
  test("processing proves identity without inventing an in-progress receipt", async () => {
    const f = await fixture(); f.recording.status = "processing"; f.recording.duration = "";
    expect(await run()).toEqual({ examined: 1, closed: 0, pending: 1 });
    expect(await read(f.row)).toMatchObject({ state: "accepted", provider_sid: f.recordingSid, provider_status: null, terminal_at: null });
    expect(await jobs()).toHaveLength(0);
  });
  test("an unknown recording resource must match the history's exact RecordingSid", async () => {
    const f = await fixture(); f.recording.sid = re();
    expect(await run()).toEqual({ examined: 1, closed: 0, pending: 1 });
    expect((await read(f.row))?.provider_sid).toBeNull(); expect(await jobs()).toHaveLength(0);
  });
  test("an absent recording closes without requiring nonexistent media metadata", async () => {
    const f = await fixture(); Object.assign(f.recording, { status: "absent", channels: 0, duration: null, start_time: null });
    expect(await recovery.runVoiceRecordingRecovery()).toEqual({ lifecycle: { examined: 1, closed: 1, pending: 0 }, copies: { examined: 0, enqueued: 0, pending: 0 } });
    expect(await read(f.row)).toMatchObject({ provider_sid: f.recordingSid, provider_status: "absent", audio_url: null });
  });
  test("a replacement account cannot read the original recording", async () => {
    const f = await fixture();
    provider.client = sdkClient(`AC${"2".repeat(32)}`);
    expect(await run()).toEqual({ examined: 1, closed: 0, pending: 1 });
    expect(provider.requests).toHaveLength(0); expect((await read(f.row))?.provider_sid).toBeNull();
  });
  test("stale leases cannot read, bind or postpone a newer observation", async () => {
    const f = await fixture(), [old] = await leases.claimVoiceRecordingRecovery();
    await age(f.row); const [current] = await leases.claimVoiceRecordingRecovery();
    expect(old.lease_token).not.toBe(current.lease_token);
    expect(await recovery.reconcileVoiceRecording(old)).toBe("pending");
    expect(await receipts.recordRecoveredVoiceRecording(old, { requestUrl: old.callback_url, accountSid, callSid: old.source_call_sid,
      recordingSid: f.recordingSid, source: "DialVerb", status: "completed" })).toBeNull();
    await leases.deferVoiceRecordingRecovery(old);
    expect(await read(f.row)).toEqual(current); expect(provider.requests).toHaveLength(0);
  });
  test("an expired lease cannot bind even when no successor has claimed it", async () => {
    const f = await fixture(), [owner] = await leases.claimVoiceRecordingRecovery();
    await age(f.row); const before = await read(f.row);
    expect(await recovery.reconcileVoiceRecording(owner)).toBe("pending");
    expect(await receipts.recordRecoveredVoiceRecording(owner, { requestUrl: owner.callback_url, accountSid,
      callSid: owner.source_call_sid, recordingSid: f.recordingSid, source: "DialVerb", status: "completed" })).toBeNull();
    expect(await read(f.row)).toEqual(before); expect(provider.requests).toHaveLength(0);
  });
  test.each(["prepared", "failed", "completed"])("the lifecycle sweep excludes %s work", async (state) => {
    const f = await fixture();
    if (state === "prepared") await sql`update public.workspace_voice_recording_operation set state = 'prepared', send_started_at = null where id = ${f.row.id}::uuid`;
    if (state === "failed") await sql`update public.workspace_voice_recording_operation set state = 'failed' where id = ${f.row.id}::uuid`;
    if (state === "completed") await sql`update public.workspace_voice_recording_operation set state = 'accepted', provider_sid = ${f.recordingSid},
      provider_status = 'completed', terminal_at = now() where id = ${f.row.id}::uuid`;
    expect(await run()).toEqual({ examined: 0, closed: 0, pending: 0 }); expect(provider.requests).toHaveLength(0);
  });
  test("an API failure keeps the row retryable and does not stop other observations", async () => {
    const first = await fixture(), second = await fixture();
    provider.responses.delete(first.callUrl);
    expect(await run()).toEqual({ examined: 2, closed: 1, pending: 1 });
    expect(await read(first.row)).toMatchObject({ provider_sid: null, last_error: "Recording provider observation needs recovery" });
    expect((await read(second.row))?.provider_status).toBe("completed");
    provider.responses.set(first.callUrl, first.physical); await age(first.row);
    expect(await run()).toEqual({ examined: 1, closed: 1, pending: 0 });
    expect((await read(first.row))?.provider_sid).toBe(first.recordingSid);
  });
  test.each(["client", "recording"])("late %s reads cannot write after the recovery budget", async (stage) => {
    const f = await fixture(); let resume: (() => void) | undefined;
    const bind = vi.spyOn(receipts, "recordRecoveredVoiceRecording");
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    (stage === "client" ? provider.beforeClient : provider.beforeRecording).mockImplementationOnce(() => gate);
    const began = Date.now(), running = run(); let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([running, new Promise<never>((_resolve, reject) => {
        watchdog = setTimeout(() => reject(new Error("Provider verification exceeded its recovery budget")), 8000);
      })]);
      expect(result).toEqual({ examined: 1, closed: 0, pending: 1 }); expect(Date.now() - began).toBeLessThan(8000);
      expect((await read(f.row))?.provider_sid).toBeNull(); expect(bind).not.toHaveBeenCalled();
      if (!resume) throw new Error("Owned late-read gate required"); resume();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await Promise.allSettled(bind.mock.results.map((result) => result.value));
      expect(bind).not.toHaveBeenCalled(); expect((await read(f.row))?.provider_sid).toBeNull();
      if (stage === "client") expect(provider.requests).toHaveLength(0);
      expect(await jobs()).toHaveLength(0);
    } finally { clearTimeout(watchdog); resume?.(); await Promise.allSettled([running]); }
  });
  test("each claimed operation has its own lease", async () => {
    await fixture(); await fixture(); const rows = await leases.claimVoiceRecordingRecovery();
    expect(rows).toHaveLength(2); expect(new Set(rows.map((row) => row.lease_token)).size).toBe(2);
    expect(await leases.claimVoiceRecordingRecovery()).toEqual([]);
  });
});
