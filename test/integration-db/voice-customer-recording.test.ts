import { accountSid, callerId, clearFault, customer, fault, phone, sid, sql, state, useOwnedAudioFixture, web, workspaceId } from "../helpers/voice-audio-fixture";
import { customerAttempt, customerUrls, fundCustomerAttempt, signedCustomerRecording } from "../helpers/voice-audio-customer-fixture";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { dispatchPhoneCustomerVoiceCall } from "@/lib/phone-customer-dispatch.server";
import { recordVoiceReservationProvider, startVoiceReservation } from "@/server/voice-credit-reservation.server";
import { findVoiceRecordingOperation } from "@/server/voice-recording-operation.server";
import { enqueueFundedVoiceTerminalOutcome } from "@/server/voice-terminal-outcome.server";
import { recordVoiceCustomerCallTiming } from "@/server/voice-customer-media-boundary.server";
import { runVoiceRecordingCopy } from "@/lib/voice-recording-copy.server";
import type { CallListInstanceCreateOptions } from "twilio/lib/rest/api/v2010/account/call";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";

const storage = vi.hoisted(() => ({ copy: vi.fn<typeof import("@/lib/call-recording-storage.server").persistCallRecordingToStorage>() }));
const boundaryFault = `recording_boundary_${randomUUID().replaceAll("-", "")}`;
vi.mock("@/lib/call-recording-storage.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/call-recording-storage.server")>(), persistCallRecordingToStorage: storage.copy,
}));

async function armed() {
  const f = await customerAttempt(), urls = customerUrls();
  const reservation = await startVoiceReservation(await fundCustomerAttempt(f.args), urls, f.args.audioSource?.proof);
  const customerSid = sid(), recordingSid = `RE${randomUUID().replaceAll("-", "")}`;
  const physical = { ...f.call, sid: customerSid, to: customer, from: callerId, voiceUrl: urls.voiceUrl, statusCallback: urls.statusCallback };
  web.records.set(customerSid, physical);
  web.fetch.mockClear();
  return { ...f, urls, reservation, customerSid, recordingSid, physical };
}

function params(f: { customerSid: string; recordingSid: string }, status = "in-progress"): Record<string, string> {
  return { AccountSid: accountSid, CallSid: f.customerSid, RecordingSid: f.recordingSid,
    RecordingSource: "OutboundAPI", RecordingStatus: status, RecordingChannels: "2",
    RecordingStartTime: new Date().toUTCString(), ...(status === "completed" ? { RecordingDuration: "42" } : {}) };
}

function terminal(f: { customerSid: string }): Record<string, string> {
  return { AccountSid: accountSid, CallSid: f.customerSid, To: customer, From: callerId, Direction: "outbound-api",
    CallStatus: "completed", CallDuration: "42", Timestamp: "Sun, 1 Nov 2026 14:00:42 +0000",
    CallbackSource: "call-progress-events", SequenceNumber: "3" };
}

async function runBoundaryJob(partId: string) {
  const [row] = await sql`select id, type, params, max_attempts from public.job where workspace_id = ${workspaceId}::uuid
    and idempotency_key = ${`voice_recording_boundary:${partId}`}`;
  if (!row) throw new Error("Durable recording boundary job required");
  const job: ClaimedJobRow = { id: Number(row.id), type: row.type, params: row.params, workspace_id: workspaceId,
    user_id: null, attempt_count: 1, max_attempts: row.max_attempts };
  const { jobHandlers } = await import("@/lib/worker/handlers.server");
  return jobHandlers.recording_side_effects(job);
}

async function clearBoundaryFault() {
  await sql.unsafe(`drop trigger if exists ${boundaryFault} on public.job`);
  await sql.unsafe(`drop function if exists public.${boundaryFault}()`);
}

async function dispatch(f: Awaited<ReturnType<typeof customerAttempt>>) {
  if (!f.args.audioSource) throw new Error("Confirmed phone source required");
  const { voiceUrl, statusCallback } = customerUrls();
  return dispatchPhoneCustomerVoiceCall({ ...f.args, audioSource: f.args.audioSource, voiceUrl, statusCallback,
    client: await createWorkspaceTwilioInstance({ workspace_id: workspaceId }) });
}

