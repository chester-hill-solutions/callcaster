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
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { hasInsufficientCreditsForOutbound } from "../../../shared/credit-floor";
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

        const credits = await getWorkspaceCreditsBalance(workspaceId);
        if (credits === null) {
            throw new Error(`Workspace ${workspaceId} not found`);
        }
        if (hasInsufficientCreditsForOutbound(credits)) {
            return routeData({ error: "Insufficient credits" }, { status: 402, headers });
        }

        if (parsedCampaignId != null) {
            const campaign = await findCampaignInWorkspace(workspaceId, parsedCampaignId);
            if (!campaign) {
                return routeData({ error: "Campaign not found" }, { status: 404, headers });
            }
            if (!checkSchedule(campaign)) {
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
        logger.error('Error connecting phone device:', error);
        return routeData({ error: error.message }, { status: 500 });
    }
  },
});
