import { resolveIvrEntryPageId } from "@/lib/ivr-page-order";
import { ivrScriptStepsFromCampaign } from "@/lib/campaign-ivr.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { createVoiceResponse, hangupTwiml } from "@/lib/twilio-twiml.server";
import { findCallWithCampaignScriptBySid } from "@/lib/telephony-db.server";
import {
  handleMachineAnswer,
  isMachineAnswered,
} from "@/lib/ivr-machine.server";
import { renderIvrBlock, type IvrRenderScript } from "@/lib/ivr-block-render.server";

const MAX_RETRIES = 5;
const RETRY_DELAY = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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


export async function renderCampaignIvrPage(args: {
  campaignId: string;
  pageId?: string;
  callSid: string;
  answeredBy: string;
}): Promise<Response> {
  const baseUrl = env.BASE_URL();
  const twiml = createVoiceResponse();
  const { pageId, campaignId, callSid, answeredBy } = args;

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

    // Synchronous AMD sends its verdict on this first request. Decide
    // here so a machine never hears the IVR; the shared policy plays the
    // configured drop when it is on, otherwise hangs up.
    if (isMachineAnswered(answeredBy)) {
      return handleMachineAnswer(callData, callData.campaign);
    }

    const script = ivrScriptStepsFromCampaign(callData.campaign) as
      | IvrRenderScript
      | null
      | undefined;
    if (!script || !script.pages) {
      throw new Error("Invalid script structure");
    }
    const effectivePageId = pageId && Object.hasOwn(script.pages, pageId)
      ? pageId : resolveIvrEntryPageId(script);
    const currentPage = effectivePageId ? script.pages[effectivePageId] : undefined;
    const firstBlockId = currentPage?.blocks[0];
    const firstBlock =
      firstBlockId && script.blocks ? script.blocks[firstBlockId] : undefined;

    // Render the first block here instead of redirecting to its own route
    // A Redirect cost an extra Twilio round-trip plus a second
    // call+campaign lookup before any audio played.
    if (firstBlock && firstBlockId && effectivePageId && callData.workspace) {
      await renderIvrBlock({
        twiml,
        block: firstBlock,
        pageId: effectivePageId,
        blockId: firstBlockId,
        script,
        workspace: callData.workspace,
        buildActionUrl: (p, b) => `${baseUrl}/api/ivr/${campaignId}/${p}/${b}/response`,
        buildBlockUrl: (p, b) => `${baseUrl}/api/ivr/${campaignId}/${p}/${b}`,
      });
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
}