describe("recorded customer Start through an existing phone", () => {
  useOwnedAudioFixture();
  afterEach(clearBoundaryFault);
  beforeEach(() => {
    storage.copy.mockReset().mockImplementation(async args => ({ ok: true, skipped: false,
      audioUrl: `call-recordings/${args.workspaceId}/recording-${args.callSid}-${args.recordingSid}.mp3` }));
  });

  test("one customer POST requests both untrimmed channels and retains its callback before acceptance", async () => {
    const f = await customerAttempt(), result = await dispatch(f);
    expect(result.ok).toBe(true); if (!result.ok) throw new Error("Customer dispatch required");
    expect(web.create).toHaveBeenCalledTimes(1);
    const options: CallListInstanceCreateOptions = web.create.mock.calls[0][0];
    expect(options).toMatchObject({ to: customer, from: callerId, method: "POST", record: true,
      recordingChannels: "dual", recordingTrack: "both", trim: "do-not-trim", recordingStatusCallbackMethod: "POST",
      recordingStatusCallbackEvent: ["in-progress", "completed", "absent"] });
    expect(options.to).not.toBe(phone);
    const [reservation] = await sql`select * from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(reservation).toMatchObject({ provider_sid: result.callSid, setup_sid: null, state: "active" });
    expect(options.recordingStatusCallback?.split("#")[0]).toBe(reservation.customer_recording_callback);
    const part = await findVoiceRecordingOperation(reservation.customer_recording_id);
    expect(part).toMatchObject({ kind: "customer", logical_call_sid: result.callSid, source_call_sid: result.callSid,
      source_parent_sid: null, source_direction: "outbound-api", source_to: customer, source_from: callerId,
      callback_url: reservation.customer_recording_callback, provider_sid: null, state: "creating" });
    expect(await state()).toMatchObject({ credits: 100, reservations: 1, ledger: 0 });
  });

  test("an early signed receipt preserves one accepted customer after a lost create reply", async () => {
    const f = await customerAttempt(), customerSid = sid(), recordingSid = `RE${randomUUID().replaceAll("-", "")}`;
    web.fetch.mockClear();
    web.create.mockImplementationOnce(async (options: CallListInstanceCreateOptions) => {
      if (!options.recordingStatusCallback) throw new Error("Saved recording callback required");
      web.records.set(customerSid, { ...f.call, sid: customerSid, to: customer, from: callerId, voiceUrl: options.url ?? "", statusCallback: options.statusCallback ?? "" });
      expect((await signedCustomerRecording(options.recordingStatusCallback.split("#")[0], params({ customerSid, recordingSid }))).status).toBe(204);
      throw new Error("Lost accepted customer create response");
    });
    expect(await dispatch(f)).toMatchObject({ ok: true, callSid: customerSid, replayed: true });
    expect(await dispatch(f)).toMatchObject({ ok: true, callSid: customerSid, replayed: true });
    expect(web.create).toHaveBeenCalledTimes(1); expect(web.fetch).toHaveBeenCalledTimes(1);
    const [saved] = await sql`select customer_recording_id from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(await findVoiceRecordingOperation(saved.customer_recording_id)).toMatchObject({ kind: "customer", state: "accepted",
      logical_call_sid: customerSid, source_call_sid: customerSid, provider_sid: recordingSid, provider_status: "in-progress" });
    expect(await state()).toMatchObject({ reservations: 1, ledger: 0, credits: 100 });
  });

  test.each(["signature", "source", "account", "nonce"])("rejects an early wrong %s before provider reads or local acceptance", async kind => {
    const f = await armed(), body = params(f); let url = f.urls.customerRecording.callbackUrl;
    if (kind === "source") body.RecordingSource = "StartCallRecordingAPI";
    if (kind === "account") body.AccountSid = `AC${"9".repeat(32)}`;
    if (kind === "nonce") url = url.replace(f.urls.customerRecording.id, randomUUID());
    expect((await signedCustomerRecording(url, body, kind !== "signature")).status).toBe(403);
    expect(web.fetch).not.toHaveBeenCalled(); expect(await findVoiceRecordingOperation(f.urls.customerRecording.id)).toBeNull();
    const [saved] = await sql`select provider_sid, state from public.workspace_voice_reservation where id = ${f.reservation.id}::uuid`;
    expect(saved).toEqual({ provider_sid: null, state: "creating" });
  });

  test.each(["sid", "to", "from", "accountSid", "direction", "parentCallSid"])("a signed receipt cannot bind a root with changed %s", async field => {
    const f = await armed();
    Object.assign(f.physical, { [field]: field === "parentCallSid" ? f.call.sid : field === "sid" ? sid() : "unowned" });
    expect((await signedCustomerRecording(f.urls.customerRecording.callbackUrl, params(f))).status).toBe(403);
    const [saved] = await sql`select provider_sid from public.workspace_voice_reservation where id = ${f.reservation.id}::uuid`;
    expect(saved.provider_sid).toBeNull(); expect(await findVoiceRecordingOperation(f.urls.customerRecording.id)).toBeNull();
  });

  test("the recording nonce exists only after the customer send checkpoint", async () => {
    const f = await customerAttempt(), reservation = await fundCustomerAttempt(f.args), urls = customerUrls();
    web.fetch.mockClear();
    const customerSid = sid(), recordingSid = `RE${randomUUID().replaceAll("-", "")}`;
    expect((await signedCustomerRecording(urls.customerRecording.callbackUrl, params({ customerSid, recordingSid }))).status).toBe(403);
    expect(web.fetch).not.toHaveBeenCalled();
    expect(reservation.customer_recording_id).toBeNull(); expect(reservation.send_started_at).toBeNull();
  });

  test("local part registration failure retains customer acceptance and repairs on intent replay", async () => {
    const f = await customerAttempt();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin raise exception 'Owned customer part fault'; end $$`);
    await sql.unsafe(`create trigger ${fault} before insert on public.workspace_voice_recording_operation for each row execute function public.${fault}()`);
    const result = await dispatch(f); expect(result.ok).toBe(true); if (!result.ok) throw new Error("Accepted customer required");
    const [saved] = await sql`select provider_sid, customer_recording_id from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(saved.provider_sid).toBe(result.callSid); expect(await findVoiceRecordingOperation(saved.customer_recording_id)).toBeNull();
    await clearFault();
    expect(await dispatch(f)).toMatchObject({ ok: true, callSid: result.callSid, replayed: true });
    expect(await findVoiceRecordingOperation(saved.customer_recording_id)).toMatchObject({ source_call_sid: result.callSid, state: "creating" });
    expect(web.create).toHaveBeenCalledTimes(1);
  });

  test.each([
    { enabled: false, completed: false }, { enabled: true, completed: false },
    { enabled: false, completed: true }, { enabled: true, completed: true },
  ])("completed customer playback remains idempotent (batch=$enabled, customer ended=$completed)", async ({ enabled, completed }) => {
    const f = await armed(); await recordVoiceReservationProvider(f.reservation, f.customerSid);
    if (completed) await enqueueFundedVoiceTerminalOutcome(workspaceId, f.customerSid, terminal(f));
    await sql`update public.workspace set feature_flags = ${sql.json({ batchTranscription: enabled })} where id = ${workspaceId}::uuid`;
    expect((await signedCustomerRecording(f.urls.customerRecording.callbackUrl, params(f, "completed"))).status).toBe(204);
    const part = await findVoiceRecordingOperation(f.urls.customerRecording.id); if (!part) throw new Error("Owned customer part required");
    expect(await runVoiceRecordingCopy(workspaceId, part.id, part.lease_token)).toEqual({ copied: true });
    expect(await runVoiceRecordingCopy(workspaceId, part.id, part.lease_token)).toEqual({ copied: false });
    expect((await signedCustomerRecording(f.urls.customerRecording.callbackUrl, params(f, "completed"))).status).toBe(204);
    const [playback] = await sql`select recording_sid, audio_url from public.call where sid = ${f.customerSid}`;
    expect(playback).toEqual({ recording_sid: f.recordingSid, audio_url: `call-recordings/${workspaceId}/recording-${f.customerSid}-${f.recordingSid}.mp3` });
    const jobs = await sql`select params from public.job where workspace_id = ${workspaceId}::uuid and type = 'elevenlabs_batch_transcribe'`;
    expect(jobs).toEqual(enabled && completed ? [{ params: { callSid: f.customerSid } }] : []);
    expect(storage.copy).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ ledger: 0, reservations: 1 });
  });

  test.each(["first callback", "late callback", "recovery"])("a copied recording retains batch work after %s timing", async source => {
    const f = await armed(), owner = await recordVoiceReservationProvider(f.reservation, f.customerSid);
    await sql`update public.workspace set feature_flags = ${sql.json({ batchTranscription: true })} where id = ${workspaceId}::uuid`;
    if (source !== "first callback") await enqueueFundedVoiceTerminalOutcome(workspaceId, f.customerSid, { ...terminal(f), Timestamp: "" });
    expect((await signedCustomerRecording(f.urls.customerRecording.callbackUrl, params(f, "completed"))).status).toBe(204);
    const part = await findVoiceRecordingOperation(f.urls.customerRecording.id); if (!part) throw new Error("Owned customer part required");
    expect(await runVoiceRecordingCopy(workspaceId, part.id, part.lease_token)).toEqual({ copied: true });
    expect(await sql`select id from public.job where workspace_id = ${workspaceId}::uuid and type = 'elevenlabs_batch_transcribe'`).toHaveLength(0);
    const retainBoundary = () => source === "recovery"
      ? recordVoiceCustomerCallTiming(owner, { sid: f.customerSid, accountSid, to: customer, from: callerId,
        direction: "outbound-api", parentCallSid: null, status: "completed", duration: "42",
        startTime: new Date("2026-11-01T14:00:00Z"), endTime: new Date("2026-11-01T14:00:42Z") })
      : enqueueFundedVoiceTerminalOutcome(workspaceId, f.customerSid, terminal(f));
    await retainBoundary(); await retainBoundary();
    const wakeups = await sql`select params from public.job where workspace_id = ${workspaceId}::uuid
      and idempotency_key = ${`voice_recording_boundary:${part.id}`}`;
    expect(wakeups).toEqual([{ params: { recordingOperationId: part.id, leaseToken: part.lease_token } }]);
    expect(await runBoundaryJob(part.id)).toEqual({ copied: false });
    expect(await runBoundaryJob(part.id)).toEqual({ copied: false });
    expect(await sql`select params from public.job where workspace_id = ${workspaceId}::uuid and type = 'elevenlabs_batch_transcribe'`)
      .toEqual([{ params: { callSid: f.customerSid } }]);
    expect(storage.copy).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ ledger: 0, reservations: 1 });
  });

  test.each(["recording_side_effects", "elevenlabs_batch_transcribe"])("retains copied media through a failed %s enqueue", async type => {
    const f = await armed(); await recordVoiceReservationProvider(f.reservation, f.customerSid);
    await sql`update public.workspace set feature_flags = ${sql.json({ batchTranscription: true })} where id = ${workspaceId}::uuid`;
    expect((await signedCustomerRecording(f.urls.customerRecording.callbackUrl, params(f, "completed"))).status).toBe(204);
    const part = await findVoiceRecordingOperation(f.urls.customerRecording.id); if (!part) throw new Error("Owned customer part required");
    expect(await runVoiceRecordingCopy(workspaceId, part.id, part.lease_token)).toEqual({ copied: true });
    await sql.unsafe(`create function public.${boundaryFault}() returns trigger language plpgsql as $$ begin
      if new.type = '${type}' then raise exception 'Owned boundary enqueue fault'; end if; return new; end $$`);
    await sql.unsafe(`create trigger ${boundaryFault} before insert on public.job for each row execute function public.${boundaryFault}()`);
    if (type === "recording_side_effects") {
      await expect(enqueueFundedVoiceTerminalOutcome(workspaceId, f.customerSid, terminal(f))).rejects.toThrow();
      const [saved] = await sql`select terminal_status, terminal_event_at from public.workspace_voice_reservation where id = ${f.reservation.id}::uuid`;
      expect(saved).toEqual({ terminal_status: null, terminal_event_at: null });
    } else {
      await enqueueFundedVoiceTerminalOutcome(workspaceId, f.customerSid, terminal(f));
      await expect(runBoundaryJob(part.id)).rejects.toThrow();
    }
    await clearBoundaryFault();
    await enqueueFundedVoiceTerminalOutcome(workspaceId, f.customerSid, terminal(f));
    expect(await runBoundaryJob(part.id)).toEqual({ copied: false });
    expect(await runBoundaryJob(part.id)).toEqual({ copied: false });
    expect(await sql`select params from public.job where workspace_id = ${workspaceId}::uuid and type = 'elevenlabs_batch_transcribe'`)
      .toEqual([{ params: { callSid: f.customerSid } }]);
    expect(storage.copy).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ ledger: 0, reservations: 1 });
  });
});
