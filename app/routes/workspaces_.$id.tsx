import { useState } from "react";
import { LoaderFunctionArgs } from "@remix-run/node";
import {
  json,
  redirect,
  useLoaderData,
  useNavigate,
  Link,
  Outlet,
  NavLink,
} from "@remix-run/react";
import { FaPlus, FaChevronDown, FaChevronUp } from "react-icons/fa";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { Button } from "~/components/ui/button";
import {
  forceTokenRefresh,
  getUserRole,
  getWorkspaceCampaigns,
  getWorkspaceInfo,
  updateUserWorkspaceAccessDate,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

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
    return json({ workspace, audiences, campaigns, userRole }, { headers });
  } catch (error) {
    console.log(error);
    return json({ userRole, error }, 500);
  }
};

export default function Workspace() {
  const { workspace, audiences, campaigns, userRole } = useLoaderData();
  const [campaignsListOpen, setCampaignsListOpen] = useState(false);

  function handleNavlinkStyles(isActive: boolean, isPending: boolean): string {
    if (isActive) {
      return "border-b-2 border-solid border-zinc-600 bg-brand-primary p-2 text-xl font-semibold text-white hover:bg-slate-300 hover:text-slate-800 dark:text-white";
    }

    if (isPending) {
      return "border-b-2 border-solid border-zinc-600 bg-brand-tertiary p-2 text-xl font-semibold text-black hover:bg-slate-300 hover:text-slate-800 dark:text-white";
    }

    return "border-b-2 border-solid border-zinc-600 p-2 text-xl font-semibold text-brand-primary hover:bg-slate-300 hover:text-slate-800 dark:text-white";
  }

  const CampaignsList = () => (
    <div
      className={`bg-brand-secondary transition-all duration-300 ease-in-out dark:bg-zinc-800 sm:max-h-full sm:bg-secondary md:h-auto md:overflow-visible flex flex-col ${
        campaignsListOpen
          ? "h-[600px] overflow-y-auto"
          : "max-h-0 overflow-hidden"
      }`}
      style={{ height: "100%" }}
    >
      <Link
        to={`campaigns/new`}
        className="flex items-center justify-center gap-2 border-b-2 border-zinc-600 px-2 py-1 font-Zilla-Slab text-xl font-bold dark:bg-brand-primary dark:text-white"
      >
        <span>Add Campaign</span>
        <FaPlus size="20px" />
      </Link>
      {campaigns?.map((row, i) => (
        <NavLink
          to={`campaigns/${row.id}`}
          key={row.id}
          className={({ isActive, isPending }) =>
            handleNavlinkStyles(isActive, isPending)
          }
          onClick={() => setCampaignsListOpen(false)}
        >
          {row.title || `Unnamed campaign ${i + 1}`}
        </NavLink>
      ))}
    </div>
  );

  return (
    <main className="mx-auto h-full w-full max-w-7xl px-4 py-8 md:w-[80%]">
      <WorkspaceNav
        workspace={workspace}
        isInChildRoute={false}
        userRole={userRole}
      />
      <div id="campaigns-container" className="flex flex-col md:flex-row">
        <div className="w-full md:w-60 md:min-w-60">
          <Button
            className="flex w-full items-center justify-between md:hidden"
            onClick={() => setCampaignsListOpen(!campaignsListOpen)}
          >
            <span>Campaigns</span>
            {campaignsListOpen ? <FaChevronUp /> : <FaChevronDown />}
          </Button>
          <CampaignsList />
        </div>
        <div className="min-h-[600px] w-full flex-auto overflow-hidden dark:bg-zinc-700">
          <Outlet
            context={{
              audiences,
              campaigns,
            }}
          />
        </div>
      </div>
    </main>
  );
}
