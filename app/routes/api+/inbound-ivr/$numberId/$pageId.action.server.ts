import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { loadInboundIvrPageContext } from "@/lib/inbound-ivr-db.server";
import { hangupTwiml } from "@/lib/twilio-twiml.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { findCallBySid } from "@/lib/telephony-db.server";
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

  const forbidden = await requireTwilioSignature(request, { callSid });
  if (forbidden) return forbidden;

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
};
