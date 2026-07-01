import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { loadInboundIvrPageContext } from "@/lib/inbound-ivr-db.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import Twilio from "twilio";
import type { ActionFunctionArgs } from "react-router";

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, unknown>;
}

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const { numberId, pageId } = params as { numberId: string; pageId: string };
  const formData = await request.formData();
  const paramsObj = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSid = paramsObj.CallSid ?? null;

  if (!callSid || !numberId || !pageId) {
    return new Response("Missing required parameters", { status: 400 });
  }

  const validation = await validateTwilioWebhookForCallSid({
    request,
    callSid,
    params: paramsObj,
  });
  if (!validation.ok) {
    return validation.response;
  }

  try {
    const context = await loadInboundIvrPageContext(Number(numberId));

    if (!context) {
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
};
