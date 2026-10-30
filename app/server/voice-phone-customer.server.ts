import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { workspace_voice_reservation as reservations } from "@/db/schema";
import { VoiceAudioBindingError, voiceAudioCustomerLabel } from "@/lib/voice-audio-connection";
import { db } from "./db";
import { voiceAudioCustomerSendGuard } from "./voice-audio-customer-admission.server";
import { withVoiceAudioConnection, type VoiceAudioConnection } from "./voice-audio-connection.server";
import type { VoiceAudioCustomerSourceProof } from "./voice-audio-customer-source.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

/** Provider-only nonce lookup; the original-account signature still must match. */
export async function findVoicePhoneCustomerOwner(reservationId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId)) return null;
  const [row] = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  return row ?? null;
}

/** Recheck source ownership under the same fence before issuing this customer join. */
export async function claimVoicePhoneCustomerInstruction(owner: VoiceReservation, proof: VoiceAudioCustomerSourceProof) {
  const { provider_sid: customerSid, customer_recording_id: recordingId, customer_recording_callback: recordingCallback } = owner;
  if (!owner.audio_connection_id || owner.audio_mode !== "manual" || !customerSid || !recordingId || !recordingCallback)
    throw new VoiceAudioBindingError("Customer conference instruction has no saved owner");
  return db.transaction(async tx => {
    const source = await voiceAudioCustomerSendGuard(tx, owner, proof);
    const [issued] = await tx.update(reservations).set({ recipient_instruction_issued_at: sql`clock_timestamp()`, updated_at: new Date() })
      .where(and(eq(reservations.id, owner.id), eq(reservations.workspace, owner.workspace), source,
        eq(reservations.provider_sid, customerSid), eq(reservations.customer_recording_id, recordingId),
        eq(reservations.customer_recording_callback, recordingCallback),
        inArray(reservations.state, ["creating", "active"]), isNull(reservations.recipient_instruction_issued_at),
        isNull(reservations.recipient_refused_at), isNull(reservations.terminal_status))).returning();
    return issued ?? null;
  });
}

/** Customer events retain the first phone's callback; they do not end its room. */
export async function bindVoicePhoneCustomerParticipant(owner: VoiceAudioConnection, input: {
  requestUrl: string; accountSid: string; conferenceId: string; conferenceSid: string; callSid: string; participantLabel: string;
}) {
  return withVoiceAudioConnection(owner, async (tx, current) => {
    if (current.account_sid !== input.accountSid || current.conference_callback !== input.requestUrl ||
      current.conference_id !== input.conferenceId || current.conference_sid !== input.conferenceSid)
      throw new VoiceAudioBindingError("Customer event does not match its callback owner");
    const [row] = await tx.select().from(reservations).where(and(eq(reservations.workspace, current.workspace),
      eq(reservations.account_sid, current.account_sid), eq(reservations.provider_sid, input.callSid),
      eq(reservations.conference_id, current.conference_id), eq(reservations.conference_sid, input.conferenceSid),
      eq(reservations.audio_conference_callback, input.requestUrl))).limit(1);
    if (!row) return null;
    if (!row.audio_connection_id || !row.send_started_at || !row.recipient_instruction_issued_at || !row.customer_recording_id ||
      row.user_id !== current.user_id || row.state === "released" ||
      input.participantLabel !== voiceAudioCustomerLabel(row.id))
      throw new VoiceAudioBindingError("Customer participant does not match its funded root");
    return row;
  });
}
