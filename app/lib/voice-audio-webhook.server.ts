import { resolveCanonicalTwilioWebhookUrl, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { hangupTwiml } from "@/lib/twilio-twiml.server";
import { voiceAudioConferenceTwiml, voiceAudioConfirmationTwiml } from "@/lib/voice-audio-twiml.server";
import { attemptVoiceAudioCancellation } from "@/lib/voice-audio-recovery.server";
import { bindVoiceAudioProviderReceipt } from "@/server/voice-audio-callback.server";
import { issueVoiceAudioInstruction } from "@/server/voice-audio-conference.server";
import { observeVoiceAudioStatus } from "@/server/voice-audio-lifecycle.server";
import type { VoiceAudioConnection } from "@/server/voice-audio-connection.server";
import { logger } from "@/lib/logger.server";
import { VoiceAudioBindingError } from "@/lib/voice-audio-connection";
import { handleBoundVoiceAudioParticipant, handleBoundVoiceAudioBridgeParticipant, handleBoundVoiceAudioCustomerParticipant } from "@/lib/voice-audio-participant.server";
import { parseTwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { VoiceRecordingBindingError } from "@/lib/voice-recording";
import { recordBoundVoiceRecordingRoomEvent } from "@/server/voice-recording-customer-events.server";

type VerifiedContext = { owner: VoiceAudioConnection; params: Record<string, string>; event: "voice" | "status" | "conference" };

function conferenceMatches(owner: VoiceAudioConnection, params: Record<string, string>, requestUrl: string) {
  return requestUrl === owner.conference_callback && params.FriendlyName === owner.conference_id &&
    /^CF[0-9a-f]{32}$/i.test(params.ConferenceSid ?? "") && (!owner.conference_sid || owner.conference_sid === params.ConferenceSid);
}

async function handleConference(owner: VoiceAudioConnection, params: Record<string, string>, requestUrl: string) {
  const event = parseTwilioVoiceCallback(params);
  if (event.kind !== "participant") return conferenceMatches(owner, params, requestUrl)
    ? new Response(null, { status: 204 }) : twilioWebhookForbiddenHangup();
  // Retain known phase conflicts before returning 403, including wrong rooms/labels.
  const customer = await handleBoundVoiceAudioCustomerParticipant(owner, requestUrl, event);
  if (!conferenceMatches(owner, params, requestUrl)) return twilioWebhookForbiddenHangup();
  if (event.event === "participant-join" || event.event === "participant-leave") {
    if (!customer && !await handleBoundVoiceAudioParticipant(owner.workspace, requestUrl, event))
      await handleBoundVoiceAudioBridgeParticipant(owner, requestUrl, event);
  }
  await recordBoundVoiceRecordingRoomEvent(owner, { requestUrl, accountSid: event.accountSid ?? "",
    conferenceId: event.conferenceName ?? "", conferenceSid: event.conferenceSid ?? "", callSid: event.callSid,
    event: event.event, sequenceNumber: event.raw.SequenceNumber, timestamp: event.timestamp });
  return new Response(null, { status: 204 });
}

function receiptArgs(auth: VerifiedContext, requestUrl: string, event: "voice" | "status") {
  const { params, owner } = auth;
  return { connectionId: owner.id, event, requestUrl, accountSid: params.AccountSid ?? "", callSid: params.CallSid ?? "",
    to: params.To ?? "", from: params.From ?? "", direction: params.Direction ?? "", parentCallSid: params.ParentCallSid || null };
}

/** The route has authenticated the raw body and original URL before normalization. */
export async function handleVerifiedVoiceAudioWebhook(request: Request, auth: VerifiedContext) {
  const { owner, params, event } = auth;
  const requestUrl = resolveCanonicalTwilioWebhookUrl(request);
  try {
    if (event === "conference") return await handleConference(owner, params, requestUrl);
    const bound = await bindVoiceAudioProviderReceipt(receiptArgs(auth, requestUrl, event));
    if (event === "status") {
      const status = await observeVoiceAudioStatus(bound, params.CallStatus ?? "", params.CallDuration);
      await attemptVoiceAudioCancellation(status);
      return new Response(null, { status: 204 });
    }
    const result = await issueVoiceAudioInstruction(bound, params.Digits);
    let xml = hangupTwiml();
    if (result.ok) xml = result.confirmed ? voiceAudioConferenceTwiml(result.connection, result.recording) : voiceAudioConfirmationTwiml(result.connection);
    return new Response(xml, { headers: { "Content-Type": "text/xml" } });
  } catch (error) {
    if (error instanceof VoiceAudioBindingError || error instanceof VoiceRecordingBindingError) {
      logger.warn("voice_audio.webhook_binding_rejected", { connectionId: owner.id, event });
      return twilioWebhookForbiddenHangup();
    }
    logger.error("voice_audio.webhook_processing_failed", { connectionId: owner.id, event, error });
    return Response.json({ error: "Unable to process the audio event" }, { status: 500 });
  }
}
