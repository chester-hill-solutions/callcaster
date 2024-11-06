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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession) {
    return redirect("/signin", { headers });
  }
  return null;
};

export default function SelectedType() {
  const outlet = useOutlet();
  const { selectedTable, audiences, campaigns, phoneNumbers, userRole, flags, supabase } = useOutletContext<{ selectedTable: string, audiences: Audience[], campaigns: Campaign[], phoneNumbers: WorkspaceNumbers[], userRole: MemberRole, flags: Flags, supabase: SupabaseClient }>();
  return !outlet ? (
    <CampaignEmptyState
      hasAccess={userRole === "admin" || userRole === "owner"}
      type={phoneNumbers?.length > 0 ? "campaign" : "number"}
    />
  ) : (
    <Outlet context={{ selectedTable, audiences, campaigns, flags, supabase }} />
  );
}
