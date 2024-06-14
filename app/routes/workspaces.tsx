import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { FaPlus } from "react-icons/fa";
import { FaUserPlus } from "react-icons/fa6";
import { Button } from "~/components/ui/button";
import { createNewWorkspace, getUserWorkspaces } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "~/components/ui/dialog";
import { toast, Toaster } from "sonner";
import { formatTableText } from "~/lib/utils";

//************LOADER************/
export const loader = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (!serverSession) {
    return redirect("/signin", { headers });
  }

  const { data: workspaces } = await getUserWorkspaces({ supabaseClient });
  const { data: workspaceAccessData, error: workspaceAccessError } =
    await supabaseClient
      .from("workspace_users")
      .select("workspace_id, last_accessed")
      .eq("user_id", serverSession.user.id)
      .order("last_accessed", { ascending: false });

  // console.log("Data: ", workspaceAccessData);
  // console.log("Error: ", workspaceAccessError);

  return json(
    { workspaces, userId: serverSession.user, workspaceAccessData },
    { headers },
  );
};

//************ACTION************/
export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers } =
    await getSupabaseServerClientWithSession(request);

  const formData = await request.formData();

  const newWorkspaceName = formData.get("newWorkspaceName") as string;
  const userId = formData.get("userId") as string;

  if (!newWorkspaceName || !userId) {
    return json(
      { error: "Workspace name or User Id missing!" },
      { status: 400, headers },
    );
  }

  const { data: newWorkspaceId, error } = await createNewWorkspace({
    supabaseClient,
    workspaceName: newWorkspaceName,
  });

  if (error) {
    console.log("Error: ", error);
    return json(
      { error: "Failed to create Workspace" },
      { status: 500, headers },
    );
  }

  if (newWorkspaceId) {
    return redirect(`/workspaces/${newWorkspaceId}`, { headers });
  }

  return json({ ok: true, error: null }, { headers });
};

//************COMPONENT************/
export default function Workspaces() {
  const { workspaces, userId, workspaceAccessData } =
    useLoaderData<typeof loader>();
  // console.log(workspaces);

  const actionData = useActionData<typeof action>();
  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData?.error);
    }
  }, [actionData]);

  const dialogRef = useRef<HTMLDialogElement>(null);
  console.log("Unsorted: ", workspaces);
  if (workspaces != null) {
    for (let i = 0; i < workspaceAccessData.length; i++) {
      if (workspaceAccessData[i].workspace_id === workspaces[i].id) {
        continue;
      }

      const temp = workspaces[i];
      const oldIndex = workspaces.findIndex(
        (workspace) => workspace.id === workspaceAccessData[i].workspace_id,
      );
      workspaces[i] = workspaces[oldIndex];
      workspaces[oldIndex] = temp;
    }
  }
  console.log("Sorted? ", workspaces);
  return (
    <main className="mx-auto flex h-full w-full flex-col items-center gap-16 py-16">
      <h1 className="text-center font-Zilla-Slab text-6xl font-bold text-brand-primary dark:text-white">
        Your Workspaces
      </h1>
      <div
        id="workspaces-grid"
        className="grid auto-rows-auto grid-cols-5 items-start gap-4"
      >
        <Dialog>
          <DialogTrigger>
            <Button
              variant="outline"
              className="h-full min-h-fit w-full min-w-60 border-2 border-black px-4 py-8 dark:border-white"
            >
              <div className="hidden dark:block">
                <FaPlus
                  size="72px"
                  color="white"
                  style={{
                    border: "2px solid white",
                    borderRadius: "50%",
                    padding: "0.75rem",
                  }}
                />
              </div>
              <div className="block dark:hidden">
                <FaPlus
                  size="72px"
                  color="black"
                  style={{
                    border: "2px solid black",
                    borderRadius: "50%",
                    padding: "0.75rem",
                  }}
                />
              </div>
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-brand-secondary dark:bg-inherit">
            <DialogHeader>
              <DialogTitle>
                <h3 className="text-center font-Zilla-Slab text-4xl font-black">
                  Add a New Workspace
                </h3>
              </DialogTitle>
              <DialogDescription>
                <p className="hidden">Add a New Workspace to Your Account</p>
              </DialogDescription>
            </DialogHeader>

            <Form
              className="flex w-full flex-col gap-4"
              method="POST"
              onSubmit={() => dialogRef.current?.close()}
              name="newWorkspace"
            >
              <label htmlFor="newWorkspaceName" className="flex flex-col gap-2">
                Enter your Workspace Name
                <input
                  type="text"
                  name="newWorkspaceName"
                  id="newWorkspaceName"
                  className="rounded-sm border-2 border-black bg-transparent px-4 py-2 text-xl dark:border-white"
                  required
                />
              </label>

              <input type="hidden" name="userId" value={userId.id} />
              {/* <p className="flex items-center gap-4 font-bold">
                Invite Workspace Members:{" "}
                <Button className="" type="button">
                  <FaUserPlus size="24px" />
                </Button>
              </p> */}
              <div className="flex gap-4">
                <Button
                  variant="default"
                  className="w-full text-xl"
                  type="submit"
                >
                  Create New Workspace
                </Button>
                <DialogClose asChild>
                  <Button
                    variant="ghost"
                    className="w-full text-xl"
                    type="button"
                  >
                    Close
                  </Button>
                </DialogClose>
              </div>
            </Form>
          </DialogContent>
        </Dialog>
        {workspaces != null &&
          workspaces.map((workspace) => (
            <Link
              to={`/workspaces/${workspace.id}`}
              key={workspace.id}
              className="flex h-full min-w-60 flex-col items-center justify-center  rounded-md border-2 border-black bg-brand-secondary px-4 py-8 text-center text-black 
              transition-colors duration-150 hover:bg-white dark:border-white dark:bg-transparent dark:text-white dark:hover:bg-zinc-800"
            >
              <h5 className="font-Zilla-Slab text-2xl font-semibold">
                {formatTableText(workspace.name)}
              </h5>
            </Link>
          ))}
      </div>
      <Toaster richColors />
    </main>
  );
}
