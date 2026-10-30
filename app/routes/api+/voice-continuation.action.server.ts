import { z } from "zod";
import { defineAction } from "@/lib/handler.server";
import { requireTwilioSignature, resolveCanonicalTwilioWebhookUrl, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { normalizeVerifiedVoiceParams } from "@/lib/twilio/verified-voice-params";
import { VoiceAudioBindingError } from "@/lib/voice-audio-connection";
import { voiceContinuationTwiml } from "@/lib/voice-continuation.server";
import { bindVoiceContinuation, findVoiceContinuationOwner } from "@/server/voice-continuation.server";
import { logger } from "@/lib/logger.server";

const querySchema = z.strictObject({ credit_reservation: z.uuid() });

export const action = defineAction({
  auth: async ({ request }) => {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => query.getAll(key).length !== 1)) return twilioWebhookForbiddenHangup();
    const parsed = querySchema.safeParse(Object.fromEntries(query));
    if (!parsed.success) return twilioWebhookForbiddenHangup();
    const owner = await findVoiceContinuationOwner(parsed.data.credit_reservation);
    if (!owner) return twilioWebhookForbiddenHangup();
    const form = await request.clone().formData(), params: Record<string, string> = {};
    for (const [key, value] of form) {
      if (typeof value !== "string" || form.getAll(key).length !== 1) return twilioWebhookForbiddenHangup();
      params[key] = value;
    }
    const denied = await requireTwilioSignature(request, { workspaceId: owner.workspace, params });
    if (denied) return denied;
    if (!normalizeVerifiedVoiceParams(params)) return twilioWebhookForbiddenHangup();
    return { owner, params };
  },
  sideEffects: ["db-read", "twilio"],
  handler: async ({ request, auth }) => {
    try {
      const bound = await bindVoiceContinuation(auth.owner, auth.params, resolveCanonicalTwilioWebhookUrl(request));
      return new Response(await voiceContinuationTwiml(bound), { headers: { "Content-Type": "text/xml" } });
    } catch (error) {
      if (error instanceof VoiceAudioBindingError) return twilioWebhookForbiddenHangup();
      logger.error("voice_audio.parent_continuation_failed", { reservationId: auth.owner.id, error });
      return Response.json({ error: "Unable to continue the agent audio" }, { status: 500 });
    }
  },
});
