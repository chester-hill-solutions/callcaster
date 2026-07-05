import { ivrScriptStepsFromCampaign } from "@/lib/campaign-ivr.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { hangupTwiml } from "@/lib/twilio-twiml.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { findCallWithCampaignScriptBySid } from "@/lib/telephony-db.server";
import Twilio from "twilio";
import type { ActionFunctionArgs } from "react-router";

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

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const { pageId, campaignId } = params as { pageId: string; campaignId: string };
  const formData = await request.formData();
  const paramsObj = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSid = paramsObj.CallSid ?? null;

  if (!callSid || !campaignId || !pageId) {
    return new Response("Missing required parameters", { status: 400 });
  }

  const forbidden = await requireTwilioSignature(request, { callSid });
  if (forbidden) return forbidden;

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
};
