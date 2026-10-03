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
import {
  dequeueQueueEntry,
  explainDequeueNoOp
} from "@/lib/campaign-queue-db.server";
import { jsonError } from "@/lib/platform-api.server";
import { logger } from "@/lib/logger.server";
import { data as routeData } from "react-router";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";

const positiveId = z.union([
  z.number(),
  z.string().regex(/^[1-9]\d*$/).transform(Number),
]).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const dequeueRequest = z.object({
  contact_id: positiveId,
  campaign_id: positiveId,
  household: z.boolean(),
});
type ResetRequest = { campaignId: string | number };

export const action = defineAction({
  auth: ({ request }: ActionFunctionArgs) => requireJsonAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
  try {
    if (request.method === "POST") {
      const body = await parseJsonBodyOrResponse(request, dequeueRequest);
      if (body instanceof Response) return body;
      const { contact_id, campaign_id, household } = body;
      const workspaceId = await resolveCampaignWorkspaceId(campaign_id);

      if (!workspaceId) {
        return jsonError("Contact queue entry not found", 404);
      }

      await requireWorkspaceAccess({ user: auth.user,
        workspaceId,
      });

      if (await resolveContactWorkspaceId(contact_id) !== workspaceId) {
        return jsonError("Contact queue entry not found", 404);
      }

      const { dequeuedPrimary } = await dequeueQueueEntry({
        by: { contactId: contact_id, campaignId: campaign_id },
        workspaceId,
        household,
        userId: auth.user.id,
        reason: "Manually dequeued by user",
      });

      if (!dequeuedPrimary) {
        // The RPC's predicate only touches a row that is queued/null or
        // `assigned` to the caller — so nothing happened, and reporting
        // success left the row sitting in another agent's hands (#1278).
        // Which no-op it was decides whether this is worth telling the agent
        // about: re-dequeuing an already-dequeued contact is the manual-dial
        // "next contact" flow doing exactly what it should, since the hangup
        // route already dequeued it.
        const reason = await explainDequeueNoOp({
          contactId: Number(contact_id),
          campaignId: campaign_id,
          workspaceId,
          userId: auth.user.id,
        });

        if (reason === "not_found") {
          return jsonError("Contact queue entry not found", 404);
        }

        if (reason === "assigned_elsewhere") {
          logger.info("queue.dequeue_conflict", {
            contactId: Number(contact_id),
            workspaceId,
            userId: auth.user.id,
          });
          return routeData(
            {
              error: "This contact is assigned to another agent.",
              code: "assigned_elsewhere",
            },
            { status: 409 },
          );
        }

        if (reason === "unknown") {
          return routeData(
            {
              error: "This contact could not be dequeued.",
              code: "not_dequeued",
            },
            { status: 409 },
          );
        }

        // already_dequeued — idempotent, not a conflict.
        return routeData({ success: true, dequeued: false });
      }

      return routeData({ success: true, dequeued: true });
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
