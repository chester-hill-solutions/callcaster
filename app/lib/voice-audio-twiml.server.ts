import { createVoiceResponse } from "@/lib/twilio-twiml.server";
import { voiceAudioParticipantLabel, voiceAudioStartsMuted } from "@/lib/voice-audio-connection";
import type { VoiceAudioConnection } from "@/server/voice-audio-connection.server";

export function voiceAudioConferenceTwiml(row: VoiceAudioConnection) {
  const response = createVoiceResponse();
  response.dial().conference({ beep: "false", startConferenceOnEnter: true, endConferenceOnExit: false,
    muted: row.state === "active" ? false : voiceAudioStartsMuted(row), participantLabel: voiceAudioParticipantLabel(row), waitUrl: "",
    statusCallback: row.conference_callback, statusCallbackMethod: "POST", statusCallbackEvent: ["join", "leave", "end"],
  }, row.conference_id);
  return response.toString();
}

export function voiceAudioConfirmationTwiml(row: VoiceAudioConnection) {
  const response = createVoiceResponse();
  response.gather({ action: row.voice_url, method: "POST", numDigits: 1, timeout: 15 }).say("To connect your CallCaster audio, press 1.");
  response.hangup();
  return response.toString();
}
