export { loader } from "./campaigns.loader.server";

import { redirect, LoaderFunctionArgs, Outlet, useOutlet, useOutletContext } from "react-router";
import CampaignEmptyState from "@/components/campaign/CampaignEmptyState";
import { MemberRole } from "@/components/workspace/TeamMember";
import {
  Audience,
  WorkspaceData,
  WorkspaceNumbers,
  Campaign,
} from "@/lib/types";

import { SupabaseClient } from "@supabase/supabase-js";

;

export default function WorkspaceCampaignsPage() {
  const outlet = useOutlet();
  const { audiences, campaigns, phoneNumbers, userRole, workspace, supabase } =
    useOutletContext<{
      audiences: Audience[];
      campaigns: Campaign[];
      phoneNumbers: WorkspaceNumbers[];
      userRole: MemberRole;
      workspace: WorkspaceData;
      supabase: SupabaseClient;
    }>();

  return (
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
            supabase,
          }}
        />
      )}
    </div>
  );
}
