import { Suspense } from "react";
import { defer, LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  redirect,
  useLoaderData,
  Outlet,
  useOutlet,
  useOutletContext,
} from "@remix-run/react";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { MemberRole } from "@/components/workspace/TeamMember";
import { Button } from "@/components/ui/button";
import {
  getUserRole,
  getWorkspaceInfoWithDetails,
  getWorkspacePhoneNumbers,
  type WorkspaceInfoWithDetails,
} from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { useRealtimeData } from "@/hooks/realtime/useRealtimeData";
import CampaignEmptyState from "@/components/campaign/CampaignEmptyState";
import { Campaign, ContextType, User } from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import {
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";

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
      user: user as unknown as User,
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

    return defer({
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
};

function WorkspaceResolvedView({
  resolvedData,
  userRole,
  outlet,
  context,
  onboardingReadiness,
}: {
  resolvedData: WorkspaceInfoWithDetails;
  userRole: string | null | undefined;
  outlet: ReturnType<typeof useOutlet>;
  context: ContextType;
  onboardingReadiness: ReturnType<typeof deriveWorkspaceMessagingReadiness>;
}) {
  const normalizedWorkspace = resolvedData.workspace as unknown as {
    id: string;
    name?: string | null;
    credits?: number | null;
  };
  const workspace = {
    id: String(normalizedWorkspace.id),
    name:
      typeof normalizedWorkspace.name === "string"
        ? normalizedWorkspace.name
        : "",
    credits:
      typeof normalizedWorkspace.credits === "number"
        ? normalizedWorkspace.credits
        : 0,
  };
  const audiences = (resolvedData.audiences ?? []) as Array<{
    id: string | number;
  }>;
  const campaigns = (resolvedData.campaigns ?? []) as Array<{
    id: string | number;
  }>;
  const phoneNumbers = (
    (resolvedData.phoneNumbers ?? []) as Array<{ id: string | number } | null>
  ).filter(Boolean);
  const { data: workspaceData } = useRealtimeData(
    context.supabase,
    workspace.id,
    "workspace",
    workspace ? [workspace] : [],
  );
  const { data: campaignsData } = useRealtimeData(
    context.supabase,
    workspace.id,
    "campaign",
    campaigns,
  );
  const { data: phoneNumbersData } = useRealtimeData(
    context.supabase,
    workspace.id,
    "workspace_numbers",
    phoneNumbers,
  );
  const { data: audiencesData } = useRealtimeData(
    context.supabase,
    workspace.id,
    "audience",
    audiences,
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <WorkspaceNav
        workspace={
          workspaceData?.[0] ?? {
            id: workspace.id,
            name: workspace.name,
            credits: workspace.credits,
          }
        }
        campaigns={(campaignsData as Campaign[] | undefined) ?? []}
        userRole={
          (userRole as MemberRole | null | undefined) ?? MemberRole.Member
        }
      />
      <div className="min-w-0 flex-1 rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm sm:p-6">
        {!outlet ? (
          <div className="space-y-4">
            {onboardingReadiness.shouldShowOnboardingBanner ? (
              <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                <div className="font-medium">
                  Messaging onboarding still has required steps.
                </div>
                <p className="mt-1">{onboardingReadiness.warnings.join(" ")}</p>
                {userRole === "admin" || userRole === "owner" ? (
                  <Button asChild className="mt-3">
                    <a href={`/workspaces/${workspace.id}/onboarding`}>
                      Continue onboarding
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}
            <CampaignEmptyState
              hasAccess={Boolean(userRole === "admin" || userRole === "owner")}
              type={(phoneNumbersData?.length ?? 0) > 0 ? "campaign" : "number"}
            />
          </div>
        ) : (
          <Outlet
            context={{
              workspace: workspaceData?.[0],
              audiences: audiencesData,
              campaigns: campaignsData,
              phoneNumbers: phoneNumbersData,
              userRole,
              ...context,
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function Workspace() {
  const { workspaceData, userRole, onboardingReadiness } =
    useLoaderData<typeof loader>();
  const outlet = useOutlet();
  const context = useOutletContext<ContextType>();

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-[1500px] flex-col px-4 py-6 sm:px-6">
      <Suspense fallback={<div>Loading workspace...</div>}>
        <Await
          resolve={workspaceData}
          errorElement={<div>Error loading workspace</div>}
        >
          {(resolvedData) => {
            return (
              <WorkspaceResolvedView
                resolvedData={
                  resolvedData as unknown as WorkspaceInfoWithDetails
                }
                userRole={userRole}
                outlet={outlet}
                context={context}
                onboardingReadiness={onboardingReadiness}
              />
            );
          }}
        </Await>
      </Suspense>
    </main>
  );
}

export { ErrorBoundary };
