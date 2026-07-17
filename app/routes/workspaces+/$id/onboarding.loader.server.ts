import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  applyWorkspaceOnboardingChannelPolicy,
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
  isWizardOnboardingStepId,
  resolvePersistedWizardStep,
} from "@/lib/messaging-onboarding.server";
import {
  getWorkspaceInfo,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import {
  getWorkspaceRcsBlockingIssues,
  hydrateWorkspaceRcsOnboardingState,
  isRcsOnboardingEnabled,
} from "@/lib/rcs-onboarding.server";
import { data as routeData, redirect } from "react-router";
import { getWorkspaceCredits } from "@/lib/workspace-members-db.server";
import { getWorkspaceRecentOutboundMessageCount } from "@/lib/database/workspace-twilio-portal-snapshot.server";
import { listObjects } from "@/lib/object-storage.server";
import { createTenantDb } from "@/server/tenant-db";
import { defineLoader } from "@/lib/handler.server";
import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
} from "@/lib/types";
import type { Tables } from "@/lib/db-types";

export type OnboardingLoaderData = {
  workspaceId: string;
  workspaceName: string;
  userRole: string | null | undefined;
  onboarding: WorkspaceMessagingOnboardingState;
  readiness: WorkspaceMessagingReadiness;
  phoneNumbers: Tables<"workspace_number">[] | null;
  creditsBalance: number;
  rcsBlockingIssues: string[];
  workspaceUsers: { id: string; username: string }[];
  mediaNames: { id: number | string; name: string }[];
  inboundQueues: { id: number; name: string }[];
  scripts: { id: number; name: string }[];
  audienceCount: number;
  campaignCount: number;
};

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read", "external"],
  handler: async ({ url, auth }) => {
    const { headers, user, workspaceId, userRole } = auth;
    if (!workspaceId) {
      throw redirect("/workspaces", { headers });
    }

    await requireWorkspaceAccess({
      user,
      workspaceId,
    });

    const tdb = createTenantDb(workspaceId);
    const [
      { data: workspaceInfo },
      { data: phoneNumbers },
      onboarding,
      creditsBalance,
      recentOutboundCount,
      { data: workspaceUsersData },
      mediaNames,
      inboundQueues,
      scripts,
      audienceCount,
      campaignCount,
    ] = await Promise.all([
      getWorkspaceInfo({ workspaceId }),
      getWorkspacePhoneNumbers({ workspaceId }),
      getWorkspaceMessagingOnboardingState({ workspaceId }),
      getWorkspaceCredits(workspaceId),
      getWorkspaceRecentOutboundMessageCount({ workspaceId }),
      getWorkspaceUsers({ workspaceId }),
      listObjects("workspaceAudio", workspaceId),
      tdb.inbound_queue.findMany({
        columns: { id: true, name: true },
        orderBy: (queue, { asc: ascFn }) => [ascFn(queue.name)],
      }),
      tdb.script.findMany({
        columns: { id: true, name: true },
        orderBy: (script, { asc: ascFn }) => [ascFn(script.name)],
      }),
      tdb.audience.count(),
      tdb.campaign.count(),
    ]);
    const hydratedOnboarding = applyOnboardingStepsWithWorkspaceNumbers(
      hydrateWorkspaceRcsOnboardingState(applyWorkspaceOnboardingChannelPolicy(onboarding)),
      phoneNumbers ?? [],
      {
        audienceCount,
        scriptCount: scripts.length,
        campaignCount,
        creditsBalance: creditsBalance ?? 0,
      },
    );
    const rcsBlockingIssues =
      isRcsOnboardingEnabled() && hydratedOnboarding.selectedChannels.includes("rcs")
        ? getWorkspaceRcsBlockingIssues(hydratedOnboarding)
        : [];

    const readiness = deriveWorkspaceMessagingReadiness({
      onboarding: hydratedOnboarding,
      workspaceNumbers: (phoneNumbers ?? []).map((number) => ({
        type: number?.type ?? null,
        phone_number: number?.phone_number ?? null,
        capabilities: number?.capabilities ?? null,
      })),
      recentOutboundCount,
    });
    const stepParam = url.searchParams.get("step");
    const serverStep = resolvePersistedWizardStep(hydratedOnboarding.currentStep);

    if (stepParam && !isWizardOnboardingStepId(stepParam)) {
      const redirected = resolvePersistedWizardStep(stepParam);
      url.searchParams.set("step", redirected);
      throw redirect(`${url.pathname}?${url.searchParams.toString()}`, { headers });
    }

    if (!stepParam && hydratedOnboarding.status !== "not_started") {
      url.searchParams.set("step", serverStep);
      throw redirect(`${url.pathname}?${url.searchParams.toString()}`, { headers });
    }

    return routeData<OnboardingLoaderData>(
      {
        workspaceId,
        workspaceName: workspaceInfo?.name ?? "Workspace",
        userRole,
        onboarding: hydratedOnboarding,
        readiness,
        phoneNumbers,
        creditsBalance: creditsBalance ?? 0,
        rcsBlockingIssues,
        workspaceUsers: workspaceUsersData ?? [],
        mediaNames,
        inboundQueues,
        scripts,
        audienceCount,
        campaignCount,
      },
      { headers },
    );
  },
});
