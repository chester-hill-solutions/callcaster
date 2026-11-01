import { isParticipantHangup, isParticipantJoin, isParticipantLeave, type TwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { stopVoiceAudioConferenceForParticipant } from "@/lib/voice-audio-stop.server";
import { observeVoiceAudioConferenceEvent, observeVoiceAudioBridgeEvent, type VoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";
import type { VoiceAudioConnection } from "@/server/voice-audio-connection.server";
import { bindVoicePhoneCustomerParticipant } from "@/server/voice-phone-customer.server";
import { handlePredictiveParticipantJoin, handlePredictiveParticipantLeave } from "@/lib/predictive-participant-join.server";
import { findCallBySid } from "@/lib/telephony-db.server";

type ParticipantEvent = Extract<TwilioVoiceCallback, { kind: "participant" }>;

export async function handleBoundVoiceAudioCustomerParticipant(owner: VoiceAudioConnection, requestUrl: string, event: ParticipantEvent) {
  const row = await bindVoicePhoneCustomerParticipant(owner, { requestUrl, accountSid: event.accountSid ?? "", callSid: event.callSid ?? "",
    conferenceId: event.conferenceName ?? "", conferenceSid: event.conferenceSid ?? "", participantLabel: event.raw.ParticipantLabel ?? "" });
  if (row?.audio_mode === "predictive" && (isParticipantJoin(event) || isParticipantLeave(event))) {
    const call = await findCallBySid(event.callSid ?? "");
    if (!call || call.workspace !== row.workspace) throw new Error("Predictive phone customer Call is missing");
    if (isParticipantJoin(event)) await handlePredictiveParticipantJoin(event, call);
    else await handlePredictiveParticipantLeave(event, call);
  }
  return row;
}

/** Signature validation and callback-owner binding precede participant dispatch. */
export async function handleBoundVoiceAudioParticipant(workspaceId: string, requestUrl: string, event: ParticipantEvent) {
  if (event.event !== "participant-join" && event.event !== "participant-leave") return null;
  const input: VoiceAudioConferenceEvent = { workspaceId, requestUrl, accountSid: event.accountSid ?? "", callSid: event.callSid ?? "",
    conferenceId: event.conferenceName ?? "", conferenceSid: event.conferenceSid ?? "", event: event.event,
    participantLabel: event.raw.ParticipantLabel ?? "", muted: event.raw.Muted ?? "" };
  const row = await observeVoiceAudioConferenceEvent(input);
  if (!row) return null;
  if (isParticipantHangup(event)) await stopVoiceAudioConferenceForParticipant(row, input.callSid);
  return row;
}

/** The first callback owner can end while its original parent/customer bridge lives. */
export async function handleBoundVoiceAudioBridgeParticipant(owner: VoiceAudioConnection, requestUrl: string, event: ParticipantEvent) {
  const callSid = event.callSid ?? "";
  const row = await observeVoiceAudioBridgeEvent(owner, { accountSid: event.accountSid ?? "", requestUrl,
    conferenceId: event.conferenceName ?? "", conferenceSid: event.conferenceSid ?? "", callSid,
    joined: event.event === "participant-join",
    sequenceNumber: event.raw.SequenceNumber, timestamp: event.timestamp,
  });
  if (isParticipantHangup(event)) await stopVoiceAudioConferenceForParticipant(row, callSid);
  return row;
}
