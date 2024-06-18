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
import { FaPlus } from "react-icons/fa6";
import { PlusIcon } from "~/components/Icons";
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
    console.log("~~~~~~~~~~Refreshing JWT~~~~~~~~~~~");
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

  // campaigns.sort((campaign1, campaign2) => {
  //   if (campaign1.created_at < campaign2.created_at) {
  //     return 1;
  //   } else if (campaign1.created_at > campaign2.created_at) {
  //     return -1;
  //   }

  //   return 0;
  // });

  function handleNavlinkStyles(isActive: boolean, isPending: boolean): string {
    if (isActive) {
      return "border-b-2 border-solid border-zinc-600 bg-brand-primary p-2 text-xl font-semibold text-white hover:bg-slate-300 hover:text-slate-800 dark:text-white";
    }

    if (isPending) {
      return "border-b-2 border-solid border-zinc-600 bg-brand-tertiary p-2 text-xl font-semibold text-black hover:bg-slate-300 hover:text-slate-800 dark:text-white";
    }

    return "border-b-2 border-solid border-zinc-600 p-2 text-xl font-semibold text-brand-primary hover:bg-slate-300 hover:text-slate-800 dark:text-white";
  }

  return (
    <main className="mx-auto h-full w-[80%] items-center py-8">
      <WorkspaceNav
        workspace={workspace}
        isInChildRoute={false}
        userRole={userRole}
      />
      <div id="campaigns-container" className="flex border-2 border-zinc-600">
        <div
          className="flex min-h-[600px] w-60 min-w-60 flex-col overflow-scroll border-r-2 border-zinc-400 bg-brand-secondary  dark:bg-transparent"
          style={{ scrollbarWidth: "none" }}
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
            >
              <h3 className="capitalize">
                {row.title || `Unnamed campaign ${i + 1}`}
              </h3>
            </NavLink>
          ))}
        </div>
        <div className="min-h-3/4 flex w-full flex-auto overflow-hidden dark:bg-zinc-700">
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
