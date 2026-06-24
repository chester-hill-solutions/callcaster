import {
  Campaign,
  ContextType,
  type WorkspaceMessagingReadiness,
} from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import { deriveWorkspaceMessagingReadiness, getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { getUserRole, getWorkspaceInfoWithDetails, getWorkspacePhoneNumbers } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceInfoWithDetails } from "@/lib/workspace-info-types";
import type { User } from "@/lib/types";

type LoaderData = {
  userRole: string | null | undefined;
  workspaceData: Promise<WorkspaceInfoWithDetails>;
  onboardingReadiness: WorkspaceMessagingReadiness;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { supabaseClient, headers, user } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    throw new Error("No workspace found");
  }

  const userRole = (
    await getUserRole({
      supabaseClient: supabaseClient as SupabaseClient,
      user: user,
      workspaceId: workspaceId as string,
    })
  )?.role;
  try {
    const pathname = new URL(request.url).pathname;
    const [onboarding, phoneNumbersResult] = await Promise.all([
      getWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId: workspaceId as string,
      }),
      getWorkspacePhoneNumbers({
        supabaseClient,
        workspaceId: workspaceId as string,
      }),
    ]);
    const readiness = deriveWorkspaceMessagingReadiness({
      onboarding,
      workspaceNumbers: (phoneNumbersResult.data ?? []).map((number) => ({
        type: number?.type ?? null,
        phone_number: number?.phone_number ?? null,
        capabilities: number?.capabilities ?? null,
      })),
      recentOutboundCount: 0,
    });
    if (
      pathname === `/workspaces/${workspaceId}` &&
      (userRole === "owner" || userRole === "admin") &&
      readiness.shouldRedirectToOnboarding
    ) {
      throw redirect(`/workspaces/${workspaceId}/onboarding`, { headers });
    }

    const workspacePromise = getWorkspaceInfoWithDetails({
      supabaseClient,
      workspaceId,
      userId: user.id,
    });

    return routeData({
      userRole: userRole,
      workspaceData: workspacePromise,
      onboardingReadiness: readiness,
      headers,
    });
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
}
