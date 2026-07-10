import {
  twilioWebhookForbidden,
  requireTwilioSignature,
} from "@/lib/twilio-webhook.server";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { logger } from "@/lib/logger.server";
import type { LoaderFunctionArgs } from "react-router";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse.js";

/** Fallback TwiML returned when the handler throws unexpectedly, so Twilio
 * hears a graceful message instead of an HTML error page. */
function connectCampaignConferenceUnavailableTwiml(): Response {
  const twiml = new VoiceResponse();
  twiml.say("We're unable to take your call right now. Please try again later.");
  twiml.hangup();
  return new Response(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const workspaceId = params.workspaceId;
  const campaignId = params.campaignId;
  if (!workspaceId || !campaignId) {
    return twilioWebhookForbidden("Missing workspace or campaign");
  }

  try {
    const forbidden = await requireTwilioSignature(request, { workspaceId });
    if (forbidden) return forbidden;

    const campaign = await findCampaignInWorkspace(workspaceId, Number(campaignId));

    if (!campaign) {
      return twilioWebhookForbidden("Campaign not found");
    }

    const twiml = new VoiceResponse();

    twiml.say("Welcome to the campaign. You will be connected to calls through your phone.");
    twiml.pause({ length: 1 });

    const dial = twiml.dial();
    dial.conference(
      {
        endConferenceOnExit: true,
        waitUrl: "http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical",
        startConferenceOnEnter: true,
        beep: "onEnter",
        record: "record-from-start",
      },
      `campaign-${workspaceId}-${campaignId}`,
    );

    return new Response(twiml.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    logger.error("Unhandled error in api.connect-campaign-conference", {
      error: error instanceof Error ? error.message : String(error),
      workspaceId,
      campaignId,
    });
    return connectCampaignConferenceUnavailableTwiml();
  }
};
