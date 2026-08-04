import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import {
  deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds,
  getQueuedContactIdsForCampaign,
} from "@/lib/campaign-queue-db.server";
import {
  campaignAndAudienceShareWorkspace,
  deleteCampaignAudienceLink,
  findCampaignAudienceLink,
  insertCampaignAudienceLink,
  listCampaignAudienceIds,
  listContactIdsForAudience,
  listContactIdsForAudiences,
} from "@/lib/campaign-audience-db.server";
import { AppError } from "@/lib/errors.server";
import { logger } from "@/lib/logger.server";
import { safeParseJson } from "@/lib/request-utils.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { resolveCampaignWorkspaceId } from "@/lib/platform-telephony.server";
import { MemberRole } from "@/lib/member-role";
import { defineAction } from "@/lib/handler.server";

import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: ({ request }: ActionFunctionArgs) => requireDualAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
  const { headers } = await getSession(request);  const method = request.method;

  // This surface is declared session-only (api-surface-internal-1.ts), but
  // requireDualAuth also admits API keys — and an API key carries its own bound
  // workspace that requireWorkspaceAccess cannot check, since it has no user.
  // Reject those here so the declared exposure is actually true.
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401, headers });
  }

  /**
   * Shared preamble for both verbs: parse the ids, prove the caller may act on
   * the campaign, then prove the audience belongs with it.
   *
   * `campaignAndAudienceShareWorkspace` only proves the two *resources* match
   * each other — never that the caller belongs to that workspace. Without the
   * membership check the route links audiences onto other tenants' campaigns
   * and mass-enqueues their contacts for live dialing.
   */
  const resolveLinkRequest = async () => {
    const { audience_id, campaign_id } = await safeParseJson<{
      audience_id: string | number;
      campaign_id: string | number;
    }>(request);
    const audienceId = Number(audience_id);
    const campaignId = Number(campaign_id);
    if (!Number.isFinite(audienceId) || !Number.isFinite(campaignId)) {
      return {
        ok: false as const,
        response: routeData(
          { error: "Invalid audience_id or campaign_id" },
          { status: 400, headers },
        ),
      };
    }

    const workspaceId = await resolveCampaignWorkspaceId(campaignId);
    if (!workspaceId) {
      return {
        ok: false as const,
        response: routeData({ error: "Campaign or audience not found" }, { status: 404, headers }),
      };
    }
    await requireWorkspaceAccess({ user, workspaceId, minRole: MemberRole.Member });

    if (!(await campaignAndAudienceShareWorkspace(campaignId, audienceId))) {
      return {
        ok: false as const,
        response: routeData({ error: "Campaign or audience not found" }, { status: 404, headers }),
      };
    }

    return { ok: true as const, campaignId, audienceId };
  };

  try {
    if (method === "POST") {
      const resolved = await resolveLinkRequest();
      if (!resolved.ok) return resolved.response;
      const { campaignId, audienceId } = resolved;

      const existing = await findCampaignAudienceLink(campaignId, audienceId);
      if (existing) {
        return routeData({ success: true, message: "Audience already added to campaign" }, { headers });
      }

      await insertCampaignAudienceLink(campaignId, audienceId);

      const audienceContactIds = await listContactIdsForAudience(audienceId);
      let enqueued = 0;
      let skipped = 0;
      let warning: string | undefined;

      if (audienceContactIds.length > 0) {
        const existingContactIds = new Set(
          await getQueuedContactIdsForCampaign({
            campaignId,
            contactIds: audienceContactIds,
          }),
        );
        const contactIds = audienceContactIds.filter(
          (contactId) => !existingContactIds.has(contactId),
        );
        skipped = audienceContactIds.length - contactIds.length;

        if (contactIds.length === 0) {
          return routeData(
            {
              success: true,
              audienceLinked: true,
              enqueued: 0,
              skipped,
            },
            { headers },
          );
        }

        try {
          await enqueueContactsForCampaign(campaignId, contactIds, { requeue: false });
          enqueued = contactIds.length;
        } catch (enqueueError) {
          logger.error("Audience linked but queue enqueue failed:", enqueueError);
          warning =
            "Audience was linked, but some contacts could not be added to the queue. Refresh and retry queue sync if needed.";
        }
      }

      return routeData(
        {
          success: true,
          partial: Boolean(warning),
          warning,
          audienceLinked: true,
          enqueued,
          skipped,
        },
        { headers },
      );
    }

    if (method === "DELETE") {
      const resolved = await resolveLinkRequest();
      if (!resolved.ok) return resolved.response;
      const { campaignId, audienceId } = resolved;

      await deleteCampaignAudienceLink(campaignId, audienceId);

      const remainingAudienceIds = (await listCampaignAudienceIds(campaignId)).filter(
        (id) => id !== audienceId,
      );

      const removedAudienceContactIds = await listContactIdsForAudience(audienceId);
      let contactsToRemove = removedAudienceContactIds;

      if (remainingAudienceIds.length > 0 && contactsToRemove.length > 0) {
        const retainedContactIds = new Set(await listContactIdsForAudiences(remainingAudienceIds));
        contactsToRemove = contactsToRemove.filter(
          (contactId) => !retainedContactIds.has(contactId),
        );
      }

      if (contactsToRemove.length > 0) {
        await deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds({
          campaignId,
          contactIds: contactsToRemove,
        });
      }

      return routeData({ success: true }, { headers });
    }

    return routeData({ error: "Method not allowed" }, { status: 405, headers });
  } catch (error: unknown) {
    // Authorization failures carry their own status (404 for a non-member, 403
    // for an insufficient role). Without this they collapse into a 500 and the
    // gate looks like a server fault. Matches campaign_queue.action.server.ts.
    if (error instanceof AppError) {
      return routeData({ error: error.message }, { status: error.statusCode, headers });
    }
    logger.error("Error in campaign_audience action:", error);
    return routeData(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500, headers },
    );
  }
  },
});
