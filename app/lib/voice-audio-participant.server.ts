import { isParticipantHangup, type TwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { handleConferenceParticipantHangup } from "@/lib/conference-participant-hangup.server";
import { isRetiredVoiceAudioSource } from "@/server/voice-audio-classification.server";
import { observeVoiceAudioConferenceEvent, type VoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";

type ParticipantEvent = Extract<TwilioVoiceCallback, { kind: "participant" }>;

/** Signature validation and callback-owner binding precede participant dispatch. */
export async function handleBoundVoiceAudioParticipant(workspaceId: string, requestUrl: string, event: ParticipantEvent) {
  if (event.event !== "participant-join" && event.event !== "participant-leave") return null;
  const input: VoiceAudioConferenceEvent = { workspaceId, requestUrl, accountSid: event.accountSid ?? "", callSid: event.callSid ?? "",
    conferenceId: event.conferenceName ?? "", conferenceSid: event.conferenceSid ?? "", event: event.event,
    participantLabel: event.raw.ParticipantLabel ?? "", muted: event.raw.Muted ?? "" };
  const row = await observeVoiceAudioConferenceEvent(input);
  if (!row) return null;
  if (isParticipantHangup(event) && row.committed_at && !row.retired_at && !await isRetiredVoiceAudioSource({
    workspaceId, accountSid: row.account_sid, callSid: input.callSid, conferenceId: row.conference_id,
  })) {
    const client = await createOriginalVoiceAccountClient(row);
    await handleConferenceParticipantHangup(event, { sid: input.callSid, workspace: workspaceId, contact_id: null,
      conference_id: row.conference_id }, client, input.conferenceSid);
  }
  return row;
}
