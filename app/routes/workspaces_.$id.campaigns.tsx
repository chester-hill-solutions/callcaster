import { redirect, LoaderFunctionArgs } from "@remix-run/node";
import {
  Outlet,
  useOutlet,
  useOutletContext,
} from "@remix-run/react";
import CampaignEmptyState from "@/components/campaign/CampaignEmptyState";
import { MemberRole } from "@/components/workspace/TeamMember";
import { Audience, WorkspaceData, WorkspaceNumbers } from "@/lib/types";
import { Campaign } from "@/lib/types";
import { verifyAuth } from "@/lib/supabase.server";
import { SupabaseClient } from "@supabase/supabase-js";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { headers, user } = await verifyAuth(request);  
  if (!user) {
    return redirect("/signin", { headers });
  }
  return null;
};

export default function SelectedType() {
  const outlet = useOutlet();
  const { audiences, campaigns, phoneNumbers, userRole, workspace, supabase } = useOutletContext<{ audiences: Audience[], campaigns: Campaign[], phoneNumbers: WorkspaceNumbers[], userRole: MemberRole, workspace: WorkspaceData, supabase: SupabaseClient }>();
  return !outlet ? (
    <CampaignEmptyState
      hasAccess={userRole === "admin" || userRole === "owner"}
      type={phoneNumbers?.length > 0 ? "campaign" : "number"}
    />
  ) : (
    <Outlet context={{ audiences, campaigns, phoneNumbers, userRole, workspace, supabase }} />
  );
}
