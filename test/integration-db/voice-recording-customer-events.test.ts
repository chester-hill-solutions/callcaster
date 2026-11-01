import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { accountSid, bridgeParams, endedReplacementFixture, journal, otherActor, sid, signedAudio, sql, state, useOwnedAudioFixture, workspaceId } from "../helpers/voice-audio-fixture";
import { findVoiceRecordingOperation } from "@/server/voice-recording-operation.server";
import { recordVoiceRecordingReceipt } from "@/server/voice-recording-receipt.server";
import { readVoiceConferenceRecordingSlices } from "@/server/voice-recording-customer-events.server";

type Fixture = Awaited<ReturnType<typeof endedReplacementFixture>>;
function event(f: Fixture, joined: boolean, sequence: string, timestamp: string) {
  return { ...bridgeParams(f, "customer", joined), SequenceNumber: sequence, Timestamp: timestamp,
    ...(joined ? {} : { ReasonParticipantLeft: "participant_updated_via_api" }) };
}
const time = (seconds: number) => new Date(Date.UTC(2026, 10, 1, 14, 0, seconds)).toUTCString();
async function completed(f: Fixture) {
  const current = await journal.findVoiceAudioConnection(f.row.id);
  const operation = current?.recording_operation_id ? await findVoiceRecordingOperation(current.recording_operation_id) : null;
  if (!operation) throw new Error("Owned Conference recording required");
  return recordVoiceRecordingReceipt(operation, { requestUrl: operation.callback_url, accountSid,
    conferenceSid: f.conferenceSid, recordingSid: `RE${randomUUID().replaceAll("-", "")}`, source: "Conference",
    status: "completed", startedAt: new Date("2026-11-01T14:00:00Z"), durationSeconds: 60, channels: 1 });
}
const history = () => sql`select * from public.workspace_voice_recording_customer_event where workspace = ${workspaceId}::uuid order by sequence_number`;
const fault = `customer_membership_${randomUUID().replaceAll("-", "")}`;

