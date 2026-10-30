import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { withVoiceProviderReadBudget } from "@/lib/voice-provider-read-budget";
import { voiceAudioParticipantLabel, voiceAudioRefusal } from "@/lib/voice-audio-connection";
import type { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import type { ConferenceInstance } from "twilio/lib/rest/api/v2010/account/conference";
import type { ParticipantInstance } from "twilio/lib/rest/api/v2010/account/conference/participant";
import type { VoiceAudioConnection } from "@/server/voice-audio-connection.server";
import { readVoiceAudioCustomerSource, voiceAudioCustomerSourceProof,
  VOICE_AUDIO_SOURCE_PROOF_MS, type VoiceAudioCustomerSourceInput } from "@/server/voice-audio-customer-source.server";

function livePhoneMatches(row: VoiceAudioConnection, call: CallInstance) {
  return call.sid === row.provider_sid && call.accountSid === row.account_sid && call.status === "in-progress" &&
    !call.parentCallSid && call.direction === "outbound-api" && call.to === row.destination && call.from === row.caller_id;
}

function liveParticipantMatches(row: VoiceAudioConnection, room: ConferenceInstance, participant: ParticipantInstance) {
  return room.sid === row.conference_sid && room.accountSid === row.account_sid && room.friendlyName === row.conference_id && room.status === "in-progress" &&
    participant.callSid === row.provider_sid && participant.accountSid === row.account_sid && participant.conferenceSid === row.conference_sid &&
    participant.label === voiceAudioParticipantLabel(row) && participant.status === "connected" && !participant.muted && !participant.hold;
}

/** Provider reads run outside the funding transaction and never dial an agent or customer. */
export async function verifyVoiceAudioCustomerSource(input: VoiceAudioCustomerSourceInput) {
  const source = await readVoiceAudioCustomerSource(input);
  if (!source.ok) return source;
  const row = source.connection;
  return withVoiceProviderReadBudget(async requireActive => {
    const observedAt = Date.now();
    const client = await createOriginalVoiceAccountClient(row); requireActive();
    if (!row.provider_sid || !row.conference_sid) return voiceAudioRefusal("stale_audio");
    const [call, room, participant] = await Promise.all([
      client.calls(row.provider_sid).fetch(), client.conferences(row.conference_sid).fetch(),
      client.conferences(row.conference_sid).participants(row.provider_sid).fetch(),
    ]); requireActive();
    if (!livePhoneMatches(row, call) || !liveParticipantMatches(row, room, participant))
      return voiceAudioRefusal("stale_audio");
    return { ok: true as const, proof: voiceAudioCustomerSourceProof(row, observedAt) };
  }, VOICE_AUDIO_SOURCE_PROOF_MS, "Phone audio verification timed out");
}
