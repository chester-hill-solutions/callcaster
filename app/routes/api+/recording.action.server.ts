import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { updateCallRecordingUrlBySid } from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { RECORDING_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";
import type { ActionFunctionArgs } from "react-router";

type RecordingAuth = {
  params: Record<string, string>;
  callSid: string | null;
};

function recordingSideEffectsIdempotencyKey(
  callSid: string,
  recordingUrl: string,
): string {
  return `recording_side_effects:${callSid}:${recordingUrl}`;
}

export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs): Promise<RecordingAuth | Response> => {
    // Clone before reading — Bun yields empty params on re-read after consume.
    const formData = await request.clone().formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const callSid = params.CallSid?.trim();

    if (!callSid) {
      return { params, callSid: null };
    }

    const forbidden = await requireTwilioSignature(request, { callSid, params });
    if (forbidden) return forbidden;

    return { params, callSid };
  },
  sideEffects: ["db-write"],
  handler: async ({ auth }) => {
    const { params, callSid } = auth;

    if (!callSid) {
      return routeData({ error: "Missing CallSid" }, { status: 400 });
    }

    const recordingUrl = params.RecordingUrl?.trim();
    if (recordingUrl) {
      try {
        const updated = await updateCallRecordingUrlBySid(callSid, recordingUrl);
        if (!updated) {
          logger.error("Recording webhook: call not found for CallSid", { callSid });
        } else {
          await enqueueRegisteredJob({
            type: RECORDING_SIDE_EFFECTS_JOB_TYPE,
            workspaceId: updated.workspace ?? null,
            idempotencyKey: recordingSideEffectsIdempotencyKey(callSid, recordingUrl),
            params: {
              sid: callSid,
              twilioParams: params,
            },
          });
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
  },
});
