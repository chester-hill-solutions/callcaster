import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { rpcResetCampaign } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { resolveCampaignWorkspaceId } from "@/lib/platform-telephony.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { AppError } from "@/lib/errors.server";
import { defineAction } from "@/lib/handler.server";

import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: ({ request }: ActionFunctionArgs) => requireJsonAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {

    const user = auth.user;
    if (!user) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }
    const formData = await request.formData();
    const campaign_id = formData.get("campaign_id");
    
    if (!campaign_id || typeof campaign_id !== 'string') {
        return routeData({ error: 'Missing campaign_id' }, { status: 400 });
    }
    
    const campaignIdNum = parseInt(campaign_id, 10);
    if (isNaN(campaignIdNum)) {
        return routeData({ error: 'Invalid campaign_id' }, { status: 400 });
    }

    const workspaceId = await resolveCampaignWorkspaceId(campaignIdNum);
    if (!workspaceId) {
        return routeData({ error: 'Campaign not found' }, { status: 404 });
    }
    const tdb = createTenantDb(workspaceId);

    try {
      await requireWorkspaceAccess({ user, workspaceId });
      await rpcResetCampaign(tdb, campaignIdNum);
    } catch (error) {
      logger.error("Error resetting campaign:", error);
      if (error instanceof AppError) {
        return routeData({ error: error.message }, { status: error.statusCode });
      }
      throw error;
    }
    return routeData({ success: true });
  },
});
