import { data as routeData } from "react-router";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import { createErrorResponse } from "@/lib/errors.server";
import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { hasInsufficientCreditsForOutbound } from "../../../shared/credit-floor";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { requireJsonAuth } from "@/lib/api-auth.server";

import { rpcCreateOutreachAttempt } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { insertCallForWorkspace } from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";

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
      throw new Error("Missing required form data");
    }
    let outreachAttemptId;
    let call;
    const twilio = await createWorkspaceTwilioInstance({ workspace_id });

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

      const credits = await getWorkspaceCreditsBalance(workspace_id);
      if (credits === null) {
        return routeData({ error: "Workspace not found" }, { status: 404 });
      }
      if (hasInsufficientCreditsForOutbound(credits)) {
        return routeData({ creditsError: true }, { status: 402 });
      }

      const tdb = createTenantDb(workspace_id);
      outreachAttemptId = await rpcCreateOutreachAttempt(tdb, {
        contactId: Number(contact_id),
        campaignId: Number(campaign_id),
        userId: user_id,
        workspaceId: workspace_id,
        queueId: Number(queue_id),
      });

      call = await withTwilioRetry(
        () =>
          twilio.calls.create({
            to: to_number,
            from: caller_id,
            url: `${env.BASE_URL()}/api/ivr/${campaign_id}/page_1/`,
            machineDetection: "Enable",
            statusCallbackEvent: ["answered", "completed"],
            statusCallback: `${env.BASE_URL()}/api/ivr/status`,
          }),
        { workspaceId: workspace_id, operation: "calls.create" },
      );

      const callRow = await insertCallForWorkspace(workspace_id, {
        sid: call.sid,
        to: to_number,
        from: caller_id,
        campaign_id: Number(campaign_id),
        contact_id: Number(contact_id),
        outreach_attempt_id: Number(outreachAttemptId),
      });

      if (!callRow) throw new Error("Failed to insert call record");

      // Dequeue
      await dequeueQueueEntry({
        by: { id: Number(queue_id) },
        userId: user_id,
        reason: "IVR call completed",
      });

      return new Response(JSON.stringify({ success: true, callSid: call.sid }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: unknown) {
      logger.error("Error processing IVR request:", error);
      return createErrorResponse(error, "Error processing IVR request");
    }
  },
});
