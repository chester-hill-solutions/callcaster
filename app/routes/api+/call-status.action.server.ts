import {
  buildCallUpsertFromTwilioParams,
  processCallStatusWebhook,
} from "@/lib/twilio-call-status.server";
import { data as routeData } from "react-router";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { defineAction } from "@/lib/handler.server";
import { enqueueJob } from "@/lib/worker/enqueue-job.server";
import { CALL_STATUS_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";
import type { ActionFunctionArgs } from "react-router";

type CallStatusAuth = {
  params: Record<string, string>;
  callSid: string | null;
};

function callStatusSideEffectsIdempotencyKey(
  callSid: string,
  status: string,
): string {
  return `call_status_side_effects:${callSid}:${status.toLowerCase()}`;
}

export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs): Promise<CallStatusAuth | Response> => {
    // Clone before reading — Bun yields empty params on re-read after consume.
    const formData = await request.clone().formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const callSidRaw = params.CallSid ?? params.call_sid;
    if (!callSidRaw) {
      return { params, callSid: null };
    }

    const forbidden = await requireTwilioSignature(request, {
      callSid: callSidRaw,
      params,
    });
    if (forbidden) return forbidden;

    return { params, callSid: callSidRaw };
  },
  // Sync upsert skips billing; the enqueued worker job debits terminal calls.
  sideEffects: ["db-write", "credit"],
  handler: async ({ auth }) => {
    const { params, callSid: callSidRaw } = auth;
    if (!callSidRaw) {
      return routeData({ error: "Missing CallSid" }, { status: 400 });
    }

    const updateData = buildCallUpsertFromTwilioParams(params);
    const { call } = await processCallStatusWebhook(updateData, { skipBilling: true });

    const status = String(call.status ?? params.CallStatus ?? params.call_status ?? "")
      .trim()
      .toLowerCase();

    await enqueueJob({
      type: CALL_STATUS_SIDE_EFFECTS_JOB_TYPE,
      workspaceId: call.workspace ?? null,
      idempotencyKey: callStatusSideEffectsIdempotencyKey(callSidRaw, status || "unknown"),
      params: {
        callSid: callSidRaw,
        twilioParams: params,
      },
    });

    return routeData({ success: true });
  },
});
