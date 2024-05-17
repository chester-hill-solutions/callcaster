import { useLoaderData, json, redirect, useSubmit } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { setWorkspace } from "~/lib/utils";
export const loader = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers, serverSession, workspace } =
    await getSupabaseServerClientWithSession(request);
  const { data: workspaces, error } = await supabaseClient
    .from("workspace")
    .select();
  return json({ serverSession, workspace, workspaces }, { headers });
};
export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const formData = await request.formData();
  const newWorkspaceId = formData.get("workspace_id");
  const { data: newWorkspace, error } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", newWorkspaceId)
    .single();
  if (error) throw error;
  const cookie = setWorkspace(newWorkspace);
  console.log(cookie);
  headers.append("Set-Cookie", cookie);

  return redirect("/dashboard", { headers });
};

export default function SelectWorkspace() {
  const { workspaces } = useLoaderData();
  const submit = useSubmit();

  const handleWorkspace = (id) => {
    const formData = new FormData();
    formData.append("workspace_id", id);
    submit(formData, { method: "post" });
  };

  return (
    <main className="flex h-screen w-full flex-col items-center py-8 text-white">
      <h1 className="text-5xl font-bold">Select your Workspace</h1>
      <div className="mt-8 flex flex-col gap-4 rounded-md bg-gray-50 p-6 text-lg text-black shadow-md">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            onClick={() => handleWorkspace(workspace.id)}
          >
            {workspace.name}
          </button>
        ))}
      </div>
    </main>
  );
}
