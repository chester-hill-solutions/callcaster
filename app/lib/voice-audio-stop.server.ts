import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { handleConferenceParticipantHangup } from "@/lib/conference-participant-hangup.server";
import { isParticipantHangup, parseTwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { logger } from "@/lib/logger.server";
import type { VoiceAudioConnection } from "@/server/voice-audio-connection.server";
import { deferVoiceAudioConferenceStop, finishVoiceAudioConferenceStop, readPendingVoiceAudioConferenceStop,
  requestVoiceAudioConferenceStop } from "@/server/voice-audio-stop.server";

/** The saved intent survives physical leg completion and exhausted webhook retries. */
export async function attemptVoiceAudioConferenceStop(owner: VoiceAudioConnection) {
  const row = await readPendingVoiceAudioConferenceStop(owner);
  if (!row) return null;
  try {
    if (!row.conference_sid || !row.conference_stop_call_sid) throw new Error("Saved conference stop identity is missing");
    const event = parseTwilioVoiceCallback({ AccountSid: row.account_sid, CallSid: row.conference_stop_call_sid,
      ConferenceSid: row.conference_sid, FriendlyName: row.conference_id,
      StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" });
    if (!isParticipantHangup(event)) throw new Error("Saved conference stop participant is invalid");
    const client = await createOriginalVoiceAccountClient(row);
    await handleConferenceParticipantHangup(event, { sid: row.conference_stop_call_sid, workspace: row.workspace, contact_id: null,
      conference_id: row.conference_id }, client, row.conference_sid);
    return await finishVoiceAudioConferenceStop(row);
  } catch (error) {
    try { await deferVoiceAudioConferenceStop(row); }
    catch (deferError) { logger.error("voice_audio.conference_stop_retry_pending", { connectionId: row.id, error: deferError }); }
    throw error;
  }
}

export async function stopVoiceAudioConferenceForParticipant(owner: VoiceAudioConnection, callSid: string) {
  const row = await requestVoiceAudioConferenceStop(owner, callSid);
  if (row && !row.conference_stopped_at) await attemptVoiceAudioConferenceStop(row);
}