describe("owned customer recording membership", () => {
  useOwnedAudioFixture();
  afterEach(async () => {
    await sql.unsafe(`drop trigger if exists ${fault} on public.workspace_voice_recording_customer_event`);
    await sql.unsafe(`drop function if exists public.${fault}()`);
    await sql`delete from public.workspace_voice_recording_customer_event where workspace = ${workspaceId}::uuid`;
  });

  it("retains provider join and leave times when the leave arrives first", async () => {
    const f = await endedReplacementFixture(), before = await state();
    const join = { ...bridgeParams(f, "customer", true), SequenceNumber: "7", Timestamp: "Sun, 1 Nov 2026 14:00:00 +0000" };
    const leave = { ...bridgeParams(f, "customer", false), ReasonParticipantLeft: "participant_updated_via_api",
      SequenceNumber: "12", Timestamp: "Sun, 1 Nov 2026 14:00:30 +0000" };
    expect((await signedAudio(f.row.conference_callback, leave)).status).toBe(204);
    expect((await signedAudio(f.row.conference_callback, join)).status).toBe(204);
    const rows = await sql`select * from public.workspace_voice_recording_customer_event
      where workspace = ${workspaceId}::uuid order by sequence_number`;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ logical_call_sid: f.target.parent, customer_call_sid: f.target.child,
      account_sid: accountSid, conference_sid: f.conferenceSid, sequence_number: 7, occurred_at: new Date("2026-11-01T14:00:00Z") });
    expect(rows[1]).toMatchObject({ sequence_number: 12, occurred_at: new Date("2026-11-01T14:00:30Z") });
    expect(await state()).toEqual(before);
  });

  it("crops out waiting audio and gaps between customer visits in provider order", async () => {
    const f = await endedReplacementFixture(), recording = await completed(f);
    for (const [joined, sequence, seconds] of [[false, 8, 25], [true, 9, 30], [false, 10, 50], [true, 7, 10]] as const)
      expect((await signedAudio(f.row.conference_callback, event(f, joined, String(sequence), time(seconds)))).status).toBe(204);
    expect(await readVoiceConferenceRecordingSlices(recording)).toEqual({ state: "provisional",
      slices: [{ startMs: 10_000, endMs: 25_000 }, { startMs: 30_000, endMs: 50_000 }] });
  });

  it("keeps offsets pending until delayed leave and rejoin events close the sequence gaps", async () => {
    const f = await endedReplacementFixture(), recording = await completed(f);
    expect((await signedAudio(f.row.conference_callback, event(f, true, "7", time(10)))).status).toBe(204);
    expect((await signedAudio(f.row.conference_callback, event(f, false, "10", time(50)))).status).toBe(204);
    expect(await readVoiceConferenceRecordingSlices(recording)).toEqual({ state: "pending", reason: "membership_sequence_gap" });
    expect((await signedAudio(f.row.conference_callback, event(f, false, "8", time(25)))).status).toBe(204);
    expect((await signedAudio(f.row.conference_callback, event(f, true, "9", time(30)))).status).toBe(204);
    expect(await readVoiceConferenceRecordingSlices(recording)).toEqual({ state: "provisional",
      slices: [{ startMs: 10_000, endMs: 25_000 }, { startMs: 30_000, endMs: 50_000 }] });
  });

  it("retains neutral parent and room events as sequence witnesses without inventing a customer visit", async () => {
    const f = await endedReplacementFixture(), recording = await completed(f);
    expect((await signedAudio(f.row.conference_callback, event(f, true, "7", time(10)))).status).toBe(204);
    const parent = { ...event(f, true, "8", time(15)), CallSid: f.target.parent };
    expect((await signedAudio(f.row.conference_callback, parent)).status).toBe(204);
    const room: Record<string, string> = { ...event(f, true, "9", time(20)), StatusCallbackEvent: "conference-start" };
    delete room.CallSid;
    expect((await signedAudio(f.row.conference_callback, room)).status).toBe(204);
    expect((await signedAudio(f.row.conference_callback, event(f, false, "10", time(30)))).status).toBe(204);
    expect(await history()).toHaveLength(4);
    expect(await readVoiceConferenceRecordingSlices(recording)).toEqual({ state: "provisional", slices: [{ startMs: 10_000, endMs: 30_000 }] });
  });

  it("retains one immutable event under concurrent callback retries", async () => {
    const f = await endedReplacementFixture(), input = event(f, true, "7", time(10));
    expect((await signedAudio(f.row.conference_callback, input)).status).toBe(204);
    const saved = await history();
    const replies = await Promise.all(Array.from({ length: 12 }, () => signedAudio(f.row.conference_callback, input)));
    expect(replies.map(reply => reply.status)).toEqual(Array(12).fill(204));
    expect(await history()).toEqual(saved);
  });

  it("replays a retained customer event with its pre-012 identity key", async () => {
    const f = await endedReplacementFixture(), input = event(f, true, "7", time(10));
    // This is the persisted 011 encoding, independent of the current writer.
    const key = createHash("sha256").update(JSON.stringify([workspaceId, f.target.id, f.row.user_id,
      f.target.parent, f.target.child, accountSid, f.conferenceSid, f.row.conference_id,
      "participant-join", 7, "2026-11-01T14:00:10.000Z"])).digest("hex");
    await sql`insert into public.workspace_voice_recording_customer_event
      (id, workspace, reservation_id, user_id, logical_call_sid, customer_call_sid, account_sid,
       conference_sid, conference_name, event, sequence_number, occurred_at, event_key, participant_call_sid)
      values (${randomUUID()}::uuid, ${workspaceId}::uuid, ${f.target.id}::uuid, ${f.row.user_id},
       ${f.target.parent}, ${f.target.child}, ${accountSid}, ${f.conferenceSid}, ${f.row.conference_id},
       'participant-join', 7, '2026-11-01T14:00:10Z'::timestamptz, ${key}, ${f.target.child})`;
    const saved = await history();
    expect((await signedAudio(f.row.conference_callback, input)).status).toBe(204);
    expect(await history()).toEqual(saved);
  });

  it.each([
    ["different time", { Timestamp: "Sun, 1 Nov 2026 14:00:20 +0000" }],
    ["different event", { StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_updated_via_api" }],
  ])("rejects %s on a saved provider sequence without changing either owner", async (_name, patch) => {
    const f = await endedReplacementFixture(), input = event(f, true, "7", time(10));
    expect((await signedAudio(f.row.conference_callback, input)).status).toBe(204);
    const saved = await history(), audio = await journal.findVoiceAudioConnection(f.row.id);
    expect((await signedAudio(f.row.conference_callback, { ...input, ...patch })).status).toBe(403);
    expect(await history()).toEqual(saved);
    expect(await journal.findVoiceAudioConnection(f.row.id)).toEqual(audio);
  });

  it.each([
    ["foreign customer", { CallSid: sid() }],
    ["foreign room", { ConferenceSid: `CF${randomUUID().replaceAll("-", "")}` }],
    ["foreign account", { AccountSid: `AC${randomUUID().replaceAll("-", "")}` }],
    ["wrong room name", { FriendlyName: "another-room" }],
  ])("does not capture %s", async (_name, patch) => {
    const f = await endedReplacementFixture();
    expect((await signedAudio(f.row.conference_callback, { ...event(f, true, "7", time(10)), ...patch })).status).toBe(403);
    expect(await history()).toHaveLength(0);
  });

  it("does not accept an invalid signature or infer customer audio from a parent join", async () => {
    const f = await endedReplacementFixture();
    expect((await signedAudio(f.row.conference_callback, event(f, true, "7", time(10)), false)).status).toBe(403);
    expect((await signedAudio(f.row.conference_callback, { ...event(f, true, "8", time(10)), CallSid: f.target.parent })).status).toBe(204);
    expect(await history()).toHaveLength(1);
    expect((await history())[0]).toMatchObject({ participant_call_sid: f.target.parent });
  });

  it("refuses changed funded ownership before saving a customer event", async () => {
    const f = await endedReplacementFixture();
    await sql`update public.workspace_voice_reservation set user_id = ${otherActor} where id = ${f.target.id}::uuid`;
    expect((await signedAudio(f.row.conference_callback, event(f, true, "7", time(10)))).status).toBe(403);
    expect(await history()).toHaveLength(0);
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ customer_joined_at: null });
  });

  it.each([
    ["missing timing", undefined, undefined], ["local date", "7", "2026-11-01T14:00:10"],
    ["invalid date", "7", "not-a-dateZ"], ["negative sequence", "-1", time(10)],
    ["impossible calendar date", "7", "2026-02-30T14:00:10Z"],
    ["impossible RFC date", "7", "Mon, 30 Feb 2026 14:00:10 +0000"],
    ["excessive sequence", "2147483648", time(10)],
  ])("retains %s as uncertain evidence instead of using arrival time", async (_name, sequence, timestamp) => {
    const f = await endedReplacementFixture(), recording = await completed(f), input: Record<string, string> = bridgeParams(f, "customer", true);
    if (sequence !== undefined) input.SequenceNumber = sequence;
    if (timestamp !== undefined) input.Timestamp = timestamp;
    expect((await signedAudio(f.row.conference_callback, input)).status).toBe(204);
    expect(await history()).toHaveLength(1);
    expect(await readVoiceConferenceRecordingSlices(recording)).toEqual({ state: "pending", reason: "unproven_membership_time" });
  });

  it("does not turn an open customer visit into a complete recording", async () => {
    const f = await endedReplacementFixture(), recording = await completed(f);
    expect((await signedAudio(f.row.conference_callback, event(f, true, "7", time(10)))).status).toBe(204);
    expect(await readVoiceConferenceRecordingSlices(recording)).toEqual({ state: "pending", reason: "open_membership" });
  });

  it("rolls back customer readiness when the event cannot be saved", async () => {
    const f = await endedReplacementFixture();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin raise exception 'owned membership save fault'; end $$`);
    await sql.unsafe(`create trigger ${fault} before insert on public.workspace_voice_recording_customer_event for each row execute function public.${fault}()`);
    expect((await signedAudio(f.row.conference_callback, event(f, true, "7", time(10)))).status).toBe(500);
    expect(await history()).toHaveLength(0);
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ customer_joined_at: null });
  });
});
