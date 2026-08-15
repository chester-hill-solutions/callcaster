import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { loadInboundIvrPageContext } from "@/lib/inbound-ivr-db.server";
import { createVoiceResponse, hangupTwiml } from "@/lib/twilio-twiml.server";
import { requireTwilioSignatureForIvrPage } from "@/lib/ivr-webhook-auth.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, unknown>;
}

export const action = defineAction({
  auth: ({ request, params }) =>
    requireTwilioSignatureForIvrPage(request, [params.numberId, params.pageId]),
  sideEffects: ["db-read"],
  handler: async ({ params, auth }) => {
  const twiml = createVoiceResponse();
  const { numberId, pageId } = params as { numberId: string; pageId: string };
  const { callSid } = auth;

  try {
    const call = await findCallBySid(callSid);
    if (!call?.to) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const context = await loadInboundIvrPageContext(Number(numberId));

    if (!context || call.to !== context.phoneNumber) {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const steps = context.steps as Script;
    const currentPage = steps.pages[pageId];
    if (currentPage && currentPage.blocks.length > 0) {
      const firstBlockId = currentPage.blocks[0];
      twiml.redirect(`/api/inbound-ivr/${numberId}/${pageId}/${firstBlockId}`);
    } else {
      twiml.say("There was an error in the IVR flow. Goodbye.");
      twiml.hangup();
    }
  } catch (e) {
    logger.error("Error processing inbound IVR page:", e);
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
  },
});
