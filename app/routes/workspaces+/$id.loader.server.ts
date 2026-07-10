import { type WorkspaceMessagingReadiness } from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import {
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import {
  getWorkspaceInfoWithDetails,
  getWorkspacePhoneNumbers,
} from "@/lib/database.server";
import { getWorkspaceRecentOutboundMessageCount } from "@/lib/database/workspace-twilio-portal-snapshot.server";
import { workspaceContext } from "@/lib/route-context.server";
import type { LoaderFunctionArgs } from "react-router";
import type { WorkspaceInfoWithDetails } from "@/lib/workspace-info-types";

type LoaderData = {
  userRole: string | null | undefined;
  workspaceData: WorkspaceInfoWithDetails;
  onboardingReadiness: WorkspaceMessagingReadiness;
};

export const loader = async ({ request, params, context, url }: LoaderFunctionArgs) => {
  const ws = context.get(workspaceContext);
  if (!ws) {
    throw new Error("Workspace context missing");
  }

  const { headers, userId, userRole, workspaceId } = ws;

  try {
    const pathname = url.pathname;
    const [onboarding, phoneNumbersResult, recentOutboundCount] = await Promise.all([
      getWorkspaceMessagingOnboardingState({ workspaceId }),
      getWorkspacePhoneNumbers({ workspaceId }),
      getWorkspaceRecentOutboundMessageCount({ workspaceId }),
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

    const workspaceData = await getWorkspaceInfoWithDetails({
      workspaceId,
      userId,
    });

    return routeData({
      userRole,
      workspaceData,
      onboardingReadiness: readiness,
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
};
