import { Context, useState } from "react";
import { LoaderFunctionArgs } from "@remix-run/node";
import {
  json,
  redirect,
  useLoaderData,
  Outlet,
  useOutlet,
  useOutletContext,
} from "@remix-run/react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { Button } from "~/components/ui/button";
import {
  checkSchedule,
  forceTokenRefresh,
  getUserRole,
  getWorkspaceCampaigns,
  getWorkspaceInfo,
  getWorkspacePhoneNumbers,
  updateUserWorkspaceAccessDate,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import CampaignEmptyState from "~/components/CampaignEmptyState";
import CampaignsList from "~/components/CampaignList";
import { Audience, Campaign, ContextType, Flags, WorkspaceData, WorkspaceNumbers } from "~/lib/types";
import { MemberRole } from "~/components/Workspace/TeamMember";

type LoaderData = Promise<{
  workspace:WorkspaceData;
  audiences:Audience[];
  campaigns:Campaign[];
  userRole:MemberRole;
  phoneNumbers: WorkspaceNumbers[];
  flags:Flags;
}| typeof redirect> 

export const loader = async ({ request, params }: LoaderFunctionArgs):LoaderData => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession) {
    throw redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (!workspaceId) throw new Error("No workspace found");
  const { data: workspace, error } = await getWorkspaceInfo({
    supabaseClient,
    workspaceId,
  });

  if (error) {
    console.log(error);
    if (error.code === "PGRST116") {
      throw redirect("/workspaces", { headers });
    }
  }

  updateUserWorkspaceAccessDate({ workspaceId, supabaseClient });
  const userRole = getUserRole({ serverSession, workspaceId });
  if (userRole == null) {
    const {error: refreshError } = await forceTokenRefresh({
      serverSession,
      supabaseClient,
    });
    if (refreshError) throw refreshError
  }
  const {data:flags, error: flagsError} = await supabaseClient.from("workspace").select("feature_flags").eq("id", workspaceId).single();
  if (flagsError) throw (flagsError)
  try {
    const { data: audiences, error: audiencesError } = await supabaseClient
      .from("audience")
      .select()
      .eq("workspace", workspaceId);
    if (audiencesError) throw { audiencesError };

    const { data: campaignsList, error: campaignsError } =
      await getWorkspaceCampaigns({
        supabaseClient,
        workspaceId,
      });
    if (campaignsError) throw { campaignsError };
    const { data: phoneNumbers, error: numbersError } =
      await getWorkspacePhoneNumbers({ supabaseClient, workspaceId });
    if (numbersError) throw { numbersError };

    return json(
      { workspace, audiences, campaigns:campaignsList, userRole, phoneNumbers, flags:flags.feature_flags },
      { headers },
    );
  } catch (error) {
    console.log(error);
    return json({ userRole, error }, 500);  
  }
};

export default function Workspace() {
  const { workspace, audiences, campaigns, userRole, phoneNumbers, flags } = useLoaderData<LoaderData>();
  const [campaignsListOpen, setCampaignsListOpen] = useState(false);
  const outlet = useOutlet();
  const context = useOutletContext<Context<ContextType>>();
  return (
    <main className="container mx-auto flex min-h-[80vh] flex-col py-10">
      <WorkspaceNav
        flags={flags}
        workspace={workspace}
        userRole={userRole}
      />
      <div className="flex flex-grow flex-col gap-4 sm:flex-row">
        <div className="relative w-full flex-shrink-0 rounded-lg border-2 border-gray-300 bg-secondary dark:bg-slate-900 sm:w-[250px]">
          <Button
            variant="outline"
            className="flex w-full items-center justify-between md:hidden"
            onClick={() => setCampaignsListOpen(!campaignsListOpen)}
          >
            <span>Campaigns</span>
            {campaignsListOpen ? <FaChevronUp /> : <FaChevronDown />}
          </Button>
          <div
            className={`${campaignsListOpen ? "block" : "hidden"} h-full md:flex`}
          >
            <CampaignsList
              campaigns={campaigns}
              userRole={userRole}
              setCampaignsListOpen={setCampaignsListOpen}
            />
          </div>
        </div>
        <div className="flex flex-auto flex-col contain-content overflow-hidden">
          {!outlet ? (
            <CampaignEmptyState
              hasAccess={Boolean(userRole === "admin" || userRole === "owner")}
              type={phoneNumbers?.length > 0 ? "campaign" : "number"}
            />
          ) : (
            <Outlet context={{ audiences, campaigns, phoneNumbers, userRole, flags, ...context }} />
          )}
        </div>
      </div>
    </main>
  );
}
