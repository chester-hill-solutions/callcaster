import { env } from "@/lib/env.server";
import { isEmail } from "@/lib/utils";
import {
  appendInboundVoicemailTwiml,
  resolveInboundVoicemailAudio,
} from "@/lib/inbound-voicemail-twiml.server";
import { findWorkspaceNumberInboundFallbackByPhone } from "@/lib/inbound-call-db.server";
import { validateTwilioWebhookForPhoneNumber } from "@/lib/twilio-webhook.server";
import Twilio from "twilio";
import type { ActionFunctionArgs } from "react-router";
import type { Database } from "@/lib/db-types";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response({ status: 405 });
  }

  const client = createClient<Database>(
    env.BASE_URL(),
    env.BASE_URL(),
  );

  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const called = (params.Called ?? params.To ?? "").trim();
  const dialCallStatus = String(params.DialCallStatus ?? "").toLowerCase();

  const validation = await validateTwilioWebhookForPhoneNumber({
    request,
    client,
    phoneNumber: called,
    params,
  });
  if (!validation.ok) {
    return validation.response;
  }

  const twiml = new Twilio.twiml.VoiceResponse();

  if (dialCallStatus === "no-answer" || dialCallStatus === "busy" || dialCallStatus === "failed") {
    const number = await findWorkspaceNumberInboundFallbackByPhone(called);
    const workspaceId = number?.workspaceId ?? null;
    const inboundAction = number?.inbound_action ?? null;

    if (workspaceId && inboundAction && isEmail(inboundAction)) {
      const voicemail = await resolveInboundVoicemailAudio({
        client,
        workspaceId,
        inboundAudio: number?.inbound_audio ?? null,
      });
      appendInboundVoicemailTwiml({
        twiml,
        phoneNumber: called,
        voicemailAudioUrl: voicemail?.signedUrl ?? null,
      });
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    twiml.say(
      { voice: "alice" },
      "No one is available to take your call. Please try again later.",
    );
  }

  twiml.hangup();

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
};
