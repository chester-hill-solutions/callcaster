import { logger } from "@/lib/logger.server";
import { rpcResetCampaign } from "@/lib/db-rpc.server";
import { db } from "@/server/db";
import { requireJsonAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {

    const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
    const formData = await request.formData();
    const campaign_id = formData.get("campaign_id");
    
    if (!campaign_id || typeof campaign_id !== 'string') {
        return { error: 'Missing campaign_id' };
    }
    
    const campaignIdNum = parseInt(campaign_id, 10);
    if (isNaN(campaignIdNum)) {
        return { error: 'Invalid campaign_id' };
    }

    try {
      await rpcResetCampaign(db, campaignIdNum);
    } catch (error) {
      logger.error("Error resetting campaign:", error);
      throw error;
    }
    return { success: true }
}
