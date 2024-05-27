import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { useRef } from "react";
import { FaPlus } from "react-icons/fa";
import { FaUserPlus } from "react-icons/fa6";
import { Button } from "~/components/ui/button";
import { createNewWorkspace, getUserWorkspaces } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

//************LOADER************/
export const loader = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (!serverSession) {
    return redirect("/signin", { headers });
  }

  const { data: workspaces } = await getUserWorkspaces({ supabaseClient });

  return json({ workspaces, userId: serverSession.user }, { headers });
};

//************ACTION************/
export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers } =
    await getSupabaseServerClientWithSession(request);

  const formData = await request.formData();

  const name = formData.get("newWorkspaceName") as string;
  const userId = formData.get("userId") as string;

  if (!name || !userId) {
    return json(
      { error: "Workspace name or User Id missing!" },
      { status: 400, headers },
    );
  }

  // console.log(Object.fromEntries(formData));

  const { data, error } = await createNewWorkspace({
    supabaseClient,
    userId,
    name,
  });

  if (error) {
    console.log("Error: ", error);
    return json(
      { error: "Failed to create Workspace" },
      { status: 500, headers },
    );
  }

  if (data && data.id) {
    return redirect(`/workspaces/${data.id}`, { headers });
  }

  return json({ ok: true, error: null }, { headers });
};

//************COMPONENT************/
export default function Workspaces() {
  const { workspaces, userId } = useLoaderData<typeof loader>();
  // console.log(workspaces);

  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <main className="mx-auto flex h-full w-full flex-col items-center gap-16 py-16">
      <h1 className="text-center font-Tabac-Slab text-4xl ">
        Your Workspaces
      </h1>
      <div className="flex flex-row flex-wrap gap-4">
        {workspaces != null &&
          workspaces.map((workspace) => (
            <Link
              to={`/workspaces/${workspace.id}`}
              key={workspace.id}
              className="flex flex-col items-center gap-4 rounded-md border bg-card px-4 py-8 text-center min-w-60"
            >
              <h5 className="font-Zilla-Slab text-2xl text-white">
                {workspace.name}
              </h5>
              <p className="text-white">Workspace Description</p>
            </Link>
          ))}
        <Button
          variant="outline"
          className="h-full min-h-fit border border-white px-4 py-8 min-w-60"
          onClick={() => dialogRef.current?.showModal()}
        >
          <FaPlus
            size="72px"
            style={{
              border: "1px solid white",
              borderRadius: "50%",
              padding: "0.75rem",
            }}
          />
        </Button>
      </div>
      <dialog ref={dialogRef} className="rounded-md bg-indigo-400 p-8">
        <div className="flex flex-col gap-4">
          <h3 className="font-Tabac-Slab text-4xl font-black">
            Add a New Workspace
          </h3>
          <Form
            className="flex w-full flex-col gap-4"
            method="POST"
            onSubmit={() => dialogRef.current?.close()}
            name="newWorkspace"
          >
            <label htmlFor="newWorkspaceName" className="flex flex-col">
              Workspace Name
              <input
                type="text"
                name="newWorkspaceName"
                id="newWorkspaceName"
                className="rounded-sm border-2 border-white bg-transparent px-4 py-2 text-xl"
                required
              />
            </label>

            <input type="hidden" name="userId" value={userId.id} />
            <p className="flex items-center gap-4 font-bold">
              Invite Workspace Members:{" "}
              <Button className="" type="button">
                <FaUserPlus size="24px" />
              </Button>
            </p>
            <Button
              variant="default"
              className="max-w-[66%] self-center"
              type="submit"
            >
              Create New Workspace
            </Button>
          </Form>
        </div>
      </dialog>
    </main>
  );
}
