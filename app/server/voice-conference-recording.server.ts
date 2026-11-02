import { randomUUID } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { workspace_voice_recording_operation as recordings } from "@/db/schema";
import { VoiceRecordingBindingError, voiceRecordingCallbackUrl } from "@/lib/voice-recording";
import { createTenantDb } from "./tenant-db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceAudioConnection } from "./voice-audio-connection.server";

async function conferenceRecording(tx: CreditTransaction, connection: VoiceAudioConnection) {
  if (!connection.reservation_id) return null;
  const tdb = createTenantDb(connection.workspace, tx);
  const where = and(eq(recordings.reservation_id, connection.reservation_id), eq(recordings.kind, "conference"));
  if (connection.recording_operation_id) {
    const saved = await tdb.workspace_voice_recording_operation.findFirst({ where: and(where, eq(recordings.id, connection.recording_operation_id)) });
    if (!saved) throw new VoiceRecordingBindingError("Saved Conference recording is unavailable");
    return saved;
  }
  // Exact retries retain history; only a new intent can own a fresh capture.
  const exact = await tdb.workspace_voice_recording_operation.findFirst({ where: and(where, eq(recordings.intent_id, connection.id)) });
  // A legacy issued instruction cannot guess which later shared part it used.
  if (exact || connection.voice_issued_at) return exact;
  return tdb.workspace_voice_recording_operation.findFirst({ where: and(where,
      eq(recordings.source_conference_name, connection.conference_id), ne(recordings.state, "failed"), isNull(recordings.terminal_at)) });
}

/** Called under the admitted audio owner's lock, before returning its join TwiML. */
export async function issueVoiceConferenceRecording(tx: CreditTransaction, connection: VoiceAudioConnection) {
  if (connection.target_kind !== "direct") return null;
  if (!connection.reservation_id || !connection.original_agent_sid || !connection.provider_sid)
    throw new VoiceRecordingBindingError("Conference recording requires its manual call owner");
  const tdb = createTenantDb(connection.workspace, tx);
  const existing = await conferenceRecording(tx, connection);
  if (existing) {
    if (existing.user_id !== connection.user_id || existing.account_sid !== connection.account_sid ||
      existing.logical_call_sid !== connection.original_agent_sid || existing.source_conference_name !== connection.conference_id ||
      existing.source_conference_sid && connection.conference_sid && existing.source_conference_sid !== connection.conference_sid)
      throw new VoiceRecordingBindingError("Conference recording belongs to another bridge");
    return existing.terminal_at || existing.state === "failed" ? null : existing;
  }
  // Do not add a nonce to a previously issued legacy instruction.
  if (connection.voice_issued_at) return null;
  const id = randomUUID();
  const [saved] = await tdb.workspace_voice_recording_operation.insert({ id,
    reservation_id: connection.reservation_id, user_id: connection.user_id, kind: "conference", intent_id: connection.id,
    logical_call_sid: connection.original_agent_sid, source_call_sid: connection.provider_sid,
    source_to: connection.destination, source_from: connection.caller_id, source_direction: "outbound-api", source_parent_sid: null,
    source_conference_name: connection.conference_id, source_conference_sid: connection.conference_sid,
    account_sid: connection.account_sid, callback_url: voiceRecordingCallbackUrl(connection.voice_url, id),
    state: "creating", send_started_at: new Date(), lease_token: randomUUID(), lease_expires_at: new Date(Date.now() + 5 * 60_000),
  });
  if (!saved) throw new Error("Conference recording instruction was not saved");
  return saved;
}

/** A real participant join must agree with any earlier signed recording receipt. */
export async function bindVoiceConferenceRecording(tx: CreditTransaction, connection: VoiceAudioConnection, conferenceSid: string) {
  if (connection.target_kind !== "direct" || !connection.reservation_id) return;
  const row = await conferenceRecording(tx, connection);
  if (!row) return;
  if (row.user_id !== connection.user_id || row.account_sid !== connection.account_sid ||
    row.logical_call_sid !== connection.original_agent_sid || row.source_conference_name !== connection.conference_id ||
    row.source_conference_sid && row.source_conference_sid !== conferenceSid)
    throw new VoiceRecordingBindingError("Conference recording does not match the joined bridge");
  if (!row.source_conference_sid) await tx.update(recordings).set({ source_conference_sid: conferenceSid, updated_at: new Date() })
    .where(eq(recordings.id, row.id));
}
