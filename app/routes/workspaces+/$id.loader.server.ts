import { type WorkspaceMessagingReadiness } from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import {
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
  isWorkspaceIntakeComplete,
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
import {
  buildWorkspaceLaunchChecklist,
  launchChecklistProgress,
} from "@/lib/workspace-launch-checklist";
import { buildA2pBlockingIssues } from "@/lib/twilio-a2p.server";
import { createTenantDb } from "@/server/tenant-db";

type LoaderData = {
  userRole: string | null | undefined;
  workspaceData: WorkspaceInfoWithDetails;
  onboardingReadiness: WorkspaceMessagingReadiness;
  today?: WorkspaceTodaySelection;
  complianceOnboarding?: Awaited<
    ReturnType<typeof getWorkspaceMessagingOnboardingState>
  >;
  a2pBlockingIssues?: string[];
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
      const tdb = createTenantDb(workspaceId);
      const [
        onboarding,
        phoneNumbersResult,
        recentOutboundCount,
        workspaceData,
        unreadCount,
        audienceCount,
        scriptCount,
      ] = await Promise.all([
        getWorkspaceMessagingOnboardingState({ workspaceId }),
        getWorkspacePhoneNumbers({ workspaceId }),
        getWorkspaceRecentOutboundMessageCount({ workspaceId }),
        getWorkspaceInfoWithDetails({ workspaceId, userId }),
        isExactWorkspaceRoot
          ? getWorkspaceUnreadConversationCount(workspaceId)
          : Promise.resolve(0),
        isExactWorkspaceRoot ? tdb.audience.count() : Promise.resolve(0),
        isExactWorkspaceRoot
          ? tdb.script.count()
          : Promise.resolve(0),
      ]);
      const workspaceNumbers = (phoneNumbersResult.data ?? []).map((number) => ({
        type: number?.type ?? null,
        phone_number: number?.phone_number ?? null,
        capabilities: number?.capabilities ?? null,
      }));
      const workspaceSummary = workspaceData.workspace as unknown as {
        credits?: number | null;
      };
      const credits = Number(workspaceSummary.credits ?? 0);
      const creditsSafe = Number.isFinite(credits) ? credits : 0;
      const readiness = deriveWorkspaceMessagingReadiness({
        onboarding,
        workspaceNumbers,
        recentOutboundCount,
        launchContext: {
          audienceCount,
          scriptCount,
          campaignCount: workspaceData.campaigns.length,
          creditsBalance: creditsSafe,
        },
      });
      // Fresh workspaces without business basics + goal go to the onboarding wizard.
      if (
        isExactWorkspaceRoot &&
        (userRole === "owner" || userRole === "admin") &&
        readiness.shouldRedirectToOnboarding
      ) {
        throw redirect(`/workspaces/${workspaceId}/onboarding`, { headers });
      }

      const intakeIncomplete = !isWorkspaceIntakeComplete(onboarding);
      const launchChecklist = buildWorkspaceLaunchChecklist({
        workspaceId,
        onboarding,
        audienceCount,
        scriptCount,
        campaignCount: workspaceData.campaigns.length,
        creditsBalance: creditsSafe,
        workspaceNumbers,
        draftCampaignId: workspaceData.campaigns[0]?.id ?? null,
      });
      const launchChecklistIncomplete =
        !intakeIncomplete &&
        launchChecklistProgress(launchChecklist).hasIncompleteCurrentlyDue;

      const today = isExactWorkspaceRoot
        ? selectWorkspaceToday({
            workspaceId,
            userRole,
            credits: creditsSafe,
            intakeIncomplete,
            launchChecklistIncomplete,
            hasWorkspaceNumber: workspaceHasFirstNumber(workspaceNumbers),
            campaigns: workspaceData.campaigns,
            unreadCount,
            selectedGoal: onboarding.selectedGoal,
            audienceCount,
            scriptCount,
            launchChecklist,
          })
        : undefined;

      return routeData({
        userRole,
        workspaceData,
        onboardingReadiness: readiness,
        ...(today ? { today } : {}),
        ...(isExactWorkspaceRoot && !intakeIncomplete
          ? {
              complianceOnboarding: onboarding,
              a2pBlockingIssues: buildA2pBlockingIssues(onboarding),
            }
          : {}),
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
