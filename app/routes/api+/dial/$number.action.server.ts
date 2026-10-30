import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { appendLiveTranscriptionStreamTwiml } from "@/lib/media-stream-twiml.server";
import { requireTwilioSignature, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { defineAction } from "@/lib/handler.server";
import { createVoiceResponse, sayHangupTwiml } from "@/lib/twilio-twiml.server";
import { bindVerifiedVoiceSetupRequest, voiceBridgeCallbackArgs } from "@/lib/voice-bridge-webhook.server";
import { claimVoiceBridgeRecipient } from "@/server/voice-bridge-reservation.server";
import { voiceWebhookDeliveryUrl } from "@/lib/twilio-webhook-delivery";

function unavailable() {
  return new Response(sayHangupTwiml("We're unable to take your call right now. Please try again later."),
    { headers: { "Content-Type": "text/xml" } });
}

export const action = defineAction({
  auth: async ({ request }) => {
    const formData = await request.clone().formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    if (!params.CallSid) return twilioWebhookForbiddenHangup();
    const forbidden = await requireTwilioSignature(request, { callSid: params.CallSid, params });
    if (forbidden) return forbidden;
    const bridge = await bindVerifiedVoiceSetupRequest(request, params);
    return bridge instanceof Response ? bridge : { bridge, params };
  },
  sideEffects: ["db-read", "db-write", "twilio"],
  handler: async ({ request, auth }) => {
    try {
      const { bridge, params } = auth;
      if (!bridge.status_callback || !bridge.user_id) return unavailable();
      const twiml = createVoiceResponse();
      const workspace = await getWorkspaceById(bridge.workspace);
      appendLiveTranscriptionStreamTwiml({ twiml,
        featureFlags: workspace?.feature_flags as Record<string, unknown> | undefined,
        params: { workspaceId: bridge.workspace, userId: bridge.user_id, direction: "outbound",
          contactId: bridge.contact_id, campaignId: bridge.campaign_id, callSid: params.CallSid,
          streamName: `call-${params.CallSid}` },
      });
      const dial = twiml.dial({ callerId: bridge.caller_id, record: "record-from-answer",
        ...(bridge.setup_continuation_url ? { action: voiceWebhookDeliveryUrl(bridge.setup_continuation_url), method: "POST" } : {}),
        recordingStatusCallback: `${env.BASE_URL()}/api/recording`, recordingStatusCallbackEvent: ["completed"] });
      dial.number({ statusCallback: bridge.status_callback,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"] }, bridge.recipient);
      const xml = twiml.toString();
      const claimed = await claimVoiceBridgeRecipient(voiceBridgeCallbackArgs(request, params, "voice"));
      return claimed.issued ? new Response(xml, { headers: { "Content-Type": "text/xml" } }) : unavailable();
    } catch (error) {
      logger.error("Error in dial route:", error);
      return unavailable();
    }
  },
});
