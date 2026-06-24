import { createSupabaseServerClient } from "@/lib/supabase.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess, safeParseJson } from "@/lib/database.server";
import { getAuthSupabaseClient, requireJsonAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";
import type { Json } from "@/lib/database.types";

interface RequestData {
  update?: Json;
  contact_id: number;
  campaign_id: number;
  workspace: string;
  disposition: string;
  queue_id: number;
}

export const action = async ({ request }: ActionFunctionArgs) => {

    const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = createSupabaseServerClient(request);
  const supabase = getAuthSupabaseClient(auth);
  const user = auth.user;
    const { update, contact_id, campaign_id, workspace, disposition, queue_id }: RequestData = await safeParseJson(request);
    await requireWorkspaceAccess({ supabaseClient: supabase, user, workspaceId: workspace });
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentOutreach, error: searchError } = await supabase
        .from('outreach_attempt')
        .select()
        .eq('contact_id', contact_id)
        .eq("campaign_id", campaign_id)
        .gte('created_at', tenMinutesAgo)       
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (searchError && searchError.code !== 'PGRST116') {
        logger.error("Error searching for recent outreach:", searchError);
        return routeData({ error: searchError }, { status: 500, headers });
    }

    let outreachAttemptId: number | null = null;

    if (recentOutreach) {
        const { data, error } = await supabase
            .from('outreach_attempt')
            .update({
                ...(update !== undefined ? { result: update as Json } : {}),
                disposition,
                user_id: user.id
            })
            .eq('id', recentOutreach.id)
            .select();

        if (error) {
            logger.error("Error updating outreach attempt:", error);
            return routeData({ error }, { status: 500, headers });
        }
        outreachAttemptId = data[0]?.id ?? null;
    } else {
        const { data, error } = await supabase.rpc('create_outreach_attempt', {
            con_id: contact_id,
            cam_id: campaign_id,
            queue_id,
            wks_id: workspace,
            usr_id: user.id
        });

        if (error) {
            logger.error("Error creating outreach attempt:", error);
            return routeData({ error }, { status: 500, headers });
        }
        outreachAttemptId = typeof data === 'number' ? data : Number(data);
    }
    const { data: updatedOutreach, error: updateError } = await supabase
        .from('outreach_attempt')
        .update({
            ...(update !== undefined ? { result: update as Json } : {}),
            disposition
        })
        .eq('id', outreachAttemptId as number)
        .select();

    if (updateError) {
        logger.error("Error updating outreach attempt:", updateError);
        return routeData({ error: updateError }, { status: 500, headers });
    }

    return routeData(updatedOutreach[0], { headers });
}
