import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { safeParseJson } from "@/lib/request-utils.server";
import { createErrorResponse } from "@/lib/errors.server";
import {
  resolveCampaignWorkspaceId,
  resolveContactWorkspaceId,
} from "@/lib/platform-telephony.server";
import { requeueAllCampaignQueueForCampaign } from "@/lib/campaign-queue-updates.server";
import { jsonError } from "@/lib/platform-api.server";
import { logger } from "@/lib/logger.server";
import { data as routeData } from "react-router";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { queueAdvanceRequestSchema } from "@/lib/schemas/api/queue-advance";
import { advanceCallScreenQueue } from "@/server/call-screen-queue-advance.server";
import { VOICE_AUDIO_ACTOR_HEADER } from "@/lib/voice-audio-connection";
type ResetRequest = { campaignId: string | number };

export const action = defineAction({
  auth: ({ request }: ActionFunctionArgs) => requireJsonAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
  try {
    if (request.method === "POST") {
      const body = await parseJsonBodyOrResponse(request, queueAdvanceRequestSchema);
      if (body instanceof Response) return body;
      const { contact_id, campaign_id } = body;
      const workspaceId = await resolveCampaignWorkspaceId(campaign_id);

      if (!workspaceId) {
        return jsonError("Contact queue entry not found", 404);
      }

      await requireWorkspaceAccess({ user: auth.user,
        workspaceId,
      });

      if (workspaceId !== body.workspace_id) return jsonError("Contact queue entry not found", 404);
      if (request.headers.get(VOICE_AUDIO_ACTOR_HEADER) !== auth.user.id)
        return routeData({ error: "The signed-in agent changed. Check this contact again.", code: "actor_changed" }, { status: 409 });

      if (await resolveContactWorkspaceId(contact_id) !== workspaceId) {
        return jsonError("Contact queue entry not found", 404);
      }

      const result = await advanceCallScreenQueue(body, auth.user.id);
      if (!result.ok) {
        if (result.reason === "not_found") return jsonError("Contact queue entry not found", 404);
        const message = result.reason === "assigned_elsewhere" ? "This contact is assigned to another agent."
          : "This queue entry changed. Check the contact before you continue.";
        logger.info("queue.dequeue_conflict", { contactId: contact_id, workspaceId, userId: auth.user.id });
        return routeData({ error: message, code: result.reason }, { status: 409 });
      }
      return routeData({ success: true, dequeued: result.dequeued, advance_state: result.advance_state, ...body, user_id: auth.user.id });
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

      const data = await requeueAllCampaignQueueForCampaign(Number(campaignId), workspaceId);

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
