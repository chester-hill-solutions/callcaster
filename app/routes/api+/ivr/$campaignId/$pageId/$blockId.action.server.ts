import { fetchCampaignWithScript, ivrScriptStepsFromCampaign } from "@/lib/campaign-ivr.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { createVoiceResponse, hangupTwiml } from "@/lib/twilio-twiml.server";
import { requireTwilioSignatureForIvrBlock } from "@/lib/ivr-webhook-auth.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";
import {
  renderIvrBlock,
  type IvrRenderScript,
} from "@/lib/ivr-block-render.server";

export const action = defineAction({
  auth: ({ request, params }) =>
    requireTwilioSignatureForIvrBlock(request, [params.campaignId, params.pageId, params.blockId]),
  sideEffects: ["db-read", "external"],
  handler: async ({ params, auth }) => {
    const baseUrl = env.BASE_URL();
    const twiml = createVoiceResponse();
    const { pageId, blockId, campaignId } = params as {
      pageId: string;
      blockId: string;
      campaignId: string;
    };
    const { callSid } = auth;

    try {
      const call = await findCallBySid(callSid);
      if (!call?.workspace) {
        return new Response(hangupTwiml(), {
          headers: { "Content-Type": "text/xml" },
        });
      }
      if (call.campaign_id !== Number(campaignId)) {
        return new Response(hangupTwiml(), {
          headers: { "Content-Type": "text/xml" },
        });
      }

      const campaignData = await fetchCampaignWithScript(campaignId);
      const script = ivrScriptStepsFromCampaign(campaignData) as IvrRenderScript;
      if (!script || !script.blocks || !script.pages) {
        throw new Error("Invalid script structure");
      }
      const workspace = campaignData.workspace as string;
      const currentPage = script.pages[pageId];
      const currentBlock = currentPage?.blocks.includes(blockId)
        ? script.blocks[blockId]
        : undefined;

      if (currentBlock) {
        await renderIvrBlock({
          twiml,
          block: currentBlock,
          pageId,
          blockId,
          script,
          workspace,
          buildActionUrl: (p, b) => `${baseUrl}/api/ivr/${campaignId}/${p}/${b}/response`,
          buildBlockUrl: (p, b) => `${baseUrl}/api/ivr/${campaignId}/${p}/${b}`,
        });
      } else {
        twiml.say("There was an error in the IVR flow. Goodbye.");
        twiml.hangup();
      }
    } catch (e) {
      logger.error("IVR Error:", e);
      twiml.say("An error occurred. Please try again later.");
      twiml.hangup();
    }

    return new Response(twiml.toString(), {
      headers: { "Content-Type": "application/xml" },
    });
  },
});
