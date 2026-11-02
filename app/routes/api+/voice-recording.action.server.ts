import { z } from "zod";
import { defineAction } from "@/lib/handler.server";
import { logger } from "@/lib/logger.server";
import { readTwilioWebhookStringParams, requireTwilioSignature, resolveCanonicalTwilioWebhookUrl, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { VoiceRecordingBindingError, voiceRecordingReceiptFromParams } from "@/lib/voice-recording";
import { enqueueVoiceRecordingCopy } from "@/lib/voice-recording-copy.server";
import { findVoiceRecordingOperation } from "@/server/voice-recording-operation.server";
import { recordVoiceRecordingReceipt } from "@/server/voice-recording-receipt.server";
import { findVoiceCustomerRecordingLaunch } from "@/server/voice-customer-recording.server";
import { bindEarlyVoiceCustomerRecording } from "@/lib/voice-customer-recording.server";

const querySchema = z.strictObject({ recording: z.uuid() });

export const action = defineAction({
  auth: async ({ request }) => {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => query.getAll(key).length !== 1)) return twilioWebhookForbiddenHangup();
    const parsed = querySchema.safeParse(Object.fromEntries(query));
    if (!parsed.success) return twilioWebhookForbiddenHangup();
    const owner = await findVoiceRecordingOperation(parsed.data.recording);
    const launch = owner ? null : await findVoiceCustomerRecordingLaunch(parsed.data.recording);
    const context = owner ?? launch;
    if (!context) return twilioWebhookForbiddenHangup();
    const params = await readTwilioWebhookStringParams(request);
    if (!params) return twilioWebhookForbiddenHangup();
    const denied = await requireTwilioSignature(request, { workspaceId: context.workspace, expectedAccountSid: context.account_sid, params });
    if (denied) return denied;
    const receipt = voiceRecordingReceiptFromParams(params, resolveCanonicalTwilioWebhookUrl(request));
    return receipt ? { owner, launch, receipt } : twilioWebhookForbiddenHangup();
  },
  sideEffects: ["db-read", "db-write", "twilio"],
  handler: async ({ auth }) => {
    try {
      const owner = auth.owner ?? (auth.launch ? await bindEarlyVoiceCustomerRecording(auth.launch, auth.receipt) : null);
      if (!owner) return twilioWebhookForbiddenHangup();
      const saved = await recordVoiceRecordingReceipt(owner, auth.receipt);
      if (saved.provider_status === "completed") await enqueueVoiceRecordingCopy(saved);
      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof VoiceRecordingBindingError) return twilioWebhookForbiddenHangup();
      logger.error("voice_recording.receipt_failed", { operationId: auth.owner?.id ?? auth.launch?.customer_recording_id, error });
      return Response.json({ error: "Unable to save the recording event" }, { status: 500 });
    }
  },
});
