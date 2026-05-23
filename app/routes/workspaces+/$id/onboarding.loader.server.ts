import {
  data as routeData,
  type LoaderFunctionArgs,
  redirect,
} from "react-router";

import type { Tables } from "@/lib/database.types";
import {
  getUserRole,
  getWorkspaceInfo,
  getWorkspacePhoneNumbers,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import {
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import {
  getWorkspaceRcsBlockingIssues,
  hydrateWorkspaceRcsOnboardingState,
} from "@/lib/rcs-onboarding.server";
import { verifyAuth } from "@/lib/supabase.server";
import type {
  User,
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
} from "@/lib/types";

export type OnboardingLoaderData = {
  workspaceId: string;
  workspaceName: string;
  userRole: string | null | undefined;
  onboarding: WorkspaceMessagingOnboardingState;
  readiness: WorkspaceMessagingReadiness;
  phoneNumbers: Tables<"workspace_number">[] | null;
  rcsBlockingIssues: string[];
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, user, headers } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    throw redirect("/workspaces", { headers });
  }

  await requireWorkspaceAccess({
    supabaseClient,
    user,
    workspaceId,
  });

  const userRole = (
    await getUserRole({
      supabaseClient,
      user: user as unknown as User,
      workspaceId,
    })
  )?.role;
  const [{ data: workspaceInfo }, { data: phoneNumbers }, onboarding] = await Promise.all([
    getWorkspaceInfo({ supabaseClient, workspaceId }),
    getWorkspacePhoneNumbers({ supabaseClient, workspaceId }),
    getWorkspaceMessagingOnboardingState({ supabaseClient, workspaceId }),
  ]);
  const hydratedOnboarding = hydrateWorkspaceRcsOnboardingState(onboarding);
  const rcsBlockingIssues = hydratedOnboarding.selectedChannels.includes("rcs")
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

  return routeData<OnboardingLoaderData>(
    {
      workspaceId,
      workspaceName: workspaceInfo?.name ?? "Workspace",
      userRole,
      onboarding: hydratedOnboarding,
      readiness,
      phoneNumbers,
      rcsBlockingIssues,
    },
    { headers },
  );
};
