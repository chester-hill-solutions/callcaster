export { loader } from "./campaigns.loader.server";

import { Outlet, useOutlet, useOutletContext } from "react-router";
import CampaignEmptyState from "@/components/campaign/CampaignEmptyState";
import CampaignSidebar from "@/components/campaign/CampaignSidebar";
import type { CampaignQueueProgressCounts } from "@/components/campaign/CampaignQueueProgress";
import { MemberRole } from "@/components/workspace/TeamMember";
import {
  Audience,
  WorkspaceNumbers,
  Campaign,
} from "@/lib/types";




export default function WorkspaceCampaignsPage() {
  const outlet = useOutlet();
  const {
    audiences,
    campaigns,
    phoneNumbers,
    userRole,
    workspace,
    campaignQueueProgress,
  } =
    useOutletContext<{
      audiences: Audience[];
      campaigns: Campaign[];
      phoneNumbers: WorkspaceNumbers[];
      userRole: MemberRole;
      workspace: { id: string; name: string; credits: number };
      campaignQueueProgress: Record<string, CampaignQueueProgressCounts>;
    }>();

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch">
      <CampaignSidebar
        workspaceId={workspace.id}
        campaigns={campaigns}
        campaignQueueProgress={campaignQueueProgress}
        userRole={userRole}
      />
      <div className="min-w-0 flex-1">
        {!outlet ? (
          <CampaignEmptyState
            hasAccess={userRole === "admin" || userRole === "owner"}
            type={phoneNumbers?.length > 0 ? "campaign" : "number"}
          />
        ) : (
          <Outlet
            context={{
              audiences,
              campaigns,
              phoneNumbers,
              userRole,
              workspace,
            }}
          />
        )}
      </div>
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
