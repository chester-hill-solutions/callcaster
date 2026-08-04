import { handleAcdRouterRequest } from "@/lib/acd/acd-router.server";
import { logger } from "@/lib/logger.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { defineAction } from "@/lib/handler.server";
import Twilio from "twilio";

/** Fallback TwiML returned when the handler throws unexpectedly, so Twilio
 * hears a graceful message instead of an HTML error page. */
function acdRouterUnavailableTwiml(): Response {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.say("We're unable to take your call right now. Please try again later.");
  twiml.hangup();
  return new Response(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/** Twilio ACD wait URL — default `/api/acd-router`. */
export const action = defineAction({
  auth: async ({ request }) => {
    try {
      const formData = await request.clone().formData();
      const callSid = String(formData.get("CallSid") ?? "");
      const forbidden = await requireTwilioSignature(request, callSid ? { callSid } : {});
      return forbidden ?? null;
    } catch (error) {
      logger.error("Unhandled error in api.acd-router", {
        error: error instanceof Error ? error.message : String(error),
      });
      return acdRouterUnavailableTwiml();
    }
  },
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request }) => {
    try {
      return await handleAcdRouterRequest(request, "wait");
    } catch (error) {
      logger.error("Unhandled error in api.acd-router", {
        error: error instanceof Error ? error.message : String(error),
      });
      return acdRouterUnavailableTwiml();
    }
  },
});
