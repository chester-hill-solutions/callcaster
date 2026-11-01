import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { workspace_voice_recording_customer_event as events, workspace_voice_reservation as reservations } from "@/db/schema";
import { VoiceRecordingBindingError } from "@/lib/voice-recording";
import { createTenantDb } from "./tenant-db";
import { voiceRecordingCustomerSlices } from "@/lib/voice-recording-timeline";
import { withVoiceRecordingOperation, type VoiceRecordingOperation } from "./voice-recording-operation.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import { withVoiceAudioConnection, type VoiceAudioConnection } from "./voice-audio-connection.server";
import type { ParticipantEventName } from "@/lib/twilio/voice-callback";

type RoomEvent = { callSid: string | null; event: ParticipantEventName; sequenceNumber?: string; timestamp?: string | null };
const isoTime = z.iso.datetime({ offset: true });
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function providerTime(value: string | null | undefined) {
  if (!value) return null;
  // Convert the documented RFC 2822 form before strict calendar validation.
  const rfc = /^(?:[A-Za-z]{3}, )?(\d{1,2}) ([A-Za-z]{3}) (\d{4}) (\d{2}:\d{2}:\d{2}) (GMT|[+-]\d{4})$/.exec(value);
  const [, day = "", monthName = "", year = "", clock = "", zone = ""] = rfc ?? [];
  const month = months.indexOf(monthName) + 1, offset = zone === "GMT" ? "Z" : zone.replace(/(\d{2})$/, ":$1");
  const normalized = rfc ? `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}T${clock}${offset}` : value;
  const parsed = isoTime.safeParse(normalized);
  return parsed.success ? new Date(parsed.data) : null;
}

function providerSequence(value: string | undefined) {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence <= 2147483647 ? sequence : null;
}

/** Under the existing workspace/audio locks; retain history after the phone ends. */
export async function recordVoiceCustomerConferenceEvent(tx: CreditTransaction, owner: VoiceAudioConnection, input: RoomEvent) {
  if (owner.target_kind !== "direct") return;
  if (!owner.reservation_id || !owner.original_agent_sid || !owner.customer_sid || !owner.conference_sid)
    throw new VoiceRecordingBindingError("Recording membership has no manual call owner");
  const tdb = createTenantDb(owner.workspace, tx);
  const reservation = await tdb.workspace_voice_reservation.findFirst({ where: eq(reservations.id, owner.reservation_id) });
  if (!reservation || reservation.user_id !== owner.user_id || reservation.account_sid !== owner.account_sid ||
      reservation.setup_sid !== owner.original_agent_sid || reservation.provider_sid !== owner.customer_sid || reservation.conference_id)
    throw new VoiceRecordingBindingError("Recording membership has a different customer owner");
  const event = input.event;
  const sequence = providerSequence(input.sequenceNumber), occurredAt = providerTime(input.timestamp);
  // Preserve the original customer encoding across the room-witness extension.
  const identity = [owner.workspace, owner.reservation_id, owner.user_id,
    owner.original_agent_sid, owner.customer_sid, owner.account_sid, owner.conference_sid, owner.conference_id, event,
    sequence ?? input.sequenceNumber, occurredAt?.toISOString() ?? input.timestamp];
  if (input.callSid !== owner.customer_sid) identity.push(input.callSid);
  const key = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  await tx.insert(events).values({ id: randomUUID(), workspace: owner.workspace, reservation_id: owner.reservation_id,
    user_id: owner.user_id, logical_call_sid: owner.original_agent_sid, customer_call_sid: owner.customer_sid, participant_call_sid: input.callSid,
    account_sid: owner.account_sid, conference_sid: owner.conference_sid, conference_name: owner.conference_id,
    event, sequence_number: sequence, occurred_at: occurredAt, event_key: key,
  }).onConflictDoNothing();
  const saved = await tdb.workspace_voice_recording_customer_event.findFirst({ where: and(
    eq(events.account_sid, owner.account_sid), eq(events.conference_sid, owner.conference_sid),
    sequence === null ? eq(events.event_key, key) : eq(events.sequence_number, sequence),
  ) });
  if (saved?.event_key !== key) throw new VoiceRecordingBindingError("Recording membership event conflicts with saved history");
}

/** Save neutral witnesses too; the first callback owner still names the room. */
export function recordBoundVoiceRecordingRoomEvent(owner: VoiceAudioConnection, input: RoomEvent & {
  requestUrl: string; accountSid: string; conferenceId: string; conferenceSid: string;
}) {
  if (owner.target_kind !== "direct") return;
  return withVoiceAudioConnection(owner, async (tx, current) => {
    if (!current.conference_sid) return;
    if (current.account_sid !== input.accountSid || current.conference_callback !== input.requestUrl ||
        current.conference_id !== input.conferenceId || current.conference_sid !== input.conferenceSid)
      throw new VoiceRecordingBindingError("Recording room event has a different owner");
    await recordVoiceCustomerConferenceEvent(tx, current, input);
  });
}

/** A late callback and the interval snapshot share the same workspace fence. */
export function readVoiceConferenceRecordingSlices(owner: VoiceRecordingOperation) {
  return withVoiceRecordingOperation(owner, async (tx, current) => {
    if (current.kind !== "conference" || !current.source_conference_sid || current.provider_status !== "completed" || !current.terminal_at)
      return { state: "pending" as const, reason: "recording_incomplete" };
    const tdb = createTenantDb(current.workspace, tx);
    const reservation = await tdb.workspace_voice_reservation.findFirst({ where: eq(reservations.id, current.reservation_id) });
    if (!reservation || reservation.user_id !== current.user_id || reservation.account_sid !== current.account_sid ||
        reservation.setup_sid !== current.logical_call_sid || !reservation.provider_sid || reservation.conference_id)
      return { state: "pending" as const, reason: "customer_owner_unavailable" };
    const rows = await tdb.workspace_voice_recording_customer_event.findMany({ where: and(
      eq(events.account_sid, current.account_sid), eq(events.conference_sid, current.source_conference_sid),
      eq(events.logical_call_sid, current.logical_call_sid),
    ), limit: 1001 });
    if (rows.some(row => row.reservation_id !== current.reservation_id || row.user_id !== current.user_id ||
        row.customer_call_sid !== reservation.provider_sid || row.conference_name !== current.source_conference_name))
      return { state: "pending" as const, reason: "customer_membership_conflict" };
    return voiceRecordingCustomerSlices({ startedAt: current.recording_started_at, durationSeconds: current.recording_duration_seconds }, rows, reservation.provider_sid);
  });
}
