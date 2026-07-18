import { type WorkspaceMessagingReadiness } from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import {
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { workspaceHasFirstNumber } from "@/lib/messaging-onboarding/readiness.server";
import {
  getWorkspaceInfoWithDetails,
  getWorkspacePhoneNumbers,
} from "@/lib/database/workspace.server";
import { getWorkspaceUnreadConversationCount } from "@/lib/database/workspace-conversations.server";
import { getWorkspaceRecentOutboundMessageCount } from "@/lib/database/workspace-twilio-portal-snapshot.server";
import { workspaceContext } from "@/lib/route-context.server";
import { defineLoader } from "@/lib/handler.server";
import type { WorkspaceInfoWithDetails } from "@/lib/workspace-info-types";
import {
  selectWorkspaceToday,
  type WorkspaceTodaySelection,
} from "@/lib/workspace-today.server";

type LoaderData = {
  userRole: string | null | undefined;
  workspaceData: WorkspaceInfoWithDetails;
  onboardingReadiness: WorkspaceMessagingReadiness;
  today?: WorkspaceTodaySelection;
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
      const isExactWorkspaceRoot = pathname === `/workspaces/${workspaceId}`;
      const [
        onboarding,
        phoneNumbersResult,
        recentOutboundCount,
        workspaceData,
        unreadCount,
      ] = await Promise.all([
          getWorkspaceMessagingOnboardingState({ workspaceId }),
          getWorkspacePhoneNumbers({ workspaceId }),
          getWorkspaceRecentOutboundMessageCount({ workspaceId }),
          getWorkspaceInfoWithDetails({ workspaceId, userId }),
          isExactWorkspaceRoot
            ? getWorkspaceUnreadConversationCount(workspaceId)
            : Promise.resolve(0),
        ]);
      const workspaceNumbers = (phoneNumbersResult.data ?? []).map((number) => ({
        type: number?.type ?? null,
        phone_number: number?.phone_number ?? null,
        capabilities: number?.capabilities ?? null,
      }));
      const readiness = deriveWorkspaceMessagingReadiness({
        onboarding,
        workspaceNumbers,
        recentOutboundCount,
      });
      // Fresh workspaces (no legacy traffic) send admins straight to the
      // onboarding wizard instead of showing setup errors on the root page.
      if (
        isExactWorkspaceRoot &&
        (userRole === "owner" || userRole === "admin") &&
        readiness.shouldRedirectToOnboarding
      ) {
        throw redirect(`/workspaces/${workspaceId}/onboarding`, { headers });
      }
      const workspaceSummary = workspaceData.workspace as unknown as {
        credits?: number | null;
      };
      const credits = Number(workspaceSummary.credits ?? 0);
      const today = isExactWorkspaceRoot
        ? selectWorkspaceToday({
            workspaceId,
            userRole,
            credits: Number.isFinite(credits) ? credits : 0,
            onboardingIncomplete: readiness.shouldShowOnboardingBanner,
            hasWorkspaceNumber: workspaceHasFirstNumber(workspaceNumbers),
            campaigns: workspaceData.campaigns,
            unreadCount,
          })
        : undefined;

      return routeData({
        userRole,
        workspaceData,
        onboardingReadiness: readiness,
        ...(today ? { today } : {}),
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
