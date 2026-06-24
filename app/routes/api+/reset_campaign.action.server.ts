import { logger } from "@/lib/logger.server";
import { getAuthSupabaseClient, requireJsonAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {

    const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  const supabaseClient = getAuthSupabaseClient(auth);
  const user = auth.user;
    const formData = await request.formData();
    const campaign_id = formData.get("campaign_id");
    
    if (!campaign_id || typeof campaign_id !== 'string') {
        return { error: 'Missing campaign_id' };
    }
    
    const campaignIdNum = parseInt(campaign_id, 10);
    if (isNaN(campaignIdNum)) {
        return { error: 'Invalid campaign_id' };
    }

    const rpcClient = supabaseClient as unknown as {
        rpc: (
            fn: string,
            args?: Record<string, unknown>,
        ) => Promise<{ error: unknown }>;
    };
    const { error } = await rpcClient.rpc("reset_campaign", { campaign_id_prop: campaignIdNum });
    if (error) { logger.error("Error resetting campaign:", error); throw error; }
    return { success: true }
}
