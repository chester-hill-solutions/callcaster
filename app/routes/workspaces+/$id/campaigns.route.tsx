export { loader } from "./campaigns.loader.server";

import { redirect, LoaderFunctionArgs, NavLink, Outlet, useOutlet, useOutletContext } from "react-router";
import CampaignEmptyState from "@/components/campaign/CampaignEmptyState";
import { StatusBadge } from "@/components/ui/status-badge";
import { MemberRole } from "@/components/workspace/TeamMember";
import {
  Audience,
  WorkspaceData,
  WorkspaceNumbers,
  Campaign,
} from "@/lib/types";




export default function WorkspaceCampaignsPage() {
  const outlet = useOutlet();
  const { audiences, campaigns, phoneNumbers, userRole, workspace } =
    useOutletContext<{
      audiences: Audience[];
      campaigns: Campaign[];
      phoneNumbers: WorkspaceNumbers[];
      userRole: MemberRole;
      workspace: WorkspaceData;
    }>();

  // The persistent sidebar lists campaigns at lg+ widths only; below that the
  // index page would otherwise claim "select a campaign" with no list in
  // sight (#1072).
  const browsableCampaigns = (campaigns ?? []).filter(
    (campaign) => campaign.status !== "archived",
  );

  return (
    <div className="min-w-0 flex-1">
      {!outlet ? (
        <>
          {browsableCampaigns.length > 0 ? (
            <nav
              aria-label="Campaigns"
              className="mb-4 space-y-1 rounded-lg border border-border/80 bg-card/70 p-2 lg:hidden"
            >
              {browsableCampaigns.map((campaign) => (
                <NavLink
                  key={campaign.id}
                  to={`${campaign.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-3 py-2 font-Zilla-Slab text-sm font-semibold text-foreground/85 hover:bg-muted"
                >
                  <span className="min-w-0 truncate">
                    {campaign.title?.trim() || `Campaign ${String(campaign.id)}`}
                  </span>
                  {campaign.status ? (
                    <StatusBadge status={campaign.status} />
                  ) : null}
                </NavLink>
              ))}
            </nav>
          ) : null}
          <CampaignEmptyState
            hasAccess={userRole === "admin" || userRole === "owner"}
            type={phoneNumbers?.length > 0 ? "campaign" : "number"}
          />
        </>
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
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
