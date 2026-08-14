import { env } from "@/lib/env.server";
import { isEmail } from "@/lib/utils";
import {
  appendInboundVoicemailTwiml,
  resolveInboundVoicemailAudio,
} from "@/lib/inbound-voicemail-twiml.server";
import { findWorkspaceNumberInboundFallbackByPhone } from "@/lib/inbound-call-db.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { defineAction } from "@/lib/handler.server";
import { createVoiceResponse } from "@/lib/twilio-twiml.server";

type DialEndAuth = { called: string; dialCallStatus: string };

export const action = defineAction({
  auth: async ({ request }): Promise<DialEndAuth | Response> => {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }

    const formData = await request.clone().formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const called = (params.Called ?? params.To ?? "").trim();
    const dialCallStatus = String(params.DialCallStatus ?? "").toLowerCase();

    const forbidden = await requireTwilioSignature(request, { phoneNumber: called });
    if (forbidden) return forbidden;

    return { called, dialCallStatus };
  },
  sideEffects: ["db-read", "twilio"],
  handler: async ({ auth }) => {
    const { called, dialCallStatus } = auth;

    const twiml = createVoiceResponse();

    if (dialCallStatus === "no-answer" || dialCallStatus === "busy" || dialCallStatus === "failed") {
      const number = await findWorkspaceNumberInboundFallbackByPhone(called);
      const workspaceId = number?.workspaceId ?? null;
      const inboundAction = number?.inbound_action ?? null;

      if (workspaceId && inboundAction && isEmail(inboundAction)) {
        const voicemail = await resolveInboundVoicemailAudio({
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
  },
});
