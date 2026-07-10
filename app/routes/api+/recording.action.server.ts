import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { updateCallRecordingUrlBySid } from "@/lib/telephony-db.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSid = params.CallSid?.trim();

  if (!callSid) {
    return routeData({ error: "Missing CallSid" }, { status: 400 });
  }

  const forbidden = await requireTwilioSignature(request, { callSid });
  if (forbidden) return forbidden;

  const recordingUrl = params.RecordingUrl?.trim();
  if (recordingUrl) {
    try {
      const updated = await updateCallRecordingUrlBySid(callSid, recordingUrl);
      if (!updated) {
        logger.error("Recording webhook: call not found for CallSid", { callSid });
      }
    } catch (error) {
      logger.error("Recording webhook: failed to persist recording URL", {
        callSid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.debug("Recording webhook received", { data: params });
  return routeData(params);
};
