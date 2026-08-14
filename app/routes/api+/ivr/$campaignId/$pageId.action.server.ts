import { ivrScriptStepsFromCampaign } from "@/lib/campaign-ivr.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { createVoiceResponse, hangupTwiml } from "@/lib/twilio-twiml.server";
import { requireTwilioSignatureForIvrPage } from "@/lib/ivr-webhook-auth.server";
import { findCallWithCampaignScriptBySid } from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";

const MAX_RETRIES = 5;
const RETRY_DELAY = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** IVR script steps shape from DB (script.steps is Json) */
type IvrScriptSteps = { pages: Record<string, { blocks: string[] }> };

const getCallWithRetry = async (
  callSid: string,
  retries = 0,
): Promise<ReturnType<typeof findCallWithCampaignScriptBySid> | null> => {
  const data = await findCallWithCampaignScriptBySid(callSid);

  if (!data) {
    if (retries < MAX_RETRIES) {
      await sleep(RETRY_DELAY);
      return getCallWithRetry(callSid, retries + 1);
    }
    return null;
  }

  return data;
};

export const action = defineAction({
  auth: ({ request, params }) =>
    requireTwilioSignatureForIvrPage(request, [params.campaignId, params.pageId]),
  sideEffects: ["db-read"],
  handler: async ({ params, auth }) => {
  const twiml = createVoiceResponse();
  const { pageId, campaignId } = params as { pageId: string; campaignId: string };
  const { callSid } = auth;

  try {
    const callData = await getCallWithRetry(callSid);
    if (!callData) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }
    if (callData.campaign_id !== Number(campaignId)) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }
    const script = ivrScriptStepsFromCampaign(callData.campaign) as
      | IvrScriptSteps
      | null
      | undefined;
    if (!script || !script.pages) {
      throw new Error("Invalid script structure");
    }
    const currentPage = script.pages[pageId];
    if (currentPage && currentPage.blocks.length > 0) {
      const firstBlockId = currentPage.blocks[0];
      twiml.redirect(`/api/ivr/${campaignId}/${pageId}/${firstBlockId}`);
    } else {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
    }
  } catch (e) {
    logger.error("Error processing IVR page:", e);
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
  },
});
