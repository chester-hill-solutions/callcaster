export { loader } from "./$id.loader.server";

import { Suspense } from "react";
import {
  Await,
  useLoaderData,
  Outlet,
  useOutlet,
  useOutletContext,
  data as routeData,
  redirect,
  type LoaderFunctionArgs,
} from "react-router";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { MemberRole } from "@/components/workspace/TeamMember";
import { Button } from "@/components/ui/button";
import { useRealtimeData } from "@/hooks/realtime/useRealtimeData";
import CampaignEmptyState from "@/components/campaign/CampaignEmptyState";
import {
  Campaign,
  ContextType,
  type WorkspaceMessagingReadiness,
} from "@/lib/types";
import type { WorkspaceInfoWithDetails } from "@/lib/workspace-info-types";

type LoaderData = {
  userRole: string | null | undefined;
  workspaceData: Promise<WorkspaceInfoWithDetails>;
  onboardingReadiness: WorkspaceMessagingReadiness;
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
  onboardingReadiness: WorkspaceMessagingReadiness;
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
    useLoaderData<LoaderData>();
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

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
