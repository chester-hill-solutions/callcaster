import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { loadInboundIvrBlockContext } from "@/lib/inbound-ivr-db.server";
import { createVoiceResponse, hangupTwiml } from "@/lib/twilio-twiml.server";
import { requireTwilioSignatureForIvrBlock } from "@/lib/ivr-webhook-auth.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";
import { renderIvrBlock, type IvrRenderScript } from "@/lib/ivr-block-render.server";

export const action = defineAction({
  auth: ({ request, params }) =>
    requireTwilioSignatureForIvrBlock(request, [params.numberId, params.pageId, params.blockId]),
  sideEffects: ["db-read", "external"],
  handler: async ({ params, auth }) => {
  const baseUrl = env.BASE_URL();
  const twiml = createVoiceResponse();
  const { pageId, blockId, numberId } = params as {
    pageId: string;
    blockId: string;
    numberId: string;
  };
  const { callSid } = auth;

  try {
    const call = await findCallBySid(callSid);
    if (!call?.to) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const context = await loadInboundIvrBlockContext(Number(numberId));
    if (!context || call.to !== context.number.phoneNumber) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const { script, number } = context;
    const currentPage = script.pages[pageId];
    const currentBlock = currentPage?.blocks.includes(blockId)
      ? (script.blocks[blockId] as IvrRenderScript["blocks"][string] | undefined)
      : undefined;

    if (currentBlock) {
      await renderIvrBlock({
        twiml,
        block: currentBlock,
        pageId,
        blockId,
        script: script as IvrRenderScript,
        workspace: number.workspaceId,
        buildActionUrl: (p, b) => `${baseUrl}/api/inbound-ivr/${numberId}/${p}/${b}/response`,
        buildBlockUrl: (p, b) => `${baseUrl}/api/inbound-ivr/${numberId}/${p}/${b}`,
      });
    } else {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
    }
  } catch (e) {
    logger.error("Inbound IVR Error:", e);
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
  },
});
