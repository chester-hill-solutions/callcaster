import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { checkSchedule } from "@/lib/database/campaign.server";
import {
  createWorkspaceTwilioInstance,
  getHandsetNumberForWorkspace,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { safeParseJson } from "@/lib/request-utils.server";
import { getUserVerifiedAudioNumbers } from "@/lib/user-audio.server";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import {
  outboundCreditsResponse,
  requireOutboundCredits,
} from "@/lib/outbound-credit-gate.server";
import { AppError } from "@/lib/errors.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs) => {
    const { headers, user } = await getSession(request);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return { headers, user };
  },
  sideEffects: ["twilio", "db-read"],
  handler: async ({ request, auth }) => {
    const { headers, user } = auth;

    const { phoneNumber, workspaceId, campaignId } = await safeParseJson<{
        phoneNumber: string;
        workspaceId: string;
        campaignId?: string | number;
    }>(request);
    if (
        typeof phoneNumber !== "string" ||
        typeof workspaceId !== "string" ||
        (campaignId != null && typeof campaignId !== "string" && typeof campaignId !== "number")
    ) {
        return routeData({ error: "Invalid connect phone payload" }, { status: 400, headers });
    }

    await requireWorkspaceAccess({user,
        workspaceId,
    });

    const parsedCampaignId =
        typeof campaignId === "number"
            ? campaignId
            : typeof campaignId === "string" && campaignId !== ""
                ? Number(campaignId)
                : null;

    if (parsedCampaignId != null && !Number.isFinite(parsedCampaignId)) {
        return routeData({ error: "Invalid campaignId" }, { status: 400, headers });
    }

    try {
        const verifiedNumbers = await getUserVerifiedAudioNumbers(user.id);
        const normalizedPhone = phoneNumber.trim();
        if (!verifiedNumbers?.includes(normalizedPhone)) {
            return routeData({ error: "Phone number is not verified" }, { status: 403, headers });
        }

        const { data: handset } = await getHandsetNumberForWorkspace({ workspaceId });
        const callerId = handset?.phone_number ?? null;
        if (!callerId) {
            return routeData({ error: "Workspace has no configured caller ID" }, { status: 400, headers });
        }

        const credits = await requireOutboundCredits(workspaceId);
        if (!credits.ok) return outboundCreditsResponse(credits, headers);

        if (parsedCampaignId != null) {
            const campaign = await findCampaignInWorkspace(workspaceId, parsedCampaignId);
            if (!campaign) {
                return routeData({ error: "Campaign not found" }, { status: 404, headers });
            }
            if (!checkSchedule(campaign)) {
                if (campaign.status === "draft" || campaign.status === "pending") {
                    return routeData({ error: "Campaign is not live yet. Start it from the Launch page." }, { status: 400, headers });
                }
                if (campaign.status === "paused") {
                    return routeData({ error: "Campaign is paused." }, { status: 400, headers });
                }
                return routeData({ error: "Campaign is not currently active" }, { status: 400, headers });
            }
        }

        const twilio = await createWorkspaceTwilioInstance({
            workspace_id: workspaceId,
        });
        // Call the user's phone and connect them to the campaign conference
        const call = await twilio.calls.create({
            to: normalizedPhone,
            from: callerId,
            url: `${env.BASE_URL()}/api/connect-campaign-conference/${workspaceId}/${parsedCampaignId ?? campaignId}`,
            method: 'GET',
        });

        return routeData({ success: true, callSid: call.sid }, { headers });
    } catch (error: any) {
        // Let a thrown AppError (e.g. the outbound credit gate's uniform
        // workspace-not-found 404) escape to defineAction's own error
        // mapping instead of being flattened into a 500 here.
        if (error instanceof AppError) throw error;
        logger.error('Error connecting phone device:', error);
        return routeData({ error: error.message }, { status: 500 });
    }
  },
});
