import { randomUUID } from "node:crypto";
import type { Twilio } from "twilio";
import { dispatchReservedVoiceCall } from "@/lib/voice-credit-dispatch.server";
import { VoiceRecordingBindingError, voiceRecordingCallbackUrl } from "@/lib/voice-recording";
import { voiceWebhookDeliveryUrl } from "@/lib/twilio-webhook-delivery";
import type { VoiceDispatchUrls, VoiceReservationInput } from "@/server/voice-credit-reservation.server";
import type { VerifiedVoiceAudioCustomerIntent } from "@/server/voice-audio-customer-admission.server";

/** Call creation starts the recording at answer, before customer conference TwiML. */
export function createRecordedPhoneCustomer(client: Twilio, request: {
  to: string; from: string; voiceUrl: string; statusCallback: string; recordingCallback: string;
}) {
  return client.calls.create({ to: request.to, from: request.from, url: request.voiceUrl, method: "POST",
    statusCallback: request.statusCallback, statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    record: true, recordingChannels: "dual", recordingTrack: "both", trim: "do-not-trim",
    recordingStatusCallback: voiceWebhookDeliveryUrl(request.recordingCallback), recordingStatusCallbackMethod: "POST",
    recordingStatusCallbackEvent: ["in-progress", "completed", "absent"],
  });
}

/** Explicit customer Start reuses the confirmed phone; it never dials another agent. */
export async function dispatchPhoneCustomerVoiceCall(args: VoiceReservationInput & VoiceDispatchUrls & {
  audioSource: VerifiedVoiceAudioCustomerIntent; client: Twilio;
}) {
  if (args.client.accountSid !== args.accountSid) throw new VoiceRecordingBindingError("Customer send requires the original account");
  const id = randomUUID(), recording = { id, callbackUrl: voiceRecordingCallbackUrl(args.voiceUrl, id) };
  return dispatchReservedVoiceCall({ ...args, customerRecording: recording,
    create: urls => createRecordedPhoneCustomer(args.client, { to: args.to, from: args.from,
      voiceUrl: urls.voiceUrl, statusCallback: urls.statusCallback, recordingCallback: recording.callbackUrl }),
  });
}
