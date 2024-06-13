import {
  json,
  redirect,
  useLoaderData,
  useNavigate,
  Link,
  Outlet,
} from "@remix-run/react";
import { PlusIcon } from "~/components/Icons";
import { Button } from "~/components/ui/button";
import { getWorkspaceCampaigns, getWorkspaceInfo } from "~/lib/database.server";
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

  return (
    <main className="mx-auto mt-8 h-full w-[80%] items-center">
      <div className="flex items-center">
        <div className="flex flex-1 justify-center">
          <h3 className="ml-auto font-Tabac-Slab text-2xl">
            {workspace?.name}
          </h3>
          <div className="ml-auto flex gap-4">
            <Button asChild variant="outline">
              <Link
                to={`./media`}
                relative="path"
                className="font-Zilla-Slab text-xl font-semibold"
              >
                Media
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                to={`./audiences`}
                relative="path"
                className="font-Zilla-Slab text-xl font-semibold"
              >
                Audiences
              </Link>
            </Button>
            <Button asChild>
              <Link
                to={`./settings`}
                relative="path"
                className="font-Zilla-Slab text-xl font-semibold"
              >
                Users
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-auto">
        <div className="flex h-[80vh] w-60 min-w-60 flex-col overflow-scroll border-2 border-solid border-slate-800 bg-cyan-50">
          <h3 className="border-b-2 border-solid border-slate-500 bg-primary p-2 text-center font-Zilla-Slab text-xl text-white">
            Campaigns
          </h3>
          {campaigns?.map((row, i) => (
            <Link
              to={`campaigns/${row.id}`}
              key={row.id}
              className="border-b-2 border-solid border-slate-500 p-2 text-brand-primary hover:bg-slate-300 hover:text-slate-800"
            >
              <h3>{row.title || `Unnamed campaign ${i + 1}`}</h3>
            </Link>
          ))}
          <Link to={`campaigns/new`} className="flex justify-center p-4">
            <PlusIcon fill="#333" width="25px" />
          </Link>
        </div>
        <div className="flex-auto">
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
