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
import { Button } from "~/components/ui/button";
import {
  getWorkspaceCampaigns,
  getWorkspaceInfo,
  updateUserWorkspaceAccess,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const loader = async ({ request, params }) => {
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

  updateUserWorkspaceAccess({ workspaceId, supabaseClient });

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
    return json({ workspace, audiences, campaigns }, { headers });
  } catch (error) {
    console.log(error);
    return json(error, 500);
  }
};

export default function Workspace() {
  const { workspace, audiences, campaigns } = useLoaderData();

  campaigns.sort((campaign1, campaign2) => {
    if (campaign1.created_at < campaign2.created_at) {
      return 1;
    } else if (campaign1.created_at > campaign2.created_at) {
      return -1;
    }

    return 0;
  });

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
    <main className="mx-auto mt-8 h-full w-[80%] items-center">
      <div className="mb-2 flex items-center">
        <div className="flex flex-1 justify-between">
          <div className="flex gap-4">
            <Button asChild variant="outline">
              <Link
                to={`./audios`}
                relative="path"
                className="border-2 border-zinc-300 font-Zilla-Slab text-xl font-semibold "
              >
                Audio
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                to={`./audiences`}
                relative="path"
                className="border-2 border-zinc-300 font-Zilla-Slab text-xl font-semibold"
              >
                Audiences
              </Link>
            </Button>
          </div>
          <h3 className="absolute left-1/2 translate-x-[-50%] font-Tabac-Slab text-2xl">
            {workspace?.name}
          </h3>
          <Button asChild variant="outline">
            <Link
              to={`./settings`}
              relative="path"
              className="border-2 border-zinc-300 font-Zilla-Slab text-xl font-semibold"
            >
              Workspace Settings
            </Link>
          </Button>
        </div>
      </div>
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
        <div className="min-h-3/4 flex w-full flex-auto dark:bg-zinc-700">
          <div className="flex flex-auto flex-col">
            <Outlet
              context={{
                audiences,
                campaigns,
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
