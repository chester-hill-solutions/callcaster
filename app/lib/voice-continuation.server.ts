import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { matchesVoiceSetupRoot, voiceCallLegIdentity } from "@/lib/voice-bridge-identity";
import { createVoiceResponse, hangupTwiml } from "@/lib/twilio-twiml.server";
import { VoiceAudioBindingError } from "@/lib/voice-audio-connection";
import type { bindVoiceContinuation } from "@/server/voice-continuation.server";
import type { VoiceReservation } from "@/server/voice-credit-reservation.server";
import type { VoiceAudioConnection } from "@/server/voice-audio-connection.server";
import { logger } from "@/lib/logger.server";
import { voiceWebhookDeliveryUrl } from "@/lib/twilio-webhook-delivery";
import { withVoiceProviderReadBudget } from "@/lib/voice-provider-read-budget";

async function readContinuationLegs(row: VoiceReservation & { setup_sid: string; provider_sid: string }) {
  return withVoiceProviderReadBudget(async (requireActive) => {
    const client = await createOriginalVoiceAccountClient(row);
    requireActive();
    return Promise.all([client.calls(row.setup_sid).fetch(), client.calls(row.provider_sid).fetch()]);
  }, 1000, "Original audio provider verification timed out");
}

function originalParentConferenceTwiml(connection: VoiceAudioConnection) {
  const response = createVoiceResponse();
  response.dial().conference({ beep: "false", startConferenceOnEnter: true, endConferenceOnExit: false, muted: false,
    participantLabel: `parent:${connection.id}:${connection.generation}`, waitUrl: "", statusCallback: voiceWebhookDeliveryUrl(connection.conference_callback),
    statusCallbackMethod: "POST", statusCallbackEvent: ["join", "leave", "end"],
  }, connection.conference_id);
  return response.toString();
}

/** Continue the original parent; never create or settle a customer call. */
export async function voiceContinuationTwiml(bound: Awaited<ReturnType<typeof bindVoiceContinuation>>) {
  const { reservation: row, connection } = bound;
  if (!connection || !row.setup_sid || !row.provider_sid) return hangupTwiml();
  let physical: Awaited<ReturnType<typeof readContinuationLegs>>;
  try { physical = await readContinuationLegs({ ...row, setup_sid: row.setup_sid, provider_sid: row.provider_sid }); }
  catch (error) {
    logger.warn("voice_audio.parent_verification_pending", { reservationId: row.id, error });
    // The signed action, immutable journal and saved promotion already own
    // this parent. Preserve that source; replacement commit still needs proof.
    return originalParentConferenceTwiml(connection);
  }
  const [parent, child] = physical;
  const expected = voiceCallLegIdentity(row, "recipient");
  if (parent.sid !== row.setup_sid || !matchesVoiceSetupRoot(row, parent) || child.sid !== row.provider_sid ||
    child.accountSid !== row.account_sid || child.to !== expected.to || child.from !== expected.from ||
    child.direction !== expected.direction || child.parentCallSid !== expected.parent_call_sid)
    throw new VoiceAudioBindingError("Manual continuation provider identity does not match");
  if (parent.status !== "in-progress" || child.status !== "in-progress") return hangupTwiml();
  return originalParentConferenceTwiml(connection);
}
