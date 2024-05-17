import { json, redirect, useLoaderData, useLocation } from "@remix-run/react";
import { WorkspaceDropdown } from "~/components/WorkspaceDropdown";
import { getWorkspaceInfo } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const loader = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (!serverSession) {
    return redirect("/signin", { headers });
  }

  const workspaceId = request.url.split("/").at(-1);
  const { data: workspace } = await getWorkspaceInfo({
    supabaseClient,
    workspaceId,
  });

  return json({ workspace }, { headers });
};

export default function Workspace() {
  const { workspace } = useLoaderData<typeof loader>();

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col items-center gap-16 rounded-sm border-2 border-white text-white">
      {/* <h1 className="text-center font-Tabac-Slab text-4xl font-black text-white">
        Workspace: {workspace?.name}
      </h1> */}
      <div
        id="controls-bar"
        className="flex w-full items-center gap-8 border-b-2 border-white px-8 py-4"
      >
        <WorkspaceDropdown />
      </div>
      <div className="h-full">CONTENT GOES HERE</div>
    </main>
  );
}
