import {
  applyOnboardingStepsWithWorkspaceNumbers,
  applyWorkspaceOnboardingChannelPolicy,
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
  isWizardOnboardingStepId,
} from "@/lib/messaging-onboarding.server";
import {
  getUserRole,
  getWorkspaceInfo,
  getWorkspacePhoneNumbers,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import {
  getWorkspaceRcsBlockingIssues,
  hydrateWorkspaceRcsOnboardingState,
  isRcsOnboardingEnabled,
} from "@/lib/rcs-onboarding.server";
import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { getWorkspaceCredits } from "@/lib/workspace-members-db.server";
import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
} from "@/lib/types";
import type { LoaderFunctionArgs } from "react-router";
import type { Tables } from "@/lib/database.types";

export type OnboardingLoaderData = {
  workspaceId: string;
  workspaceName: string;
  userRole: string | null | undefined;
  onboarding: WorkspaceMessagingOnboardingState;
  readiness: WorkspaceMessagingReadiness;
  phoneNumbers: Tables<"workspace_number">[] | null;
  creditsBalance: number;
  rcsBlockingIssues: string[];
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, user, headers } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!workspaceId) {
    throw redirect("/workspaces", { headers });
  }

  await requireWorkspaceAccess({
    user,
    workspaceId,
  });

  const userRole = (
    await getUserRole({
      user,
      workspaceId,
    })
  )?.role;
  const [{ data: workspaceInfo }, { data: phoneNumbers }, onboarding, creditsBalance] =
    await Promise.all([
      getWorkspaceInfo({ workspaceId }),
      getWorkspacePhoneNumbers({ workspaceId }),
      getWorkspaceMessagingOnboardingState({ supabaseClient, workspaceId }),
      getWorkspaceCredits(workspaceId),
    ]);
  const hydratedOnboarding = applyOnboardingStepsWithWorkspaceNumbers(
    hydrateWorkspaceRcsOnboardingState(applyWorkspaceOnboardingChannelPolicy(onboarding)),
    phoneNumbers ?? [],
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
    recentOutboundCount: 0,
  });

  const requestUrl = new URL(request.url);
  const stepParam = requestUrl.searchParams.get("step");
  const serverStep =
    hydratedOnboarding.currentStep === "use_case"
      ? "business_profile"
      : isWizardOnboardingStepId(hydratedOnboarding.currentStep)
        ? hydratedOnboarding.currentStep
        : "business_profile";

  if (stepParam && !isWizardOnboardingStepId(stepParam)) {
    requestUrl.searchParams.set("step", serverStep);
    throw redirect(`${requestUrl.pathname}?${requestUrl.searchParams.toString()}`, { headers });
  }

  if (!stepParam && hydratedOnboarding.status !== "not_started") {
    requestUrl.searchParams.set("step", serverStep);
    throw redirect(`${requestUrl.pathname}?${requestUrl.searchParams.toString()}`, { headers });
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
    },
    { headers },
  );
};
