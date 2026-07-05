import { findActiveHandsetSessionClientIdentity } from "@/lib/handset/handset-session.server";
import { logger } from "@/lib/logger.server";
import { findWorkspaceNumberByPhoneNumber } from "@/lib/inbound-call-db.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import Twilio from "twilio";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const formData = await request.clone().formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const called = params.Called?.trim() ?? "";

  const forbidden = await requireTwilioSignature(request, { phoneNumber: called });
  if (forbidden) return forbidden;

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
};
