import { Outlet, useOutlet } from "@remix-run/react";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import CampaignEmptyState from "@/components/campaign/CampaignEmptyState";
import CampaignsList from "@/components/campaign/CampaignList";
import { Button } from "@/components/ui/button";
import { MemberRole } from "@/components/workspace/TeamMember";
import type { CampaignRailOutletContext } from "@/lib/remix-outlet-context";
import type { WorkspaceData } from "@/lib/types";
import { useWorkspaceOutletContext } from "@/lib/remix-outlet-context";

export default function WorkspaceCampaignsPage() {
  const [campaignRailOpen, setCampaignRailOpen] = useState(false);
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
    <div className="flex min-h-[68vh] flex-col gap-4 lg:flex-row">
      <div className="w-full shrink-0 lg:w-[300px]">
        <Button
          variant="outline"
          className="mb-2 flex w-full items-center justify-between font-Zilla-Slab font-semibold lg:hidden"
          onClick={() => setCampaignRailOpen((current) => !current)}
        >
          <span>Campaign rail</span>
          {campaignRailOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        <div className={`${campaignRailOpen ? "block" : "hidden"} lg:block`}>
          <CampaignsList
            campaigns={campaigns}
            userRole={userRole as MemberRole}
            setCampaignsListOpen={setCampaignRailOpen}
          />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {!outlet ? (
          <CampaignEmptyState
            hasAccess={userRole === "admin" || userRole === "owner"}
            type={phoneNumbers?.length > 0 ? "campaign" : "number"}
          />
        ) : (
          <Outlet context={campaignRailContext} />
        )}
      </div>
    </div>
  );
}
