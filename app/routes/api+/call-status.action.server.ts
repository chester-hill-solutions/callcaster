import {
  buildCallUpsertFromTwilioParams,
  processCallStatusWebhook,
  resolveCallOutreachContext,
  twilioParamsToUnderCase,
} from "@/lib/twilio-call-status.server";
import { canTransitionOutreachDisposition } from "@/lib/outreach-disposition";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import {
  findOutreachAttemptWithCampaignType,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { emitPredictiveBroadcast } from "@/lib/workspace-events.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

type CallStatusAuth = {
  params: Record<string, string>;
  callSid: string | null;
};

export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs): Promise<CallStatusAuth | Response> => {
    const formData = await request.formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const callSidRaw = params.CallSid ?? params.call_sid;
    if (!callSidRaw) {
      return { params, callSid: null };
    }

    const forbidden = await requireTwilioSignature(request, { callSid: callSidRaw });
    if (forbidden) return forbidden;

    return { params, callSid: callSidRaw };
  },
  sideEffects: ["db-write", "credit"],
  handler: async ({ auth }) => {
    const { params, callSid: callSidRaw } = auth;
    if (!callSidRaw) {
      return routeData({ error: "Missing CallSid" }, { status: 400 });
    }

    const underCaseData = twilioParamsToUnderCase(params);
    const updateData = buildCallUpsertFromTwilioParams(params);

    // Persist the call and run billing first. The upserted call row is the
    // source of truth for workspace/outreach context (it may have inherited a
    // parent call leg or been created by a dial endpoint).
    const { call: callRow } = await processCallStatusWebhook(updateData, {});

    const { outreachAttemptId, workspaceId } = await resolveCallOutreachContext(callRow);

    const currentAttempt =
      outreachAttemptId != null && workspaceId
        ? await findOutreachAttemptWithCampaignType(workspaceId, outreachAttemptId)
        : null;

    const billingWorkspace = currentAttempt?.workspace ?? workspaceId;
    if (currentAttempt && billingWorkspace) {
      await emitPredictiveBroadcast(billingWorkspace, {
        contact_id: currentAttempt.contact_id,
        status: String(underCaseData.call_status ?? ""),
      });
    }

    const nextDisposition = String(underCaseData.call_status || "").toLowerCase();
    if (outreachAttemptId != null && workspaceId && nextDisposition) {
      const currentDisposition = currentAttempt?.disposition ?? null;
      if (canTransitionOutreachDisposition(currentDisposition, nextDisposition)) {
        const result = await updateOutreachAttemptForWorkspace(
          workspaceId,
          outreachAttemptId,
          { disposition: nextDisposition },
        );

        if (result instanceof Response) {
          logger.error("Error updating attempt:", result.statusText);
          return routeData({ success: false, error: "Failed to update attempt" }, { status: 500 });
        }
      } else {
        logger.debug("Skipping outreach disposition transition", {
          currentDisposition,
          nextDisposition,
        });
      }
    }

    return routeData({ success: true });
  },
});
