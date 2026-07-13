import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { releaseAssignedQueueForUser } from "@/lib/campaign-queue-db.server";
import {
  handleCall,
  handleConference,
  handleContact,
  handleQueue,
} from "@/lib/callscreenActions";
import {
  normalizeProviderStatus,
  getStateMachineAction,
} from "@/lib/call-status";
import { checkSchedule } from "@/lib/database/campaign.server";
import { getUserRole } from "@/lib/database/workspace.server";
import { generateToken } from "@/lib/twilio-token.server";
import { playTone } from "@/lib/utils";
import { redirect } from "react-router";
import { Tables } from "@/lib/db-types";
import type {
  LoaderData,
  QueueItem,
  OutreachAttempt,
  UseWorkspaceRealtimeProps,
  AppUser,
  BaseUser,
  ActiveCall,
  CampaignDetails
} from "@/lib/types";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ params, auth }) => {
    const { campaign_id } = params;

    const { headers, user, workspaceId, userRole } = auth;
    if (!user || !campaign_id) {
      throw redirect("/signin");
    }
    const result = await releaseAssignedQueueForUser(
      user.id,
      campaign_id,
    );

    if (!result.ok) {
      logger.error("Error releasing assigned campaign queue rows:", result.error);
      throw new Error(result.error);
    }

    return redirect("/workspaces", { headers });
  },
});
