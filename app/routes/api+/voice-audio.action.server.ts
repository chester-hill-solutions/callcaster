import { z } from "zod";
import { defineAction } from "@/lib/handler.server";
import { handleVerifiedVoiceAudioWebhook } from "@/lib/voice-audio-webhook.server";
import { readTwilioWebhookStringParams, requireTwilioSignature, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { normalizeVerifiedVoiceParams } from "@/lib/twilio/verified-voice-params";
import { findVoiceAudioConnection } from "@/server/voice-audio-connection.server";

const querySchema = z.strictObject({ connection: z.uuid(), event: z.enum(["voice", "status", "conference"]) });

export const action = defineAction({
  auth: async ({ request }) => {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => query.getAll(key).length !== 1)) return twilioWebhookForbiddenHangup();
    const parsed = querySchema.safeParse(Object.fromEntries(query));
    if (!parsed.success) return twilioWebhookForbiddenHangup();
    const owner = await findVoiceAudioConnection(parsed.data.connection);
    if (!owner) return twilioWebhookForbiddenHangup();
    const params = await readTwilioWebhookStringParams(request);
    if (!params) return twilioWebhookForbiddenHangup();
    const denied = await requireTwilioSignature(request, { workspaceId: owner.workspace, expectedAccountSid: owner.account_sid, params });
    if (denied) return denied;
    if (!normalizeVerifiedVoiceParams(params) || params.AccountSid !== owner.account_sid) return twilioWebhookForbiddenHangup();
    return { owner, params, event: parsed.data.event };
  },
  sideEffects: ["twilio", "db-read", "db-write"],
  handler: ({ request, auth }) => handleVerifiedVoiceAudioWebhook(request, auth),
});
