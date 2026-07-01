import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { requireWorkspaceAccess, safeParseJson } from "@/lib/database.server";
import { createErrorResponse } from "@/lib/errors.server";
import {
  resolveCampaignWorkspaceId,
  resolveContactWorkspaceId,
} from "@/lib/platform-telephony.server";
import { requeueAllCampaignQueueForCampaign } from "@/lib/campaign-queue-db.server";
import { rpcDequeueContact } from "@/lib/db-rpc.server";
import { db } from "@/server/db";
import { jsonError } from "@/lib/platform-api.server";
import { logger } from "@/lib/logger.server";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";

type DequeueRequest = { contact_id: string | number; household: boolean };
type ResetRequest = { campaignId: string | number };

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
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

      await rpcDequeueContact(db, {
        contactId: Number(contact_id),
        groupOnHousehold: household,
        dequeuedById: auth.user.id,
        dequeuedReasonText: "Manually dequeued by user",
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
};
