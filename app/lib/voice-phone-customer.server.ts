import { createVoiceResponse } from "@/lib/twilio-twiml.server";
import { voiceBridgeCallbackArgs } from "@/lib/voice-bridge-webhook.server";
import { normalizeVerifiedVoiceParams } from "@/lib/twilio/verified-voice-params";
import { twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { voiceWebhookDeliveryUrl } from "@/lib/twilio-webhook-delivery";
import { voiceAudioCustomerLabel } from "@/lib/voice-audio-connection";
import { verifyVoiceAudioCustomerSource } from "@/lib/voice-audio-customer-source.server";
import { appendLiveTranscriptionStreamTwiml } from "@/lib/media-stream-twiml.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { isObject } from "@/lib/type-safety-utils";
import { bindVoiceReservationCallback, VoiceReservationBindingError } from "@/server/voice-reservation-callback.server";
import { claimVoicePhoneCustomerInstruction, findVoicePhoneCustomerOwner } from "@/server/voice-phone-customer.server";
import type { VoiceReservation } from "@/server/voice-credit-reservation.server";

/** Only the already-funded customer root joins; Connect never reaches this path. */
export async function voicePhoneCustomerInstruction(request: Request, owner: VoiceReservation, params: Record<string, string>) {
  if (!normalizeVerifiedVoiceParams(params)) return twilioWebhookForbiddenHangup();
  try { await bindVoiceReservationCallback(voiceBridgeCallbackArgs(request, params, "voice")); }
  catch (error) { if (error instanceof VoiceReservationBindingError) return twilioWebhookForbiddenHangup(); throw error; }
  const row = await findVoicePhoneCustomerOwner(owner.id);
  if (!row?.audio_connection_id || row.audio_generation == null || !row.audio_destination || !row.audio_conference_callback ||
    !row.user_id || row.campaign_id == null || !row.conference_id || row.audio_mode !== "manual") return twilioWebhookForbiddenHangup();
  const source = await verifyVoiceAudioCustomerSource({ workspaceId: row.workspace, userId: row.user_id, campaignId: row.campaign_id,
    connectionId: row.audio_connection_id, generation: row.audio_generation, phoneNumber: row.audio_destination });
  if (!source.ok) return null;
  const twiml = createVoiceResponse(), workspace = await getWorkspaceById(row.workspace);
  appendLiveTranscriptionStreamTwiml({ twiml, featureFlags: isObject(workspace?.feature_flags) ? workspace.feature_flags : undefined,
    params: { workspaceId: row.workspace, userId: row.user_id, direction: "outbound", contactId: row.contact_id,
      campaignId: row.campaign_id, callSid: params.CallSid, streamName: `call-${params.CallSid}` } });
  twiml.dial().conference({ beep: "false", startConferenceOnEnter: true, endConferenceOnExit: false, waitUrl: "",
    participantLabel: voiceAudioCustomerLabel(row.id), statusCallback: voiceWebhookDeliveryUrl(row.audio_conference_callback),
    statusCallbackMethod: "POST", statusCallbackEvent: ["join", "leave", "end"],
  }, row.conference_id);
  const xml = twiml.toString();
  return await claimVoicePhoneCustomerInstruction(row, source.proof)
    ? new Response(xml, { headers: { "Content-Type": "text/xml" } }) : null;
}
