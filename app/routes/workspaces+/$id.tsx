export { loader } from "./$id.loader.server";
export { middleware } from "./$id.middleware.server";

import {
  useLoaderData,
  useMatches,
  Outlet,
  useOutlet,
  useOutletContext,
  useRevalidator,
} from "react-router";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { OnboardingProgressStrip } from "./$id/onboarding/OnboardingProgressStrip";
import type { OnboardingLoaderData } from "./$id/onboarding.loader.server";
import { workspacePanelHeightLgClass } from "@/components/workspace/workspace-panel-classes";
import { MemberRole } from "@/components/workspace/TeamMember";
import { Button } from "@/components/ui/button";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceEventSubscription";
import WorkspaceToday from "@/components/workspace/WorkspaceToday";
import {
  Campaign,
  ContextType,
  type WorkspaceMessagingReadiness,
} from "@/lib/types";
import type { WorkspaceInfoWithDetails } from "@/lib/workspace-info-types";
import type { WorkspaceTodaySelection } from "@/lib/workspace-today.server";
import { LOW_CREDIT_THRESHOLD } from "../../../shared/pricing";

type LoaderData = {
  userRole: string | null | undefined;
  workspaceData: WorkspaceInfoWithDetails;
  onboardingReadiness: WorkspaceMessagingReadiness;
  today?: WorkspaceTodaySelection;
};

type OnboardingStripData = Pick<
  OnboardingLoaderData,
  "onboarding" | "workspaceId" | "workspaceName" | "creditsBalance"
>;

/** Loader data of the onboarding child route, when it is the active match. */
function findOnboardingStripData(
  matches: ReturnType<typeof useMatches>,
): OnboardingStripData | null {
  for (const match of matches) {
    const data = match.loaderData;
    if (
      data &&
      typeof data === "object" &&
      "onboarding" in data &&
      "workspaceId" in data &&
      "workspaceName" in data &&
      "creditsBalance" in data
    ) {
      return data as OnboardingStripData;
    }
  }
  return null;
}

function WorkspaceResolvedView({
  resolvedData,
  userRole,
  outlet,
  context,
  onboardingReadiness,
  today,
  showSidebar,
}: {
  resolvedData: WorkspaceInfoWithDetails;
  userRole: string | null | undefined;
  outlet: ReturnType<typeof useOutlet>;
  context: ContextType;
  onboardingReadiness: WorkspaceMessagingReadiness;
  today?: WorkspaceTodaySelection;
  showSidebar: boolean;
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
  const revalidator = useRevalidator();

  useWorkspaceEventSubscription({
    workspaceId: workspace.id,
    table: "campaign",
    onChange: () => revalidator.revalidate(),
  });

  const liveCredits = workspace.credits;
  const canManageBilling = userRole === "admin" || userRole === "owner";

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      {showSidebar ? (
        <WorkspaceNav
          workspace={workspace}
          campaigns={campaigns as Campaign[]}
          userRole={
            (userRole as MemberRole | null | undefined) ?? MemberRole.Member
          }
        />
      ) : null}
      <main
        id="workspace-main-content"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col gap-4 focus:outline-none"
      >
        {liveCredits <= 0 ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-medium">
              Credit balance is depleted. Add credits to resume campaigns and
              calls.
            </div>
            {canManageBilling && outlet ? (
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
              Credits are running low ({liveCredits} left). Add credits to keep
              campaigns active.
            </div>
            {canManageBilling && outlet ? (
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
                </div>
              ) : null}
              {today ? <WorkspaceToday today={today} /> : null}
            </div>
          ) : (
            <Outlet
              context={{
                workspace,
                audiences,
                campaigns,
                phoneNumbers,
                userRole,
                ...context,
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default function Workspace() {
  const { workspaceData, userRole, onboardingReadiness, today } =
    useLoaderData<LoaderData>();
  const outlet = useOutlet();
  const context = useOutletContext<ContextType>();
  const onboardingStrip = findOnboardingStripData(useMatches());
  // The sidebar stays hidden until onboarding is complete: while the wizard
  // route is active, and on any workspace page while the workspace is still
  // fresh enough that the root loader would bounce it into the wizard.
  const showSidebar =
    !onboardingStrip && !onboardingReadiness.shouldRedirectToOnboarding;

  return (
    <>
      <a
        href="#workspace-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      {onboardingStrip ? <OnboardingProgressStrip {...onboardingStrip} /> : null}
      {/* Plain div, not <main>: the real <main> landmark now wraps only the
          actual page content inside WorkspaceResolvedView, deliberately
          excluding WorkspaceNav's sidebar so the skip link above actually
          bypasses it (a landmark that wrapped the sidebar too would still
          hand focus to the sidebar's first link on the very next Tab). */}
      <div className="mx-auto flex min-h-[80vh] w-full flex-col px-4 py-6 sm:px-6">
        <WorkspaceResolvedView
          resolvedData={workspaceData}
          userRole={userRole}
          outlet={outlet}
          context={context}
          onboardingReadiness={onboardingReadiness}
          today={today}
          showSidebar={showSidebar}
        />
      </div>
    </>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
