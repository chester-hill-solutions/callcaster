import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { VoiceSetupRoot } from "@/lib/voice-bridge-identity";
import type { VoiceRecordingReceipt } from "@/lib/voice-recording";
import type { VoiceReservation } from "@/server/voice-credit-reservation.server";

vi.hoisted(() => { process.env.TZ = "UTC"; });
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
let sql: postgres.Sql;
let journal: typeof import("@/server/voice-recording-operation.server");
let receipts: typeof import("@/server/voice-recording-receipt.server");
let funding: typeof import("@/server/voice-credit-reservation.server");
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
  });
  beforeEach(async () => {
    await sql`delete from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
  });
  afterEach(async () => {
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
      if (sql) await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
    } finally {
      await sql?.end();
      if (journal) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  async function reserve(sdk = false) {
    const result = await funding.reserveVoiceCredits({ workspaceId, userId: actor, kind: "staffed", accountSid,
      to: recipient, from: callerId, setupTo: sdk ? "" : phone, setupClientIdentity: sdk ? `handset-${actor}` : null });
    if (!result.ok) throw new Error(`Recording funding fixture refused: ${result.reason}`);
    return result.reservation;
  }
  function root(row: Reservation): VoiceSetupRoot {
    return { sid: ca(), accountSid, to: row.setup_client_identity ? "" : phone,
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
});
