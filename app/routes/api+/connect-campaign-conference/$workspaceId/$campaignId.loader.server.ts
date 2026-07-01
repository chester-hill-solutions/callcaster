import {
  twilioWebhookForbidden,
  validateTwilioWebhookForWorkspace,
} from "@/lib/twilio-webhook.server";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import type { LoaderFunctionArgs } from "react-router";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse.js";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const workspaceId = params.workspaceId;
  const campaignId = params.campaignId;
  if (!workspaceId || !campaignId) {
    return twilioWebhookForbidden("Missing workspace or campaign");
  }

  const validation = await validateTwilioWebhookForWorkspace({
    request,
    workspaceId,
  });
  if (!validation.ok) {
    return validation.response;
  }

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
};
