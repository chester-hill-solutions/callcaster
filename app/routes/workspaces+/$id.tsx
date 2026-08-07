export { loader } from "./$id.loader.server";
export { middleware } from "./$id.middleware.server";

import {
  useLoaderData,
  useMatches,
  Outlet,
  useOutlet,
  useOutletContext,
  useRevalidator,
  useLocation,
} from "react-router";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { OnboardingProgressStrip } from "./$id/onboarding/OnboardingProgressStrip";
import type { OnboardingLoaderData } from "./$id/onboarding.loader.server";
import { workspacePanelHeightLgClass } from "@/components/workspace/workspace-panel-classes";
import { MemberRole } from "@/components/workspace/TeamMember";
import { Button } from "@/components/ui/button";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceEventSubscription";
import type { CampaignQueueProgressCounts } from "@/components/campaign/CampaignQueueProgress";
import WorkspaceToday from "@/components/workspace/WorkspaceToday";
import { ComplianceStatusPanel } from "@/components/workspace/ComplianceStatusPanel";
import {
  Campaign,
  ContextType,
  type WorkspaceMessagingOnboardingState,
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
  complianceOnboarding?: WorkspaceMessagingOnboardingState;
  a2pBlockingIssues?: string[];
  campaignQueueProgress: Record<string, CampaignQueueProgressCounts>;
};

type OnboardingStripData = Pick<
  OnboardingLoaderData,
  "onboarding" | "workspaceName"
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
      "workspaceName" in data
    ) {
      const strip = data as OnboardingStripData;
      return {
        onboarding: strip.onboarding,
        workspaceName: strip.workspaceName,
      };
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
  complianceOnboarding,
  a2pBlockingIssues,
  campaignQueueProgress,
}: {
  resolvedData: WorkspaceInfoWithDetails;
  userRole: string | null | undefined;
  outlet: ReturnType<typeof useOutlet>;
  context: ContextType;
  onboardingReadiness: WorkspaceMessagingReadiness;
  today?: WorkspaceTodaySelection;
  showSidebar: boolean;
  complianceOnboarding?: WorkspaceMessagingOnboardingState;
  a2pBlockingIssues?: string[];
  campaignQueueProgress: Record<string, CampaignQueueProgressCounts>;
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

  // One workspace-tree EventSource for campaign + ledger freshness. Root and
  // workspace loaders revalidate together so Navbar, mobile menu, WorkspaceNav,
  // and low-credit banners stay in sync without a duplicate credit subscription.
  useWorkspaceEventSubscription({
    workspaceId: workspace.id,
    table: ["campaign", "campaign_queue", "transaction_history"],
    onChange: () => revalidator.revalidate(),
  });

  const liveCredits = workspace.credits;
  const canManageBilling = userRole === "admin" || userRole === "owner";
  const location = useLocation();
  // Credits page is where users top up — keep the low-credit banner off it (#1097).
  const isBillingPage = /\/billing(?:\/|$)/.test(location.pathname);
  const showLowCreditBanner = !isBillingPage && liveCredits < LOW_CREDIT_THRESHOLD;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      {showSidebar ? (
        <WorkspaceNav
          workspace={workspace}
          campaigns={campaigns as Campaign[]}
          campaignQueueProgress={campaignQueueProgress}
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
        {showLowCreditBanner && liveCredits <= 0 ? (
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
        ) : showLowCreditBanner ? (
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
          className={`min-w-0 flex-1 lg:rounded-2xl lg:border lg:border-border/80 lg:bg-card/70 lg:p-6 lg:shadow-sm ${workspacePanelHeightLgClass} lg:overflow-y-auto`}
        >
          {!outlet ? (
            <div className="space-y-4">
              {onboardingReadiness.shouldShowOnboardingBanner ? (
                <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm text-foreground">
                  <div className="font-medium">
                    Continue workspace setup
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {onboardingReadiness.warnings.length > 0
                      ? onboardingReadiness.warnings.join(" ")
                      : "Finish business details and the guided steps for your campaign path."}
                  </p>
                </div>
              ) : null}
              {today ? <WorkspaceToday today={today} /> : null}
              {complianceOnboarding ? (
                <ComplianceStatusPanel
                  workspaceId={workspace.id}
                  onboarding={complianceOnboarding}
                  a2pBlockingIssues={a2pBlockingIssues}
                />
              ) : null}
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
  const {
    workspaceData,
    userRole,
    onboardingReadiness,
    today,
    complianceOnboarding,
    a2pBlockingIssues,
    campaignQueueProgress,
  } =
    useLoaderData<LoaderData>();
  const outlet = useOutlet();
  const context = useOutletContext<ContextType>();
  const onboardingStrip = findOnboardingStripData(useMatches());
  // Keep the workspace sidebar available on all workspace screens; onboarding
  // itself is the only focused layout that should hide it.
  const showSidebar = !onboardingStrip;

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
          complianceOnboarding={complianceOnboarding}
          a2pBlockingIssues={a2pBlockingIssues}
          campaignQueueProgress={campaignQueueProgress}
        />
      </div>
    </>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
