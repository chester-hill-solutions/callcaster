import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { requireWorkspaceAccess, safeParseJson } from "@/lib/database.server";
import { createErrorResponse } from "@/lib/errors.server";
import {
  resolveCampaignWorkspaceId,
  resolveContactWorkspaceId,
} from "@/lib/platform-telephony.server";
import { buildQueuedQueueUpdate } from "@/lib/queue-status";
import { jsonError } from "@/lib/platform-api.server";
import { logger } from "@/lib/logger.server";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";

type DequeueRequest = { contact_id: string | number; household: boolean };
type ResetRequest = { campaignId: string | number };

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const supabase = getAuthSupabaseClient(auth);

  try {
    if (request.method === "POST") {
      const { contact_id, household }: DequeueRequest = await safeParseJson(request);
      const workspaceId = await resolveContactWorkspaceId(supabase, contact_id);

      if (!workspaceId) {
        return jsonError("Contact queue entry not found", 404);
      }

      await requireWorkspaceAccess({ supabaseClient: supabase,
        user: auth.user,
        workspaceId,
      });

      const { data, error } = await supabase.rpc("dequeue_contact", {
        passed_contact_id: Number(contact_id),
        group_on_household: household,
        dequeued_by_id: auth.user.id,
        dequeued_reason_text: "Manually dequeued by user",
      });

      if (error) {
        logger.error("Error updating campaign queue:", error);
        return routeData({ error: error.message }, { status: 500 });
      }

      return routeData(data);
    }

    if (request.method === "DELETE") {
      const { campaignId }: ResetRequest = await safeParseJson(request);
      const workspaceId = await resolveCampaignWorkspaceId(supabase, campaignId);

      if (!workspaceId) {
        return jsonError("Campaign not found", 404);
      }

      await requireWorkspaceAccess({ supabaseClient: supabase,
        user: auth.user,
        workspaceId,
      });

      const { data, error } = await supabase
        .from("campaign_queue")
        .update(buildQueuedQueueUpdate())
        .eq("campaign_id", Number(campaignId))
        .select();

      if (error) {
        logger.error("Error resetting campaign queue items:", error);
        return routeData({ error: error.message }, { status: 500 });
      }

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
