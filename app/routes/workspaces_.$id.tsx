import { useState } from "react";
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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession) {
    return redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  const { data: workspace, error } = await getWorkspaceInfo({
    supabaseClient,
    workspaceId,
  });

  if (error) {
    console.log(error);
    if (error.code === "PGRST116") {
      return redirect("/workspaces", { headers });
    }
  }

  updateUserWorkspaceAccessDate({ workspaceId, supabaseClient });
  const userRole = getUserRole({ serverSession, workspaceId });
  if (userRole == null) {
    const { data: refreshData, error: refreshError } = await forceTokenRefresh({
      serverSession,
      supabaseClient,
    });
  }

  try {
    const { data: audiences, error: audiencesError } = await supabaseClient
      .from("audience")
      .select()
      .eq("workspace", workspaceId);
    if (audiencesError) throw { audiencesError };

    const { data: campaigns, error: campaignsError } =
      await getWorkspaceCampaigns({
        supabaseClient,
        workspaceId,
      });
    if (campaignsError) throw { campaignsError };

    const { data: phoneNumbers, error: numbersError } =
      await getWorkspacePhoneNumbers({ supabaseClient, workspaceId });
    if (numbersError) throw { numbersError };

    return json(
      { workspace, audiences, campaigns, userRole, numbersError },
      { headers },
    );
  } catch (error) {
    console.log(error);
    return json({ userRole, error }, 500);
  }
};

export default function Workspace() {
  const { workspace, audiences, campaigns, userRole, numbers } =
    useLoaderData();
  const [campaignsListOpen, setCampaignsListOpen] = useState(false);
  const outlet = useOutlet();
  const context = useOutletContext();

  return (
    <main className="container mx-auto flex min-h-[80vh] flex-col py-10">
      <WorkspaceNav
        workspace={workspace}
        isInChildRoute={false}
        userRole={userRole}
      />
      <div className="flex flex-grow flex-col gap-8 sm:flex-row">
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
        <div className="flex flex-auto flex-col overflow-x-auto contain-content">
          {!numbers?.length > 0 ? (
            
          ) : !outlet ? (
            <CampaignEmptyState
              hasAccess={userRole === "admin" || userRole === "owner"}
            />
          ) : (
            <Outlet context={{ audiences, campaigns, ...context }} />
          )}
        </div>
      </div>
    </main>
  );
}
