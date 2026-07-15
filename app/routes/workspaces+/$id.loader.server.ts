import { type WorkspaceMessagingReadiness } from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import {
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import {
  getWorkspaceInfoWithDetails,
  getWorkspacePhoneNumbers,
} from "@/lib/database/workspace.server";
import { fetchWorkspaceCampaignQueueProgressMap } from "@/lib/campaign-queue-search.server";
import { getWorkspaceRecentOutboundMessageCount } from "@/lib/database/workspace-twilio-portal-snapshot.server";
import { workspaceContext } from "@/lib/route-context.server";
import { defineLoader } from "@/lib/handler.server";
import type { WorkspaceInfoWithDetails } from "@/lib/workspace-info-types";

type LoaderData = {
  userRole: string | null | undefined;
  workspaceData: WorkspaceInfoWithDetails;
  onboardingReadiness: WorkspaceMessagingReadiness;
  campaignQueueProgress: Record<string, { completedCount: number; totalCount: number }>;
};

export const loader = defineLoader({
  auth: ({ context }) => {
    const ws = context.get(workspaceContext);
    if (!ws) {
      throw new Error("Workspace context missing");
    }
    return ws;
  },
  sideEffects: ["db-read"],
  handler: async ({ auth: ws, url }) => {
    const { headers, userId, userRole, workspaceId } = ws;

    try {
      const pathname = url.pathname;
      const [onboarding, phoneNumbersResult, recentOutboundCount, workspaceData, campaignQueueProgressMap] =
        await Promise.all([
          getWorkspaceMessagingOnboardingState({ workspaceId }),
          getWorkspacePhoneNumbers({ workspaceId }),
          getWorkspaceRecentOutboundMessageCount({ workspaceId }),
          getWorkspaceInfoWithDetails({ workspaceId, userId }),
          fetchWorkspaceCampaignQueueProgressMap(workspaceId),
        ]);
      const readiness = deriveWorkspaceMessagingReadiness({
        onboarding,
        workspaceNumbers: (phoneNumbersResult.data ?? []).map((number) => ({
          type: number?.type ?? null,
          phone_number: number?.phone_number ?? null,
          capabilities: number?.capabilities ?? null,
        })),
        recentOutboundCount,
      });
      if (
        pathname === `/workspaces/${workspaceId}` &&
        (userRole === "owner" || userRole === "admin") &&
        readiness.shouldRedirectToOnboarding
      ) {
        throw redirect(`/workspaces/${workspaceId}/onboarding`, { headers });
      }

      return routeData({
        userRole,
        workspaceData,
        onboardingReadiness: readiness,
        campaignQueueProgress: Object.fromEntries(
          [...campaignQueueProgressMap.entries()].map(([campaignId, counts]) => [
            String(campaignId),
            counts,
          ]),
        ),
      } satisfies LoaderData, { headers });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "PGRST116"
      ) {
        throw redirect("/workspaces", { headers });
      }
      throw error;
    }
  },
});
