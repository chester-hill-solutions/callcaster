import { redirect, LoaderFunctionArgs } from "@remix-run/node";
import {
  Outlet,
  useOutlet,
  useOutletContext,
} from "@remix-run/react";
import CampaignEmptyState from "~/components/CampaignEmptyState";
import { MemberRole } from "~/components/Workspace/TeamMember";
import { Audience, WorkspaceNumbers } from "~/lib/types";
import { Campaign } from "~/lib/types";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Flags } from "~/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession) {
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
