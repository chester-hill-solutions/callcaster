import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { describe, expect, it } from "vitest";
import {
  accountSid, callerId, funded, journal, phone, otherPhone, prepare, claim, sid, signedAudio, sql,
  useOwnedAudioFixture, workspaceId, issued, joined, fault,
} from "../helpers/voice-audio-fixture";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import { findVoiceRecordingOperation } from "@/server/voice-recording-operation.server";
import { observeVoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";

const cf = () => `CF${randomUUID().replaceAll("-", "")}`;
const re = () => `RE${randomUUID().replaceAll("-", "")}`;
async function captured() {
  const target = await funded(), connection = await issued(target.args);
  const [saved] = await sql`select id from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
  const operation = saved ? await findVoiceRecordingOperation(saved.id) : null;
  if (!operation) throw new Error("Owned Conference instruction required");
  return { target, connection, operation };
}
async function recordingCallback(url: string, params: Record<string, string>, validSignature = true) {
  const { action } = await import("../../app/routes/api+/voice-recording.action.server");
  return asRouteResponse(action(routeArgs(new Request(url, { method: "POST", headers: {
    "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": validSignature ?
      twilio.getExpectedTwilioSignature("owned-audio-token", url, params) : "invalid",
  }, body: new URLSearchParams(params) }))));
}
function params(conferenceSid = cf(), overrides: Record<string, string> = {}) {
  return { AccountSid: accountSid, ConferenceSid: conferenceSid, RecordingSid: re(), RecordingSource: "Conference",
    RecordingStatus: "in-progress", RecordingStartTime: new Date().toUTCString(), ...overrides };
}

describe("owned handoff Conference recording", () => {
  useOwnedAudioFixture();
  it("arms the Conference recording in the signed replacement join instruction", async () => {
    const target = await funded();
    const accepted = await journal.recordVoiceAudioProvider(await claim(await prepare(target.args)), sid());
    const response = await signedAudio(accepted.voice_url, { AccountSid: accountSid, CallSid: accepted.provider_sid ?? "",
      To: phone, From: callerId, Direction: "outbound-api", Digits: "1" });
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toContain('record="record-from-start"');
    expect(xml).toContain('recordingStatusCallbackEvent="in-progress completed absent"');
    expect(xml).toContain('muted="true"');
    const rows = await sql`select * from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "conference", intent_id: accepted.id, logical_call_sid: target.parent,
      source_call_sid: accepted.provider_sid, state: "creating" });
    expect(xml).toContain(`recording=${rows[0].id}`);
    expect(rows[0]).toMatchObject({ source_conference_name: accepted.conference_id, source_conference_sid: null });
    expect(xml).not.toContain("recordingChannels=");
    expect(xml).toContain('trim="do-not-trim"');
  });

  it("does not record an idle phone connection or the confirmation prompt", async () => {
    const accepted = await journal.recordVoiceAudioProvider(await claim(await prepare()), sid());
    const input = { AccountSid: accountSid, CallSid: accepted.provider_sid ?? "", To: phone, From: callerId, Direction: "outbound-api" };
    const prompt = await signedAudio(accepted.voice_url, input);
    expect(await prompt.text()).toContain("<Gather");
    const connected = await signedAudio(accepted.voice_url, { ...input, Digits: "1" });
    expect(await connected.text()).not.toContain("recordingStatusCallback");
    expect(await sql`select id from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`).toHaveLength(0);
  });

  it("replays the same nonce under concurrent join instructions", async () => {
    const { connection, operation } = await captured();
    const replies = await Promise.all(Array.from({ length: 12 }, () => signedAudio(connection.voice_url, {
      AccountSid: accountSid, CallSid: connection.provider_sid ?? "", To: phone, From: callerId, Direction: "outbound-api", Digits: "1",
    })));
    for (const reply of replies) { expect(reply.status).toBe(200); expect(await reply.text()).toContain(`recording=${operation.id}`); }
    expect(await sql`select id from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`).toHaveLength(1);
  });

  it("accepts the signed recording before the participant join without switching audio", async () => {
    const { connection, operation } = await captured(), receipt = params();
    expect((await recordingCallback(operation.callback_url, receipt)).status).toBe(204);
    const saved = await findVoiceRecordingOperation(operation.id);
    expect(saved).toMatchObject({ provider_sid: receipt.RecordingSid, provider_status: "in-progress", source_conference_sid: receipt.ConferenceSid });
    expect(saved?.recording_started_at).toBeInstanceOf(Date);
    const joinedConnection = await observeVoiceAudioConferenceEvent(joined(connection, { conferenceSid: receipt.ConferenceSid }));
    expect(joinedConnection).toMatchObject({ state: "ready", conference_sid: receipt.ConferenceSid, committed_at: null, promotion_requested_at: null });
  });

  it("rejects a participant join that differs from an earlier recording receipt", async () => {
    const { connection, operation } = await captured();
    expect((await recordingCallback(operation.callback_url, params())).status).toBe(204);
    await expect(observeVoiceAudioConferenceEvent(joined(connection))).rejects.toThrow("joined bridge");
    expect(await journal.findVoiceAudioConnection(connection.id)).toMatchObject({ state: "joining", joined_at: null, conference_sid: null });
  });

  it("binds the Conference from the genuine join before a recording callback", async () => {
    const { connection, operation } = await captured(), room = cf();
    await observeVoiceAudioConferenceEvent(joined(connection, { conferenceSid: room }));
    const receipt = params(room);
    expect((await recordingCallback(operation.callback_url, receipt)).status).toBe(204);
    expect((await recordingCallback(operation.callback_url, { ...receipt, ConferenceSid: cf() })).status).toBe(403);
    expect(await findVoiceRecordingOperation(operation.id)).toMatchObject({ source_conference_sid: room });
  });

  it.each([
    ["invalid signature", {}, false],
    ["foreign account", { AccountSid: `AC${"e".repeat(32)}` }, true],
    ["Call source", { CallSid: `CA${"c".repeat(32)}` }, true],
    ["wrong source", { RecordingSource: "DialVerb" }, true],
    ["conflicting alias", { conference_sid: `CF${"d".repeat(32)}` }, true],
    ["invalid room SID", { ConferenceSid: "bad" }, true],
  ])("rejects %s without changing the saved capture", async (_name, patch, valid) => {
    const { operation } = await captured();
    expect((await recordingCallback(operation.callback_url, params(cf(), patch), valid)).status).toBe(403);
    expect(await findVoiceRecordingOperation(operation.id)).toEqual(operation);
  });

  it("keeps terminal parts immutable and queues completed media under the logical call", async () => {
    const { operation } = await captured(), receipt = params(cf(), { RecordingStatus: "completed", RecordingDuration: "31", RecordingChannels: "1" });
    expect((await recordingCallback(operation.callback_url, receipt)).status).toBe(204);
    const completed = await findVoiceRecordingOperation(operation.id);
    expect(completed).toMatchObject({ provider_status: "completed", channels: 1, recording_duration_seconds: 31 });
    expect(completed?.terminal_at).toBeInstanceOf(Date);
    expect((await recordingCallback(operation.callback_url, { ...receipt, RecordingStatus: "in-progress" })).status).toBe(204);
    expect(await findVoiceRecordingOperation(operation.id)).toEqual(completed);
    const jobs = await sql`select params from public.job where workspace_id = ${workspaceId}::uuid and type = 'recording_side_effects'`;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].params).toMatchObject({ recordingOperationId: operation.id });
  });

  it("does not issue another recording when a terminal capture's voice instruction replays", async () => {
    const { operation, connection } = await captured();
    expect((await recordingCallback(operation.callback_url, params(cf(), { RecordingStatus: "absent" }))).status).toBe(204);
    const response = await signedAudio(connection.voice_url, { AccountSid: accountSid, CallSid: connection.provider_sid ?? "",
      To: phone, From: callerId, Direction: "outbound-api", Digits: "1" });
    expect(response.status).toBe(200);
    const xml = await response.text(); expect(xml).toContain("<Conference"); expect(xml).not.toContain('record="');
    expect(await sql`select id from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`).toHaveLength(1);
  });

  it("allows a fresh room after an unpromoted replacement fails, preserving its uncertain recording", async () => {
    const { operation, connection, target } = await captured();
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    await observeVoiceAudioStatus(connection, "completed");
    const next = await issued({ ...target.args, intentId: randomUUID() });
    expect(next.conference_id).not.toBe(connection.conference_id);
    const rows = await sql`select * from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    expect(rows).toHaveLength(2);
    expect(await findVoiceRecordingOperation(operation.id)).toEqual(operation);
    expect(rows.find(row => row.intent_id === next.id)).toMatchObject({ kind: "conference", source_conference_name: next.conference_id,
      logical_call_sid: target.parent, source_call_sid: next.provider_sid, state: "creating" });
  });

  it("owns a fresh capture after a terminal part in the same canonical room", async () => {
    const { operation, connection, target } = await captured(), room = cf();
    await observeVoiceAudioConferenceEvent(joined(connection, { conferenceSid: room }));
    expect((await recordingCallback(operation.callback_url, params(room, { RecordingStatus: "absent" }))).status).toBe(204);
    await sql`update public.workspace_voice_audio_connection set promotion_requested_at = now(), promotion_result = 'ready',
      parent_joined_at = now(), customer_joined_at = now(), terminal_at = now(), state = 'failed' where id = ${connection.id}::uuid`;
    const next = await issued({ ...target.args, intentId: randomUUID() });
    expect(next.conference_id).toBe(connection.conference_id);
    expect(next.conference_sid).toBe(room);
    const rows = await sql`select * from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.id === operation.id)).toMatchObject({ provider_status: "absent" });
    expect(rows.find(row => row.intent_id === next.id)).toMatchObject({ state: "creating", source_conference_sid: room });
  });

  it("a sharing audio leg cannot borrow a successor's recording on replay", async () => {
    const { operation, connection, target } = await captured(), room = cf();
    await observeVoiceAudioConferenceEvent(joined(connection, { conferenceSid: room }));
    const receipt = params(room);
    expect((await recordingCallback(operation.callback_url, receipt)).status).toBe(204);
    await sql`update public.workspace_voice_audio_connection set promotion_requested_at = now(), promotion_result = 'ready',
      parent_joined_at = now(), customer_joined_at = now(), terminal_at = now(), state = 'failed' where id = ${connection.id}::uuid`;
    const sharing = await issued({ ...target.args, intentId: randomUUID() });
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now(), joined_at = now()
      where id = ${sharing.id}::uuid`;
    expect((await recordingCallback(operation.callback_url, { ...receipt, RecordingStatus: "absent" })).status).toBe(204);
    const successor = await issued({ ...target.args, intentId: randomUUID(), phoneNumber: otherPhone, expectedAgentSid: sharing.provider_sid ?? "" });
    const replay = await signedAudio(sharing.voice_url, { AccountSid: accountSid, CallSid: sharing.provider_sid ?? "",
      To: phone, From: callerId, Direction: "outbound-api", Digits: "1" });
    expect(replay.status).toBe(200);
    expect(await replay.text()).not.toContain('record="');
    expect(await journal.findVoiceAudioConnection(sharing.id)).toMatchObject({ recording_operation_id: operation.id });
    expect((await journal.findVoiceAudioConnection(successor.id))?.recording_operation_id).not.toBe(operation.id);
  });

  it("a missing saved capture cannot fall back to another recording in the room", async () => {
    const { operation, connection } = await captured();
    await sql`update public.workspace_voice_audio_connection set recording_operation_id = ${randomUUID()}::uuid where id = ${connection.id}::uuid`;
    const response = await signedAudio(connection.voice_url, { AccountSid: accountSid, CallSid: connection.provider_sid ?? "",
      To: phone, From: callerId, Direction: "outbound-api", Digits: "1" });
    expect(response.status).toBe(403);
    expect(await findVoiceRecordingOperation(operation.id)).toEqual(operation);
    expect(await journal.findVoiceAudioConnection(connection.id)).toMatchObject({ state: "joining", committed_at: null });
  });

  it("rolls back the recording nonce when the join instruction cannot commit", async () => {
    const target = await funded(), accepted = await journal.recordVoiceAudioProvider(await claim(await prepare(target.args)), sid());
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin
      if NEW.voice_issued_at is not null then raise exception 'Owned join save fault'; end if; return NEW; end $$`);
    await sql.unsafe(`create trigger ${fault} before update on public.workspace_voice_audio_connection for each row execute function public.${fault}()`);
    const response = await signedAudio(accepted.voice_url, { AccountSid: accountSid, CallSid: accepted.provider_sid ?? "",
      To: phone, From: callerId, Direction: "outbound-api", Digits: "1" });
    expect(response.status).toBe(500);
    expect(await sql`select id from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`).toHaveLength(0);
    expect(await journal.findVoiceAudioConnection(accepted.id)).toMatchObject({ voice_issued_at: null, state: "joining" });
  });
});
