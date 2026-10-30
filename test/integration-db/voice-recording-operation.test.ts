import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import twilio from "twilio";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { VoiceSetupRoot } from "@/lib/voice-bridge-identity";
import type { VoiceRecordingReceipt } from "@/lib/voice-recording";
import type { VoiceReservation } from "@/server/voice-credit-reservation.server";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";

vi.hoisted(() => { process.env.TZ = "UTC"; process.env.BASE_URL = "https://recording-journal.example.test"; process.env.TWILIO_VALIDATE_WEBHOOKS = "true"; });
const io = vi.hoisted(() => ({ fetch: vi.fn(), upload: vi.fn(),
  media: new Map<string, Uint8Array>(), objects: new Map<string, Uint8Array>(),
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/object-storage.server")>(), uploadObject: io.upload,
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID();
const accountSid = `AC${randomUUID().replaceAll("-", "")}`;
const callerId = "+16135550701", recipient = "+16135550799", phone = "+16135550702";
const ca = () => `CA${randomUUID().replaceAll("-", "")}`;
const re = () => `RE${randomUUID().replaceAll("-", "")}`;
const baseUrl = "https://recording-journal.example.test";
const token = "owned-recording-token";
const fault = `recording_journal_${randomUUID().replaceAll("-", "")}`;
let sql: postgres.Sql;
let journal: typeof import("@/server/voice-recording-operation.server");
let receipts: typeof import("@/server/voice-recording-receipt.server");
let funding: typeof import("@/server/voice-credit-reservation.server");
let callback: typeof import("../../app/routes/api+/voice-recording.action.server");
let copies: typeof import("@/server/voice-recording-copy.server");
let copyWorker: typeof import("@/lib/voice-recording-copy.server");
let jobHandlers: typeof import("@/lib/worker/handlers.server")["jobHandlers"];
type Operation = NonNullable<Awaited<ReturnType<typeof journal.findVoiceRecordingOperation>>>;
type Reservation = VoiceReservation;

describe("owned recording parts (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned database URL required");
    sql = postgres(url, { max: 3, onnotice: () => {} });
    await sql`insert into public.workspace (id, name, credits, twilio_data) values
      (${workspaceId}::uuid, 'Owned recording journal fixture', 100, ${sql.json({ sid: accountSid, authToken: "owned-recording-token" })}),
      (${foreignId}::uuid, 'Foreign recording journal control', 100, '{}'::jsonb)`;
    journal = await import("@/server/voice-recording-operation.server");
    receipts = await import("@/server/voice-recording-receipt.server");
    funding = await import("@/server/voice-credit-reservation.server");
    callback = await import("../../app/routes/api+/voice-recording.action.server");
    copies = await import("@/server/voice-recording-copy.server");
    copyWorker = await import("@/lib/voice-recording-copy.server");
    ({ jobHandlers } = await import("@/lib/worker/handlers.server"));
  });
  async function clearFault() {
    await sql.unsafe(`drop trigger if exists ${fault} on public.job`);
    await sql.unsafe(`drop trigger if exists ${fault} on public.workspace_voice_recording_operation`);
    await sql.unsafe(`drop function if exists public.${fault}()`);
  }
  beforeEach(async () => {
    vi.clearAllMocks(); io.media.clear(); io.objects.clear();
    io.fetch.mockReset().mockImplementation(async (url: string) => {
      const bytes = io.media.get(url);
      if (!bytes) throw new Error("Owned provider recording fixture required");
      return new Response(Uint8Array.from(bytes), { headers: { "Content-Type": "audio/mpeg" } });
    });
    io.upload.mockReset().mockImplementation(async (bucket: string, path: string, bytes: Uint8Array) => {
      io.objects.set(`${bucket}:${path}`, Uint8Array.from(bytes));
    });
    vi.stubGlobal("fetch", io.fetch);
    await clearFault();
    await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: accountSid, authToken: token })} where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
  });
  afterEach(async () => {
    await clearFault(); vi.unstubAllGlobals();
    const [owned] = await sql`select credits,
      (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger
      from public.workspace where id = ${workspaceId}::uuid`;
    const [foreign] = await sql`select credits,
      (select count(*)::int from public.workspace_voice_recording_operation where workspace = ${foreignId}::uuid) as recordings
      from public.workspace where id = ${foreignId}::uuid`;
    expect(owned).toEqual({ credits: 100, ledger: 0 });
    expect(foreign).toEqual({ credits: 100, recordings: 0 });
  });
  afterAll(async () => {
    try {
      if (sql) {
        await clearFault();
        await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
      }
    } finally {
      await sql?.end();
      if (journal) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  async function reserve(sdk = false, selectedAccount = accountSid) {
    const result = await funding.reserveVoiceCredits({ workspaceId, userId: actor, kind: "staffed", accountSid: selectedAccount,
      to: recipient, from: callerId, setupTo: sdk ? "" : phone, setupClientIdentity: sdk ? `handset-${actor}` : null });
    if (!result.ok) throw new Error(`Recording funding fixture refused: ${result.reason}`);
    return result.reservation;
  }
  function root(row: Reservation): VoiceSetupRoot {
    return { sid: ca(), accountSid: row.account_sid, to: row.setup_client_identity ? "" : phone,
      from: row.setup_client_identity ? `client:${row.setup_client_identity}` : callerId,
      direction: row.setup_client_identity ? "inbound" : "outbound-api", parentCallSid: null };
  }
  async function prepare(sdk = false) {
    const reservation = await reserve(sdk), physical = root(reservation);
    const operation = await journal.prepareVoiceDialRecording(reservation, physical, baseUrl);
    if (!operation) throw new Error("New dial must have a recording operation");
    return { reservation, physical, operation };
  }
  async function arm(reservation: Reservation, operation: Operation, rootSid = operation.source_call_sid) {
    const { db } = await import("@/server/db");
    const { workspace_voice_reservation: reservations } = await import("@/db/schema");
    return db.transaction(async (tx) => {
      const [issued] = await tx.update(reservations).set({ setup_sid: rootSid, state: "creating",
        send_started_at: new Date(), recipient_instruction_issued_at: new Date() }).where(eq(reservations.id, reservation.id)).returning();
      if (!issued) throw new Error("Owned fixture instruction required");
      return journal.armVoiceDialRecording(tx, issued, operation.id);
    });
  }
  async function armed() {
    const prepared = await prepare();
    return { ...prepared, operation: await arm(prepared.reservation, prepared.operation) };
  }
  function receipt(row: Operation, overrides: Partial<VoiceRecordingReceipt> = {}): VoiceRecordingReceipt {
    return { requestUrl: row.callback_url, accountSid, callSid: row.source_call_sid,
      recordingSid: re(), source: "DialVerb", status: "in-progress", ...overrides };
  }
  const read = (row: Operation) => journal.findVoiceRecordingOperation(row.id);
  async function count() {
    const [row] = await sql`select count(*)::int as count from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    return row.count;
  }
  function callbackParams(row: Operation, overrides: Record<string, string> = {}) {
    return { AccountSid: row.account_sid, CallSid: row.source_call_sid, RecordingSid: re(),
      RecordingSource: row.kind === "dial" ? "DialVerb" : "StartCallRecordingAPI", RecordingStatus: "completed",
      RecordingDuration: "71", RecordingChannels: "1", RecordingStartTime: "Fri, 30 Oct 2026 01:00:00 +0000", ...overrides };
  }
  async function signedCallback(row: Operation, params: Record<string, string> = callbackParams(row), options: {
    url?: string; method?: string; validSignature?: boolean; signingParams?: Record<string, string>; signingToken?: string;
  } = {}) {
    const url = options.url ?? row.callback_url, method = options.method ?? "POST";
    const signature = options.validSignature === false ? "wrong" :
      twilio.getExpectedTwilioSignature(options.signingToken ?? token, url, options.signingParams ?? params);
    const request = new Request(url, { method, headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": signature },
      ...(method === "GET" || method === "HEAD" ? {} : { body: new URLSearchParams(params) }) });
    return asRouteResponse(callback.action(routeArgs(request)));
  }
  async function queued() {
    return sql`select id, type, params, workspace_id, max_attempts from public.job
      where workspace_id = ${workspaceId}::uuid and type = 'recording_side_effects' order by id`;
  }
  async function runQueued(index = 0, workspace: string | null = workspaceId) {
    const rows = await queued(), row = rows[index];
    if (!row) throw new Error("Owned recording copy job required");
    const job: ClaimedJobRow = { id: Number(row.id), type: row.type, params: row.params, workspace_id: workspace,
      user_id: null, attempt_count: 1, max_attempts: row.max_attempts };
    return jobHandlers.recording_side_effects(job);
  }
  function providerMedia(params: Record<string, string>, text = "owned recording part") {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${params.AccountSid}/Recordings/${params.RecordingSid}.mp3`;
    const bytes = new TextEncoder().encode(text); io.media.set(url, bytes); return { url, bytes };
  }
  async function ageCopy(row: Operation) {
    await sql`update public.workspace_voice_recording_operation set lease_expires_at = now() - interval '1 minute' where id = ${row.id}::uuid`;
  }

  test("saves one immutable physical source and callback before sending", async () => {
    const { reservation, physical, operation } = await prepare();
    expect(operation).toMatchObject({ workspace: workspaceId, reservation_id: reservation.id, user_id: actor,
      kind: "dial", intent_id: reservation.id, account_sid: accountSid, logical_call_sid: physical.sid,
      source_call_sid: physical.sid, source_to: phone, source_from: callerId, source_direction: "outbound-api",
      source_parent_sid: null, state: "prepared", send_started_at: null, provider_sid: null, audio_url: null });
    expect(operation.callback_url).toBe(`${baseUrl}/api/voice-recording?recording=${operation.id}`);
    const replay = await journal.prepareVoiceDialRecording(reservation, physical, "https://new-host.example.test");
    expect(replay).toEqual(operation);
    expect(await count()).toBe(1);
  });
  test("keeps the SDK root's real inbound identity", async () => {
    const { physical, operation } = await prepare(true);
    expect(operation).toMatchObject({ source_call_sid: physical.sid, source_to: "", source_from: `client:handset-${actor}`,
      source_direction: "inbound", source_parent_sid: null });
  });
  test("concurrent preparation returns one saved nonce", async () => {
    const reservation = await reserve(), physical = root(reservation);
    const results = await Promise.all(Array.from({ length: 4 }, () => journal.prepareVoiceDialRecording(reservation, physical, baseUrl)));
    expect(new Set(results.map((row) => row?.id)).size).toBe(1);
    expect(results[0]?.state).toBe("prepared"); expect(await count()).toBe(1);
  });
  test.each([
    ["account", { accountSid: `AC${"0".repeat(32)}` }], ["destination", { to: recipient }],
    ["caller", { from: recipient }], ["direction", { direction: "outbound-dial" }],
    ["parent", { parentCallSid: `CA${"0".repeat(32)}` }], ["SID", { sid: "bad" }],
  ])("rejects a different root %s before preparing", async (_name, patch) => {
    const reservation = await reserve();
    await expect(journal.prepareVoiceDialRecording(reservation, Object.assign(root(reservation), patch), baseUrl))
      .rejects.toThrow(/recording|Recording/);
    expect(await count()).toBe(0);
  });
  test.each(["workspace", "actor", "account"])("rejects a different reservation %s", async (field) => {
    const reservation = await reserve(), physical = root(reservation);
    const owner = { ...reservation, ...(field === "workspace" ? { workspace: foreignId } :
      field === "actor" ? { user_id: randomUUID() } : { account_sid: `AC${"1".repeat(32)}` }) };
    await expect(journal.prepareVoiceDialRecording(owner, physical, baseUrl)).rejects.toThrow(/manual call/);
    expect(await count()).toBe(0);
  });
  test("one SDK intent cannot bind another otherwise valid root", async () => {
    const { reservation, operation } = await prepare(true);
    await expect(journal.prepareVoiceDialRecording(reservation, root(reservation), baseUrl)).rejects.toThrow(/another source/);
    expect(await read(operation)).toEqual(operation); expect(await count()).toBe(1);
  });
  test("a conference reservation cannot claim a manual Dial recording", async () => {
    const reservation = await reserve(), physical = root(reservation);
    await sql`update public.workspace_voice_reservation set conference_id = 'existing-room' where id = ${reservation.id}::uuid`;
    await expect(journal.prepareVoiceDialRecording(reservation, physical, baseUrl)).rejects.toThrow(/manual call/);
    expect(await count()).toBe(0);
  });
  test.each(["issued", "released", "settled", "terminal"])("does not retrofit an %s call", async (condition) => {
    const reservation = await reserve(), physical = root(reservation);
    if (condition === "issued") await sql`update public.workspace_voice_reservation set recipient_instruction_issued_at = now() where id = ${reservation.id}::uuid`;
    if (condition === "released" || condition === "settled") await sql`update public.workspace_voice_reservation set state = ${condition} where id = ${reservation.id}::uuid`;
    if (condition === "terminal") await sql`update public.workspace_voice_reservation set setup_terminal_at = now() where id = ${reservation.id}::uuid`;
    expect(await journal.prepareVoiceDialRecording(reservation, physical, baseUrl)).toBeNull();
    expect(await count()).toBe(0);
  });
  test("arms the nonce once with the customer instruction", async () => {
    const { reservation, operation } = await prepare();
    const started = await arm(reservation, operation);
    expect(started.state).toBe("creating"); expect(started.send_started_at).toBeInstanceOf(Date);
    await expect(arm(reservation, operation)).rejects.toThrow(/not prepared/);
    expect(await read(operation)).toEqual(started);
  });
  test("a recording fault rolls the customer instruction back", async () => {
    const { reservation, operation } = await prepare();
    await expect(arm(reservation, operation, ca())).rejects.toThrow(/not prepared/);
    const [saved] = await sql`select setup_sid, recipient_instruction_issued_at from public.workspace_voice_reservation where id = ${reservation.id}::uuid`;
    expect(saved).toEqual({ setup_sid: null, recipient_instruction_issued_at: null });
    expect(await read(operation)).toEqual(operation);
  });
  test("cannot arm another reservation's nonce", async () => {
    const { operation } = await prepare(), other = await reserve();
    await expect(arm(other, operation)).rejects.toThrow(/not prepared/);
    expect(await read(operation)).toEqual(operation);
  });
  test("rejects acceptance before the committed instruction checkpoint", async () => {
    const { operation } = await prepare();
    await expect(receipts.recordVoiceRecordingReceipt(operation, receipt(operation))).rejects.toThrow(/instruction/);
    expect(await read(operation)).toEqual(operation);
  });
  test("persists early acceptance before any create acknowledgement", async () => {
    const { operation } = await armed(), input = receipt(operation, { startedAt: new Date("2026-10-30T01:00:00Z"), channels: 1 });
    const accepted = await receipts.recordVoiceRecordingReceipt(operation, input);
    expect(accepted).toMatchObject({ state: "accepted", provider_sid: input.recordingSid, provider_status: "in-progress",
      recording_started_at: input.startedAt, channels: 1, terminal_at: null, audio_url: null });
    expect(await read(operation)).toEqual(accepted);
  });
  test.each(["reservation", "actor", "logical call", "physical source"])("rejects a changed saved %s owner", async (field) => {
    const { operation } = await armed();
    const owner = { ...operation, ...(field === "reservation" ? { reservation_id: randomUUID() } :
      field === "actor" ? { user_id: randomUUID() } : field === "logical call" ? { logical_call_sid: ca() } : { source_from: recipient }) };
    await expect(receipts.recordVoiceRecordingReceipt(owner, receipt(operation))).rejects.toThrow(/owner/);
    expect(await read(operation)).toEqual(operation);
  });
  test("preserves acceptance after the product reservation is removed", async () => {
    const { reservation, operation } = await armed();
    await sql`delete from public.workspace_voice_reservation where id = ${reservation.id}::uuid`;
    const input = receipt(operation, { status: "completed", durationSeconds: 42 });
    const accepted = await receipts.recordVoiceRecordingReceipt(operation, input);
    expect(accepted).toMatchObject({ reservation_id: reservation.id, logical_call_sid: operation.logical_call_sid,
      provider_sid: input.recordingSid, provider_status: "completed", recording_duration_seconds: 42 });
  });
  test.each(["URL", "account", "call", "source", "recording SID"])("rejects a receipt for a different %s", async (field) => {
    const { operation } = await armed();
    const patch = field === "URL" ? { requestUrl: `${operation.callback_url}&other=true` } :
      field === "account" ? { accountSid: `AC${"2".repeat(32)}` } : field === "call" ? { callSid: ca() } :
      field === "source" ? { source: "StartCallRecordingAPI" } : { recordingSid: "bad" };
    await expect(receipts.recordVoiceRecordingReceipt(operation, receipt(operation, patch))).rejects.toThrow(/receipt/);
    expect(await read(operation)).toEqual(operation);
  });
  test.each([
    ["negative duration", { durationSeconds: -1 }], ["fractional duration", { durationSeconds: 0.5 }],
    ["oversized duration", { durationSeconds: 2147483648 }], ["invalid start time", { startedAt: new Date(Number.NaN) }],
    ["channel count", { channels: 3 }],
  ])("rejects %s before writing", async (_name, patch) => {
    const { operation } = await armed();
    await expect(receipts.recordVoiceRecordingReceipt(operation, Object.assign(receipt(operation), patch))).rejects.toThrow(/Invalid recording receipt/);
    expect(await read(operation)).toEqual(operation);
  });
  test("freezes completed media metadata across late and duplicate receipts", async () => {
    const { operation } = await armed(), input = receipt(operation, { status: "completed", durationSeconds: 71,
      startedAt: new Date("2026-10-30T01:00:00Z"), channels: 1 });
    const completed = await receipts.recordVoiceRecordingReceipt(operation, input);
    expect(completed.terminal_at).toBeInstanceOf(Date);
    expect(completed).toMatchObject({ provider_status: "completed", recording_duration_seconds: 71 });
    for (const status of ["in-progress", "completed", "absent"] as const) {
      expect(await receipts.recordVoiceRecordingReceipt(operation, { ...input, status, durationSeconds: 1, channels: 2 })).toEqual(completed);
    }
    await expect(receipts.recordVoiceRecordingReceipt(operation, { ...input, recordingSid: re() })).rejects.toThrow(/instruction/);
    expect(await read(operation)).toEqual(completed);
  });
  test("retains a missing-media terminal result", async () => {
    const { operation } = await armed();
    const absent = await receipts.recordVoiceRecordingReceipt(operation, receipt(operation, { status: "absent" }));
    expect(absent).toMatchObject({ provider_status: "absent", audio_url: null });
    expect(absent.terminal_at).toBeInstanceOf(Date);
  });
  test("cannot attach one provider recording to two logical calls", async () => {
    const first = await armed(), second = await armed(), recordingSid = re();
    await receipts.recordVoiceRecordingReceipt(first.operation, receipt(first.operation, { recordingSid }));
    await expect(receipts.recordVoiceRecordingReceipt(second.operation, receipt(second.operation, { recordingSid })))
      .rejects.toMatchObject({ cause: { code: "23505" } });
    expect(await read(second.operation)).toEqual(second.operation);
  });
  test("tenant reads and writes cannot reach another workspace's part", async () => {
    const { operation } = await prepare();
    const { createTenantDb } = await import("@/server/tenant-db");
    const { workspace_voice_recording_operation: recordings } = await import("@/db/schema");
    const foreign = createTenantDb(foreignId);
    expect(await foreign.workspace_voice_recording_operation.findFirst({ where: eq(recordings.id, operation.id) })).toBeUndefined();
    expect(await foreign.workspace_voice_recording_operation.update({ where: eq(recordings.id, operation.id), set: { last_error: "foreign write" } })).toEqual([]);
    expect(await read(operation)).toEqual(operation);
  });
  test("one reservation phase cannot gain another pending owner", async () => {
    const { operation } = await prepare();
    await expect(sql`insert into public.workspace_voice_recording_operation
      (id, workspace, reservation_id, user_id, kind, intent_id, logical_call_sid, source_call_sid,
       source_to, source_from, source_direction, account_sid, callback_url, lease_token, lease_expires_at)
      select ${randomUUID()}::uuid, workspace, reservation_id, user_id, kind, ${randomUUID()}::uuid, logical_call_sid, source_call_sid,
        source_to, source_from, source_direction, account_sid, callback_url, lease_token, lease_expires_at
      from public.workspace_voice_recording_operation where id = ${operation.id}::uuid`).rejects.toMatchObject({ code: "23505" });
    expect(await count()).toBe(1);
  });
  test("database constraints reject acceptance without a send checkpoint", async () => {
    const { operation } = await prepare();
    await expect(sql`update public.workspace_voice_recording_operation set provider_sid = ${re()} where id = ${operation.id}::uuid`)
      .rejects.toMatchObject({ code: "23514" });
    expect(await read(operation)).toEqual(operation);
  });

  test("the signed callback saves a completed part before queueing its copy", async () => {
    const { operation } = await armed(), params = callbackParams(operation);
    expect((await signedCallback(operation, params)).status).toBe(204);
    const saved = await read(operation), jobs = await queued();
    expect(saved).toMatchObject({ provider_sid: params.RecordingSid, provider_status: "completed",
      recording_duration_seconds: 71, channels: 1, recording_started_at: new Date("2026-10-30T01:00:00Z"), audio_url: null });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ workspace_id: workspaceId,
      params: { recordingOperationId: operation.id, leaseToken: saved?.lease_token } });
    expect(io.fetch).not.toHaveBeenCalled(); expect(io.upload).not.toHaveBeenCalled();
    expect((await signedCallback(operation, params)).status).toBe(204);
    expect(await queued()).toHaveLength(1);
  });
  test.each(["in-progress", "absent"])("a signed %s receipt does not queue a download", async (status) => {
    const { operation } = await armed();
    expect((await signedCallback(operation, callbackParams(operation, { RecordingStatus: status }))).status).toBe(204);
    expect((await read(operation))?.provider_status).toBe(status);
    expect(await queued()).toHaveLength(0); expect(io.fetch).not.toHaveBeenCalled();
  });
  test.each(["GET", "HEAD", "PUT"])("rejects %s at the recording boundary", async (method) => {
    const { operation } = await armed();
    expect((await signedCallback(operation, undefined, { method })).status).toBe(405);
    expect(await read(operation)).toEqual(operation); expect(await queued()).toHaveLength(0);
  });
  test.each(["bad signature", "unknown nonce", "duplicate nonce", "extra query"])("rejects %s without storing acceptance", async (kind) => {
    const { operation } = await armed();
    const url = kind === "unknown nonce" ? `${baseUrl}/api/voice-recording?recording=${randomUUID()}` :
      kind === "duplicate nonce" ? `${operation.callback_url}&recording=${operation.id}` :
      kind === "extra query" ? `${operation.callback_url}&extra=1` : operation.callback_url;
    expect((await signedCallback(operation, undefined, { url, validSignature: kind !== "bad signature" })).status).toBe(403);
    expect(await read(operation)).toEqual(operation); expect(await queued()).toHaveLength(0);
  });
  test("rejects duplicate form fields before receipt normalization", async () => {
    const { operation } = await armed(), params = callbackParams(operation);
    const body = new URLSearchParams(params); body.append("CallSid", params.CallSid);
    const response = await asRouteResponse(callback.action(routeArgs(new Request(operation.callback_url, {
      method: "POST", headers: { "X-Twilio-Signature": twilio.getExpectedTwilioSignature(token, operation.callback_url, params) }, body,
    }))));
    expect(response.status).toBe(403); expect(await read(operation)).toEqual(operation);
  });
  test("validates aliases over their original signed bytes", async () => {
    const { operation } = await armed(), params = callbackParams(operation);
    const aliases = { account_sid: params.AccountSid, call_sid: params.CallSid, recording_sid: params.RecordingSid,
      recording_source: params.RecordingSource, recording_status: params.RecordingStatus,
      recording_duration: params.RecordingDuration, recording_channels: params.RecordingChannels, recording_start_time: params.RecordingStartTime };
    expect((await signedCallback(operation, aliases)).status).toBe(204);
    expect((await read(operation))?.provider_sid).toBe(params.RecordingSid); expect(await queued()).toHaveLength(1);
  });
  test.each(["account_sid", "call_sid", "recording_sid", "recording_source", "recording_status", "recording_duration", "recording_channels", "recording_start_time"])("rejects a signed conflicting %s alias", async (field) => {
    const { operation } = await armed(), params = callbackParams(operation, { [field]: "different" });
    expect((await signedCallback(operation, params)).status).toBe(403);
    expect(await read(operation)).toEqual(operation); expect(await queued()).toHaveLength(0);
  });
  test.each([
    ["account", { AccountSid: `AC${"3".repeat(32)}` }], ["physical call", { CallSid: `CA${"3".repeat(32)}` }],
    ["recording source", { RecordingSource: "StartCallRecordingAPI" }], ["fractional duration", { RecordingDuration: "1.5" }],
    ["negative duration", { RecordingDuration: "-1" }], ["invalid timestamp", { RecordingStartTime: "bad" }],
  ])("rejects a signed receipt with the wrong %s", async (_name, patch) => {
    const { operation } = await armed();
    expect((await signedCallback(operation, callbackParams(operation, patch))).status).toBe(403);
    expect(await read(operation)).toEqual(operation); expect(await queued()).toHaveLength(0);
  });
  test("a replacement account token cannot authenticate an old account's recording", async () => {
    const { operation } = await armed();
    const replacementAccount = `AC${"4".repeat(32)}`;
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: replacementAccount, authToken: "replacement-token" })}
      where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
    const nextReservation = await reserve(false, replacementAccount);
    const next = await journal.prepareVoiceDialRecording(nextReservation, root(nextReservation), baseUrl);
    if (!next) throw new Error("Replacement account recording fixture required");
    await arm(nextReservation, next);
    expect((await signedCallback(next, undefined, { signingToken: "replacement-token" })).status).toBe(204);
    expect((await signedCallback(operation, undefined, { signingToken: "replacement-token" })).status).toBe(403);
    expect(await read(operation)).toEqual(operation);
    const jobs = await queued(); expect(jobs).toHaveLength(1);
    expect(jobs[0].params.recordingOperationId).toBe(next.id);
  });
  test("a signed callback still needs the committed instruction", async () => {
    const { operation } = await prepare();
    expect((await signedCallback(operation)).status).toBe(403);
    expect(await read(operation)).toEqual(operation); expect(await queued()).toHaveLength(0);
  });
  test("the registered worker copies the exact owned recording and replays without I/O", async () => {
    const { operation } = await armed(), params = callbackParams(operation, { RecordingUrl: "https://untrusted.example.test/audio" });
    const media = providerMedia(params);
    expect((await signedCallback(operation, params)).status).toBe(204);
    expect(await runQueued()).toEqual({ copied: true });
    const path = `call-recordings/${workspaceId}/recording-${operation.logical_call_sid}-${params.RecordingSid}.mp3`;
    expect((await read(operation))?.audio_url).toBe(path);
    expect(io.objects.get(`workspaceAudio:${path}`)).toEqual(media.bytes);
    expect(io.fetch).toHaveBeenCalledExactlyOnceWith(media.url, { headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}` } });
    expect(await runQueued()).toEqual({ copied: false });
    expect(io.fetch).toHaveBeenCalledOnce(); expect(io.upload).toHaveBeenCalledOnce();
  });
  test("a copy job cannot change its tenant or omit it", async () => {
    const { operation } = await armed(), params = callbackParams(operation); providerMedia(params);
    expect((await signedCallback(operation, params)).status).toBe(204);
    expect(await runQueued(0, foreignId)).toEqual({ copied: false });
    await expect(runQueued(0, null)).rejects.toThrow(/no workspace/);
    expect(io.fetch).not.toHaveBeenCalled(); expect((await read(operation))?.audio_url).toBeNull();
    expect(await runQueued()).toEqual({ copied: true });
  });
  test("an expired delivery cannot copy after recovery transfers its lease", async () => {
    const { operation } = await armed(), params = callbackParams(operation); providerMedia(params);
    expect((await signedCallback(operation, params)).status).toBe(204);
    await ageCopy(operation);
    expect(await copyWorker.runVoiceRecordingCopyRecovery()).toEqual({ examined: 1, enqueued: 1, pending: 0 });
    expect(await queued()).toHaveLength(2);
    expect(await runQueued(0)).toEqual({ copied: false }); expect(io.fetch).not.toHaveBeenCalled();
    expect(await runQueued(1)).toEqual({ copied: true });
  });
  test("a stored path must identify the same recording part", async () => {
    const { operation } = await armed(), params = callbackParams(operation);
    expect((await signedCallback(operation, params)).status).toBe(204);
    const row = await read(operation); if (!row) throw new Error("Owned copy row required");
    await expect(copies.finishVoiceRecordingCopy(row, `call-recordings/${workspaceId}/recording-${row.logical_call_sid}-${re()}.mp3`))
      .rejects.toThrow(/does not match its part/);
    expect((await read(operation))?.audio_url).toBeNull();
  });
  test("concurrent completed callbacks queue one owned delivery", async () => {
    const { operation } = await armed(), params = callbackParams(operation);
    const responses = await Promise.all(Array.from({ length: 4 }, () => signedCallback(operation, params)));
    expect(responses.map((row) => row.status)).toEqual([204, 204, 204, 204]);
    expect(await queued()).toHaveLength(1); expect(io.fetch).not.toHaveBeenCalled();
  });
  test("queue failure keeps acceptance available to the minute recovery job", async () => {
    const { operation } = await armed(), params = callbackParams(operation); providerMedia(params);
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$begin
      if new.workspace_id = '${workspaceId}'::uuid then raise exception 'owned recording enqueue fault'; end if;
      return new; end$$`);
    await sql.unsafe(`create trigger ${fault} before insert on public.job for each row execute function public.${fault}()`);
    expect((await signedCallback(operation, params)).status).toBe(500);
    expect(await read(operation)).toMatchObject({ provider_sid: params.RecordingSid, provider_status: "completed", audio_url: null,
      last_error: "Recording copy needs recovery" });
    expect(await queued()).toHaveLength(0);
    await clearFault(); await ageCopy(operation);
    expect(await copyWorker.runVoiceRecordingCopyRecovery()).toEqual({ examined: 1, enqueued: 1, pending: 0 });
    expect(await runQueued()).toEqual({ copied: true });
  });
  test("a lost storage reply retries the same part without losing its identity", async () => {
    const { operation } = await armed(), params = callbackParams(operation); const media = providerMedia(params);
    expect((await signedCallback(operation, params)).status).toBe(204);
    io.upload.mockImplementationOnce(async (bucket: string, path: string, bytes: Uint8Array) => {
      io.objects.set(`${bucket}:${path}`, Uint8Array.from(bytes)); throw new Error("Owned lost storage reply");
    });
    await expect(runQueued()).rejects.toThrow(/upload_failed/);
    const pending = await read(operation);
    expect(pending).toMatchObject({ provider_sid: params.RecordingSid, provider_status: "completed", audio_url: null,
      last_error: "Recording copy needs recovery" });
    expect(io.objects.size).toBe(1);
    await ageCopy(operation);
    expect(await copyWorker.runVoiceRecordingCopyRecovery()).toEqual({ examined: 1, enqueued: 1, pending: 0 });
    expect(await runQueued(1)).toEqual({ copied: true });
    const saved = await read(operation);
    expect(io.objects.get(`workspaceAudio:${saved?.audio_url}`)).toEqual(media.bytes);
    expect(saved?.last_error).toBeNull(); expect(io.objects.size).toBe(1);
    expect(io.upload.mock.calls.map((args) => args[1])).toEqual([saved?.audio_url, saved?.audio_url]);
  });
  test("a local copy acknowledgement fault leaves an exact part for retry", async () => {
    const { operation } = await armed(), params = callbackParams(operation); const media = providerMedia(params);
    expect((await signedCallback(operation, params)).status).toBe(204);
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$begin
      if new.workspace = '${workspaceId}'::uuid and new.audio_url is not null then return null; end if;
      return new; end$$`);
    await sql.unsafe(`create trigger ${fault} before update on public.workspace_voice_recording_operation
      for each row execute function public.${fault}()`);
    await expect(runQueued()).rejects.toThrow(/acknowledgement was not saved/);
    expect((await read(operation))?.audio_url).toBeNull(); expect(io.objects.size).toBe(1);
    await clearFault(); await ageCopy(operation);
    expect(await copyWorker.runVoiceRecordingCopyRecovery()).toEqual({ examined: 1, enqueued: 1, pending: 0 });
    expect(await runQueued(1)).toEqual({ copied: true });
    expect(io.objects.get(`workspaceAudio:${(await read(operation))?.audio_url}`)).toEqual(media.bytes);
  });
  test("copy recovery waits for the original account credentials", async () => {
    const { operation } = await armed(), params = callbackParams(operation); providerMedia(params);
    expect((await signedCallback(operation, params)).status).toBe(204);
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: `AC${"5".repeat(32)}`, authToken: "replacement-token" })}
      where id = ${workspaceId}::uuid`;
    await expect(runQueued()).rejects.toThrow(/original account credentials/);
    expect(io.fetch).not.toHaveBeenCalled(); expect((await read(operation))?.audio_url).toBeNull();
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: accountSid, authToken: token })} where id = ${workspaceId}::uuid`;
    await ageCopy(operation); await copyWorker.runVoiceRecordingCopyRecovery();
    expect(await runQueued(1)).toEqual({ copied: true });
  });
  test("two recordings on one physical call retain distinct bytes and logical ownership", async () => {
    const { operation } = await armed(), first = callbackParams(operation);
    const before = providerMedia(first, "conversation before the audio change");
    expect((await signedCallback(operation, first)).status).toBe(204);
    expect(await runQueued()).toEqual({ copied: true });
    const nextId = randomUUID(), nextUrl = `${baseUrl}/api/voice-recording?recording=${nextId}`;
    // The API-create journal is not enabled yet. This fixture represents a separately accepted capture phase.
    await sql`insert into public.workspace_voice_recording_operation
      (id, workspace, reservation_id, user_id, kind, intent_id, logical_call_sid, source_call_sid,
       source_to, source_from, source_direction, account_sid, callback_url, state, send_started_at, lease_token, lease_expires_at)
      select ${nextId}::uuid, workspace, reservation_id, user_id, 'parent', ${randomUUID()}::uuid, logical_call_sid, source_call_sid,
        source_to, source_from, source_direction, account_sid, ${nextUrl}, 'creating', now(), ${randomUUID()}::uuid, now()
      from public.workspace_voice_recording_operation where id = ${operation.id}::uuid`;
    const next = await journal.findVoiceRecordingOperation(nextId); if (!next) throw new Error("Owned second capture fixture required");
    const second = callbackParams(next), after = providerMedia(second, "conversation after the audio change");
    expect((await signedCallback(next, second)).status).toBe(204);
    expect(await runQueued(1)).toEqual({ copied: true });
    const firstSaved = await read(operation), secondSaved = await read(next);
    expect(firstSaved?.logical_call_sid).toBe(operation.logical_call_sid);
    expect(secondSaved?.logical_call_sid).toBe(operation.logical_call_sid);
    expect(secondSaved?.source_call_sid).toBe(operation.source_call_sid);
    expect(firstSaved?.audio_url).not.toBe(secondSaved?.audio_url);
    expect(io.objects.get(`workspaceAudio:${firstSaved?.audio_url}`)).toEqual(before.bytes);
    expect(io.objects.get(`workspaceAudio:${secondSaved?.audio_url}`)).toEqual(after.bytes);
    expect(io.objects.size).toBe(2);
    const [holds] = await sql`select count(*)::int as count from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(holds.count).toBe(1);
  });
  test("recovery excludes unfinished, absent, already stored and leased parts", async () => {
    const { operation } = await armed();
    expect(await copyWorker.runVoiceRecordingCopyRecovery()).toEqual({ examined: 0, enqueued: 0, pending: 0 });
    const params = callbackParams(operation); providerMedia(params);
    expect((await signedCallback(operation, params)).status).toBe(204);
    expect(await copyWorker.runVoiceRecordingCopyRecovery()).toEqual({ examined: 0, enqueued: 0, pending: 0 });
    expect(await runQueued()).toEqual({ copied: true });
    await ageCopy(operation);
    expect(await copyWorker.runVoiceRecordingCopyRecovery()).toEqual({ examined: 0, enqueued: 0, pending: 0 });
    const other = await armed();
    expect((await signedCallback(other.operation, callbackParams(other.operation, { RecordingStatus: "absent" }))).status).toBe(204);
    await ageCopy(other.operation);
    expect(await copyWorker.runVoiceRecordingCopyRecovery()).toEqual({ examined: 0, enqueued: 0, pending: 0 });
  });
});
