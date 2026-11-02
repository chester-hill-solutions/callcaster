import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import twilio from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import TwilioResponse from "twilio/lib/http/response";
import { accountSid, actor, callerId, customer, funded, sid, signedPredictive, sql, state, useOwnedAudioFixture, web, workspaceId } from "../helpers/voice-audio-fixture";
import { isSinglePartCallRecording, readVoiceCallRecordingManifest } from "@/server/voice-recording-batch.server";
import { callRecordingPartStoragePath } from "@/lib/call-recording-storage.server";
import { recordVoiceCustomerCallTiming, type VoiceCustomerCallObservation } from "@/server/voice-customer-media-boundary.server";
import { workspace_voice_reservation as reservations } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { enqueueFundedVoiceTerminalOutcome } from "@/server/voice-terminal-outcome.server";
import { reconcileVoiceReservation } from "@/lib/voice-credit-recovery.server";

async function target() {
  const f = await funded();
  await sql`update public.workspace_voice_reservation set recipient_instruction_issued_at = now() where id = ${f.id}::uuid`;
  const [row] = await sql`select status_callback from public.workspace_voice_reservation where id = ${f.id}::uuid`;
  return { ...f, callback: String(row.status_callback) };
}
function completed(f: Awaited<ReturnType<typeof target>>, patch: Record<string, string> = {}) {
  return { AccountSid: accountSid, CallSid: f.child, ParentCallSid: f.parent, To: customer, From: callerId,
    Direction: "outbound-dial", CallStatus: "completed", CallDuration: "30", CallbackSource: "call-progress-events",
    Timestamp: "Sun, 1 Nov 2026 14:00:30 +0000", SequenceNumber: "3", ...patch };
}
async function clock(id: string) {
  const [row] = await sql`select terminal_status, terminal_duration, terminal_event_at, terminal_event_sequence,
    media_call_started_at, media_call_ended_at, media_call_duration_seconds
    from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid and id = ${id}::uuid`;
  return row;
}
async function copiedRoot(f: Awaited<ReturnType<typeof target>>) {
  const recordingSid = `RE${randomUUID().replaceAll("-", "")}`;
  const audioUrl = callRecordingPartStoragePath({ workspaceId, callSid: f.parent, accountSid, recordingSid });
  await sql`insert into public.workspace_voice_recording_operation
    (id, workspace, reservation_id, user_id, kind, intent_id, logical_call_sid, source_call_sid,
     source_to, source_from, source_direction, account_sid, callback_url, state, provider_sid,
     provider_status, send_started_at, terminal_at, audio_url, lease_token, lease_expires_at)
    values (${randomUUID()}::uuid, ${workspaceId}::uuid, ${f.id}::uuid, ${actor}, 'dial', ${f.id}::uuid,
      ${f.parent}, ${f.parent}, '', ${`client:${actor}`}, 'inbound', ${accountSid},
      'https://audio-connection.example.test/api/voice-recording', 'accepted', ${recordingSid},
      'completed', now(), now(), ${audioUrl}, ${randomUUID()}::uuid, now())`;
  await sql`update public.call set status = 'completed' where sid = ${f.parent}`;
  return audioUrl;
}
async function owner(f: Awaited<ReturnType<typeof target>>) {
  const row = await createTenantDb(workspaceId).workspace_voice_reservation.findFirst({ where: eq(reservations.id, f.id) });
  if (!row) throw new Error("Owned customer reservation required");
  return row;
}
function physical(f: Awaited<ReturnType<typeof target>>, patch: Partial<VoiceCustomerCallObservation> = {}): VoiceCustomerCallObservation {
  return { sid: f.child, accountSid, to: customer, from: callerId, direction: "outbound-dial", parentCallSid: f.parent,
    status: "completed", duration: "30", startTime: new Date("2026-11-01T14:00:00Z"), endTime: new Date("2026-11-01T14:00:30Z"), ...patch };
}
const fault = `customer_clock_${randomUUID().replaceAll("-", "")}`;

