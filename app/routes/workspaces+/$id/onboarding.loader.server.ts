import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import {
  isWizardOnboardingStepId,
  resolvePersistedWizardStep,
} from "@/lib/messaging-onboarding.server";
import {
  getWorkspaceInfo,
  getWorkspaceUsers,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { loadWorkspaceOnboardingView } from "@/lib/platform-onboarding-helpers.server";
import { data as routeData, redirect } from "react-router";
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
      onboardingView,
      { data: workspaceInfo },
      { data: workspaceUsersData },
      mediaNames,
      inboundQueues,
      scripts,
    ] = await Promise.all([
      loadWorkspaceOnboardingView(workspaceId),
      getWorkspaceInfo({ workspaceId }),
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
    ]);
    const {
      onboarding: hydratedOnboarding,
      readiness,
      phoneNumbers,
      creditsBalance,
      rcsBlockingIssues,
      audienceCount,
      campaignCount,
    } = onboardingView;
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
        creditsBalance,
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
