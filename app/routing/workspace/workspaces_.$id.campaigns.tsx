import { Outlet, useOutlet } from "@remix-run/react";
import CampaignEmptyState from "@/components/campaign/CampaignEmptyState";
import type { CampaignRailOutletContext } from "@/lib/remix-outlet-context";
import type { WorkspaceData } from "@/lib/types";
import { useWorkspaceOutletContext } from "@/lib/remix-outlet-context";

export default function WorkspaceCampaignsPage() {
  const outlet = useOutlet();
  const { audiences, campaigns, phoneNumbers, userRole, workspace, supabase } =
    useWorkspaceOutletContext();

  const campaignRailContext: CampaignRailOutletContext = {
    audiences,
    campaigns,
    phoneNumbers,
    userRole,
    workspace: workspace as unknown as WorkspaceData,
    supabase,
  };

  return (
    <div className="min-h-[68vh] min-w-0">
      {!outlet ? (
        <CampaignEmptyState
          hasAccess={userRole === "admin" || userRole === "owner"}
          type={phoneNumbers?.length > 0 ? "campaign" : "number"}
        />
      ) : (
        <Outlet context={campaignRailContext} />
      )}
    </div>
  );
}