describe("customer recording boundary evidence", () => {
  useOwnedAudioFixture();
  afterEach(async () => {
    await sql.unsafe(`drop trigger if exists ${fault} on public.job`);
    await sql.unsafe(`drop function if exists public.${fault}()`);
  });
  it("retains the original customer's signed terminal event clock", async () => {
    const f = await target();
    expect((await signedPredictive(f.callback, completed(f))).status).toBe(200);
    expect(await clock(f.id)).toMatchObject({ terminal_status: "completed", terminal_duration: "30",
      terminal_event_at: new Date("2026-11-01T14:00:30Z"), terminal_event_sequence: 3,
      media_call_started_at: null, media_call_ended_at: null, media_call_duration_seconds: null });
  });
  it("does not use the agent root as a customer terminal clock", async () => {
    const f = await target();
    expect((await signedPredictive(f.callback, completed(f, { CallSid: f.parent }))).status).toBe(403);
    expect(await clock(f.id)).toMatchObject({ terminal_status: null, terminal_event_at: null, terminal_event_sequence: null });
  });
  it("withholds the copied root while the original customer is still live", async () => {
    const f = await target(), audioUrl = await copiedRoot(f);
    expect(await isSinglePartCallRecording(workspaceId, f.parent, audioUrl)).toBe(false);
  });
  it("permits the complete single part after the original customer's signed terminal receipt", async () => {
    const f = await target(), audioUrl = await copiedRoot(f);
    expect((await signedPredictive(f.callback, completed(f))).status).toBe(200);
    expect(await isSinglePartCallRecording(workspaceId, f.parent, audioUrl)).toBe(true);
  });
  it.each([
    ["missing", ""], ["local time", "2026-11-01T14:00:30"], ["impossible date", "2026-02-30T14:00:30Z"],
  ])("keeps %s terminal time unknown without changing the final customer outcome", async (_name, timestamp) => {
    const f = await target(), audioUrl = await copiedRoot(f);
    expect((await signedPredictive(f.callback, completed(f, { Timestamp: timestamp }))).status).toBe(200);
    expect(await clock(f.id)).toMatchObject({ terminal_status: "completed", terminal_duration: "30", terminal_event_at: null });
    expect(await isSinglePartCallRecording(workspaceId, f.parent, audioUrl)).toBe(false);
  });
  it("does not give recovery-generated params signed callback provenance", async () => {
    const f = await target();
    await enqueueFundedVoiceTerminalOutcome(workspaceId, f.child, completed(f), "recovery");
    expect(await clock(f.id)).toMatchObject({ terminal_status: "completed", terminal_duration: "30",
      terminal_event_at: null, terminal_event_sequence: null });
  });
  it("keeps the first event clock across concurrent terminal retries and one customer charge", async () => {
    const f = await target(), input = completed(f);
    expect((await signedPredictive(f.callback, input)).status).toBe(200);
    const before = await state();
    const replies = await Promise.all(Array.from({ length: 8 }, () => signedPredictive(f.callback,
      { ...input, Timestamp: "Sun, 1 Nov 2026 14:01:00 +0000", SequenceNumber: "4" })));
    expect(replies.map(reply => reply.status)).toEqual(Array(8).fill(200));
    expect(await state()).toEqual(before);
    expect(await clock(f.id)).toMatchObject({ terminal_event_at: new Date("2026-11-01T14:00:30Z"), terminal_event_sequence: 3 });
    const jobs = await sql`select id from public.job where workspace_id = ${workspaceId}::uuid and idempotency_key = ${`funded-voice-terminal:${f.child}`}`;
    expect(jobs).toHaveLength(1);
    expect(before.ledger).toBe(1);
  });
  it("fills unknown event time only from a later matching terminal receipt", async () => {
    const f = await target();
    expect((await signedPredictive(f.callback, completed(f, { Timestamp: "" }))).status).toBe(200);
    expect((await signedPredictive(f.callback, completed(f, { CallDuration: "31" }))).status).toBe(200);
    expect((await clock(f.id)).terminal_event_at).toBeNull();
    expect((await signedPredictive(f.callback, completed(f))).status).toBe(200);
    expect((await clock(f.id)).terminal_event_at).toEqual(new Date("2026-11-01T14:00:30Z"));
  });
  it("rolls back the event clock if the durable outcome job cannot be saved", async () => {
    const f = await target();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin raise exception 'owned clock outcome fault'; end $$`);
    await sql.unsafe(`create trigger ${fault} before insert on public.job for each row execute function public.${fault}()`);
    expect((await signedPredictive(f.callback, completed(f))).status).toBe(500);
    expect(await clock(f.id)).toMatchObject({ terminal_status: null, terminal_duration: null, terminal_event_at: null });
  });
  it("retains actual customer Call clocks through the pinned SDK without another outcome", async () => {
    const f = await target(), before = await state(), http = new RequestClient({ autoRetry: false });
    const request = vi.spyOn(http, "request").mockImplementation(async options => {
      expect(options.method.toUpperCase()).toBe("GET");
      expect(options.uri).toBe(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${f.child}.json`);
      return new TwilioResponse(200, JSON.stringify({ sid: f.child, account_sid: accountSid, to: customer, from: callerId,
        direction: "outbound-dial", parent_call_sid: f.parent, status: "completed", duration: "30",
        start_time: "Sun, 1 Nov 2026 14:00:00 +0000", end_time: "Sun, 1 Nov 2026 14:00:30 +0000" }), {});
    });
    const client = twilio(accountSid, "owned-sdk-token", { accountSid, httpClient: http });
    await recordVoiceCustomerCallTiming(await owner(f), await client.calls(f.child).fetch());
    expect(request).toHaveBeenCalledTimes(1);
    expect(await clock(f.id)).toMatchObject({ terminal_status: null, terminal_event_at: null,
      media_call_started_at: new Date("2026-11-01T14:00:00Z"), media_call_ended_at: new Date("2026-11-01T14:00:30Z"), media_call_duration_seconds: 30 });
    expect(await state()).toEqual(before);
  });
  it("uses actual customer timing when the original agent root ended earlier", async () => {
    const f = await target(), root = physical(f, { sid: f.parent, to: "", from: `client:${actor}`,
      direction: "inbound", parentCallSid: null, duration: "20", endTime: new Date("2026-11-01T14:00:20Z") });
    web.fetch.mockImplementation(async (id: string) => id === f.parent ? root : physical(f));
    expect(await reconcileVoiceReservation(await owner(f))).toBe("settled");
    expect(await clock(f.id)).toMatchObject({ terminal_status: "completed", terminal_duration: "30", terminal_event_at: null,
      media_call_ended_at: new Date("2026-11-01T14:00:30Z"), media_call_duration_seconds: 30 });
    const before = await state();
    expect(await reconcileVoiceReservation(await owner(f))).toBe("settled");
    expect(await state()).toEqual(before);
    expect(before.ledger).toBe(1);
  });
  it.each([
    ["account", { accountSid: `AC${"e".repeat(32)}` }], ["SID", { sid: sid() }],
    ["parent", { parentCallSid: sid() }], ["recipient", { to: "+16135550999" }],
    ["caller", { from: "+16135550998" }], ["direction", { direction: "outbound-api" }],
  ])("rejects a different provider %s before recording Call timing", async (_name, patch) => {
    const f = await target(), before = await state();
    await expect(recordVoiceCustomerCallTiming(await owner(f), physical(f, patch))).rejects.toThrow("funded owner");
    expect(await clock(f.id)).toMatchObject({ media_call_started_at: null, media_call_ended_at: null });
    expect(await state()).toEqual(before);
  });
  it.each([
    ["missing start", { startTime: null }], ["missing end", { endTime: null }],
    ["invalid start", { startTime: new Date(NaN) }], ["reversed time", { endTime: new Date("2026-11-01T13:59:59Z") }],
    ["active customer", { status: "in-progress" }], ["unknown seconds", { duration: null }],
  ])("keeps %s unresolved instead of using local time", async (_name, patch) => {
    const f = await target();
    expect(await recordVoiceCustomerCallTiming(await owner(f), physical(f, patch))).toBeNull();
    expect(await clock(f.id)).toMatchObject({ media_call_started_at: null, media_call_ended_at: null, media_call_duration_seconds: null });
  });
  it("keeps first actual Call timing immutable and rejects a conflicting read", async () => {
    const f = await target(), observation = physical(f);
    const first = await recordVoiceCustomerCallTiming(await owner(f), observation);
    expect(await recordVoiceCustomerCallTiming(await owner(f), observation)).toEqual(first);
    await expect(recordVoiceCustomerCallTiming(await owner(f), physical(f, { endTime: new Date("2026-11-01T14:00:31Z") })))
      .rejects.toThrow("saved receipt");
    expect((await clock(f.id)).media_call_ended_at).toEqual(new Date("2026-11-01T14:00:30Z"));
  });
  it("retains conflicting provider timing without changing billing or granting a manifest", async () => {
    const f = await target(), audioUrl = await copiedRoot(f);
    expect((await signedPredictive(f.callback, completed(f))).status).toBe(200);
    const before = await state();
    await recordVoiceCustomerCallTiming(await owner(f), physical(f, { duration: "31" }));
    expect((await clock(f.id)).terminal_duration).toBe("30");
    expect((await clock(f.id)).media_call_duration_seconds).toBe(31);
    expect(await readVoiceCallRecordingManifest(workspaceId, f.parent, audioUrl))
      .toEqual({ state: "pending", reason: "customer_boundary_unproven" });
    expect(await state()).toEqual(before);
  });
});
