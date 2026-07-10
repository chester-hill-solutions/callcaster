export { loader } from "./$id.loader.server";

import { useLoaderData, Outlet, useOutlet, useOutletContext } from "react-router";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { workspacePanelHeightLgClass } from "@/components/workspace/workspace-panel-classes";
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
import { LOW_CREDIT_THRESHOLD } from "../../../shared/pricing";

type LoaderData = {
  userRole: string | null | undefined;
  workspaceData: WorkspaceInfoWithDetails;
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
    null,
    workspace.id,
    "workspace",
    workspace ? [workspace] : [],
  );
  const { data: campaignsData } = useRealtimeData(
    null,
    workspace.id,
    "campaign",
    campaigns,
  );
  const { data: phoneNumbersData } = useRealtimeData(
    null,
    workspace.id,
    "workspace_numbers",
    phoneNumbers,
  );
  const { data: audiencesData } = useRealtimeData(
    null,
    workspace.id,
    "audience",
    audiences,
  );

  const liveCredits = workspaceData?.[0]?.credits ?? workspace.credits;
  const canManageBilling = userRole === "admin" || userRole === "owner";

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
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
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {liveCredits <= 0 ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-medium">
              You&apos;re out of credits. Campaigns and calls are paused
              until you top up.
            </div>
            {canManageBilling ? (
              <Button asChild variant="destructive" className="mt-3">
                <a href={`/workspaces/${workspace.id}/billing`}>
                  Add credits
                </a>
              </Button>
            ) : null}
          </div>
        ) : liveCredits < LOW_CREDIT_THRESHOLD ? (
          <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm text-foreground">
            <div className="font-medium">
              Credits are running low ({liveCredits} left). Top up to avoid
              interruptions.
            </div>
            {canManageBilling ? (
              <Button asChild className="mt-3">
                <a href={`/workspaces/${workspace.id}/billing`}>
                  Add credits
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
        <div
          className={`min-w-0 flex-1 rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm sm:p-6 ${workspacePanelHeightLgClass} lg:overflow-y-auto`}
        >
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
    </div>
  );
}

export default function Workspace() {
  const { workspaceData, userRole, onboardingReadiness } =
    useLoaderData<LoaderData>();
  const outlet = useOutlet();
  const context = useOutletContext<ContextType>();

  return (
    <main className="mx-auto flex min-h-[80vh] w-full flex-col px-4 py-6 sm:px-6">
      <WorkspaceResolvedView
        resolvedData={workspaceData}
        userRole={userRole}
        outlet={outlet}
        context={context}
        onboardingReadiness={onboardingReadiness}
      />
    </main>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
