import { resolveIvrCallUrls } from "@/lib/twilio-ivr-runtime.server";
import { ivrMachineDetection } from "@/lib/ivr-machine-detection";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { data as routeData } from "react-router";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import { AppError, ErrorCode, createErrorResponse } from "@/lib/errors.server";
import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import {
  outboundCreditsResponse,
  requireOutboundCredits,
} from "@/lib/outbound-credit-gate.server";
import { logger } from "@/lib/logger.server";
import { dispatchReservedVoiceCall, ivrQueueVoiceOperationKey, voiceDispatchBlockedResponse } from "@/lib/voice-credit-dispatch.server";
import { requireJsonAuth } from "@/lib/api-auth.server";

import { rpcCreateOutreachAttempt } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { callerIdRefusalMessage, resolveCallerIdUsability } from "@/lib/caller-id-usability.server";
import { defineAction } from "@/lib/handler.server";
import { voiceBillingKindFromCampaignType } from "@/lib/pricing";

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, auth }) => {
    const user = auth.user;
    const formData = await request.formData();

    const to_number = formData.get("to_number") as string;
    const campaign_id = formData.get("campaign_id") as string;
    const workspace_id = formData.get("workspace_id") as string;
    const contact_id = formData.get("contact_id") as string;
    const caller_id = formData.get("caller_id") as string;
    const queue_id = formData.get("queue_id") as string;
    const user_id = formData.get("user_id") as string;
    if (!workspace_id || !campaign_id || !contact_id || !caller_id || !queue_id || !user_id) {
      throw new AppError(
        "Missing required form data",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }
    try {
      await requireWorkspaceAccess({ user, workspaceId: workspace_id });

      // Recipient-local calling window (TCPA/CRTC 8am–9pm recipient time).
      // Return without dequeuing so the row stays `queued` for a later,
      // in-window run.
      const windowStatus = recipientCallingWindowStatus(to_number);
      if (!windowStatus.allowed) {
        logger.info("ivr.recipient_window_skip", {
          campaignId: campaign_id,
          queueId: queue_id,
          timezone: windowStatus.timezone,
          reason: windowStatus.reason,
        });
        return routeData(
          { skipped: true, reason: "outside_recipient_calling_window" },
          { status: 200 },
        );
      }

      const credits = await requireOutboundCredits(workspace_id);
      if (!credits.ok) return outboundCreditsResponse(credits);

      // Same rule as every other send path: the workspace must own the number
      // it is dialling from, and it must not be suspended for an unpaid rental.
      const refusal = callerIdRefusalMessage(
        await resolveCallerIdUsability(workspace_id, caller_id),
      );
      if (refusal) throw new Response(refusal, { status: 400 });

      const campaign = await findCampaignInWorkspace(workspace_id, campaign_id);
      if (!campaign) throw new AppError("Campaign not found", 404, ErrorCode.NOT_FOUND);
      const twilio = await createWorkspaceTwilioInstance({ workspace_id });
      const ivrUrls = resolveIvrCallUrls(campaign_id);
      const dispatched = await dispatchReservedVoiceCall({
        workspaceId: workspace_id, kind: voiceBillingKindFromCampaignType(campaign.type), accountSid: twilio.accountSid,
        to: to_number, from: caller_id, campaignId: Number(campaign_id),
        contactId: Number(contact_id), queueId: Number(queue_id), userId: user_id,
        operationKey: ivrQueueVoiceOperationKey(Number(queue_id)),
        voiceUrl: ivrUrls.flowUrl, statusCallback: ivrUrls.statusCallback,
        prepareOutreach: (tx) => rpcCreateOutreachAttempt(createTenantDb(workspace_id, tx), {
          contactId: Number(contact_id), campaignId: Number(campaign_id), userId: user_id,
          workspaceId: workspace_id, queueId: Number(queue_id),
        }),
        create: ({ voiceUrl, statusCallback }) =>
          twilio.calls.create({
            to: to_number,
            from: caller_id,
            url: voiceUrl,
            machineDetection: ivrMachineDetection(campaign),
            statusCallbackEvent: ["answered", "completed"],
            statusCallback,
          }),
      });
      if (!dispatched.ok) return voiceDispatchBlockedResponse(dispatched);
      const { callSid } = dispatched;

      // Dequeue. The queue row must belong to the workspace this request was
      // authorised against, so the by-id dequeue is scoped to it.
      await dequeueQueueEntry({
        by: { id: Number(queue_id) },
        userId: user_id,
        workspaceId: workspace_id,
        reason: "IVR dial dispatched",
      });

      return new Response(JSON.stringify({ success: true, callSid }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: unknown) {
      logger.error("Error processing IVR request:", error);
      return createErrorResponse(error, "Error processing IVR request");
    }
  },
});
