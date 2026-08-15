import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { safeParseJson } from "@/lib/request-utils.server";
import { createErrorResponse } from "@/lib/errors.server";
import {
  resolveCampaignWorkspaceId,
  resolveContactWorkspaceId,
} from "@/lib/platform-telephony.server";
import {
  dequeueQueueEntry,
  requeueAllCampaignQueueForCampaign,
} from "@/lib/campaign-queue-db.server";
import { jsonError } from "@/lib/platform-api.server";
import { logger } from "@/lib/logger.server";
import { data as routeData } from "react-router";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

type DequeueRequest = { contact_id: string | number; household: boolean };
type ResetRequest = { campaignId: string | number };

export const action = defineAction({
  auth: ({ request }: ActionFunctionArgs) => requireJsonAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
  try {
    if (request.method === "POST") {
      const { contact_id, household }: DequeueRequest = await safeParseJson(request);
      const workspaceId = await resolveContactWorkspaceId(contact_id);

      if (!workspaceId) {
        return jsonError("Contact queue entry not found", 404);
      }

      await requireWorkspaceAccess({ user: auth.user,
        workspaceId,
      });

      await dequeueQueueEntry({
        by: { contactId: Number(contact_id) },
        workspaceId,
        household,
        userId: auth.user.id,
        reason: "Manually dequeued by user",
      });

      return routeData({ success: true });
    }

    if (request.method === "DELETE") {
      const { campaignId }: ResetRequest = await safeParseJson(request);
      const workspaceId = await resolveCampaignWorkspaceId(campaignId);

      if (!workspaceId) {
        return jsonError("Campaign not found", 404);
      }

      await requireWorkspaceAccess({ user: auth.user,
        workspaceId,
      });

      const data = await requeueAllCampaignQueueForCampaign(Number(campaignId));

      return routeData({
        message: "Campaign queue items reset successfully",
        affected_rows: data.length,
      });
    }

    return jsonError("Method not allowed", 405);
  } catch (error) {
    return createErrorResponse(error, "Queue action failed");
  }
  },
});
