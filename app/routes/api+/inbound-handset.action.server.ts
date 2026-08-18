import { findActiveHandsetSessionClientIdentity } from "@/lib/handset/handset-session.server";
import { logger } from "@/lib/logger.server";
import { findWorkspaceNumberByPhoneNumber } from "@/lib/inbound-call-db.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { defineAction } from "@/lib/handler.server";
import { createVoiceResponse, sayHangupTwiml } from "@/lib/twilio-twiml.server";

/** Fallback TwiML returned when the handler throws unexpectedly, so Twilio
 * hears a graceful message instead of an HTML error page. */
function handsetUnavailableTwiml(): Response {
  return new Response(
    sayHangupTwiml("We're unable to take your call right now. Please try again later."),
    {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    },
  );
}

type InboundHandsetAuth = { called: string };

export const action = defineAction({
  auth: async ({ request }): Promise<InboundHandsetAuth | Response> => {
    try {
      const formData = await request.clone().formData();
      const params = Object.fromEntries(formData.entries()) as Record<string, string>;
      const called = params.Called?.trim() ?? "";

      const forbidden = await requireTwilioSignature(request, { phoneNumber: called });
      if (forbidden) return forbidden;

      return { called };
    } catch (error) {
      logger.error("Unhandled error in api.inbound-handset", {
        error: error instanceof Error ? error.message : String(error),
      });
      return handsetUnavailableTwiml();
    }
  },
  sideEffects: ["db-read", "twilio"],
  handler: async ({ auth }) => {
    try {
      const twiml = createVoiceResponse();
      const { called } = auth;

      if (!called) {
        logger.debug("Inbound handset: missing called number", { called });
        twiml.say("This number is not configured for handset.");
        twiml.hangup();
        return new Response(twiml.toString(), {
          headers: { "Content-Type": "text/xml" },
        });
      }

      const numberRow = await findWorkspaceNumberByPhoneNumber(called);
      if (!numberRow?.handset_enabled) {
        logger.debug("Inbound handset: number not handset-enabled", { called });
        twiml.say("This number is not configured for handset.");
        twiml.hangup();
        return new Response(twiml.toString(), {
          headers: { "Content-Type": "text/xml" },
        });
      }

      const workspaceId = numberRow.workspaceId;
      const clientIdentity = await findActiveHandsetSessionClientIdentity(workspaceId);

      if (!clientIdentity) {
        twiml.say("No one is available to take your call. Please try again later.");
        twiml.hangup();
        return new Response(twiml.toString(), {
          headers: { "Content-Type": "text/xml" },
        });
      }

      twiml.dial().client(clientIdentity);

      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    } catch (error) {
      logger.error("Unhandled error in api.inbound-handset", {
        error: error instanceof Error ? error.message : String(error),
      });
      return handsetUnavailableTwiml();
    }
  },
});
