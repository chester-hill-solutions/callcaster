import { createVoiceResponse } from "@/lib/twilio-twiml.server";
import { voiceAudioParticipantLabel, voiceAudioStartsMuted } from "@/lib/voice-audio-connection";
import type { VoiceAudioConnection } from "@/server/voice-audio-connection.server";
import { voiceWebhookDeliveryUrl } from "@/lib/twilio-webhook-delivery";

export function voiceAudioConferenceTwiml(row: VoiceAudioConnection, recording?: { callback_url: string } | null) {
  const response = createVoiceResponse();
  response.dial().conference({ beep: "false", startConferenceOnEnter: true, endConferenceOnExit: false,
    muted: row.state === "active" ? false : voiceAudioStartsMuted(row), participantLabel: voiceAudioParticipantLabel(row), waitUrl: "",
    statusCallback: voiceWebhookDeliveryUrl(row.conference_callback), statusCallbackMethod: "POST", statusCallbackEvent: ["join", "leave", "end"],
    ...(recording ? { record: "record-from-start", trim: "do-not-trim", recordingStatusCallback: voiceWebhookDeliveryUrl(recording.callback_url),
      recordingStatusCallbackMethod: "POST", recordingStatusCallbackEvent: ["in-progress", "completed", "absent"] } : {}),
  }, row.conference_id);
  return response.toString();
}

export function voiceAudioConfirmationTwiml(row: VoiceAudioConnection) {
  const response = createVoiceResponse();
  response.gather({ action: row.voice_url, method: "POST", numDigits: 1, timeout: 15 }).say("To connect your CallCaster audio, press 1.");
  response.hangup();
  return response.toString();
}
