import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { FaPlus } from "react-icons/fa";
import { Button } from "~/components/ui/button";
import { createNewWorkspace, forceTokenRefresh } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

import { Toaster, toast } from "sonner";
import { handleRoleTextStyles } from "~/components/Workspace/TeamMember";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { formatTableText } from "~/lib/utils";
import { Session } from "@supabase/supabase-js";
import { jwtDecode } from "jwt-decode";

//************LOADER************/
export const loader = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (!serverSession) {
    return redirect("/signin", { headers });
  }

  const userId = serverSession.user.id;
  const { data: workspaces, error: workspacesError } = await supabaseClient
    .from("workspace_users")
    .select("last_accessed, role, workspace(id, name)")
    .eq("user_id", userId)
    .order("last_accessed", { ascending: false });

  if (workspacesError) {
    console.log(workspacesError);
    return json(
      { workspaces: null, userId: userId, error: workspacesError },
      { headers },
    );
  }

  // const { data: workspaces } = await getUserWorkspaces({ supabaseClient });
  // const { data: workspaceAccessData, error: workspaceAccessError } =
  //   await supabaseClient
  //     .from("workspace_users")
  //     .select("workspace_id, last_accessed")
  //     .eq("user_id", serverSession.user.id)
  //     .order("last_accessed", { ascending: false });

  // if (workspaceAccessError) {
  //   return json(
  //     {
  //       workspaces: null,
  //       userId: serverSession.user.id,
  //       error: workspaceAccessError,
  //     },
  //     { headers },
  //   );
  // }

  // const workspaces = [];
  // for (let workspaceUser of workspaceAccessData) {
  //   const { data: workspace, error: workspaceError } = await supabaseClient
  //     .from("workspace")
  //     .select()
  //     .eq("id", workspaceUser.workspace_id)
  //     .single();

  //   if (workspaceError) {
  //     return json(
  //       {
  //         workspaces: null,
  //         userId: serverSession.user.id,
  //         error: workspaceError,
  //       },
  //       { headers },
  //     );
  //   }
  //   workspaces.push(workspace);
  // }

  // console.log("Data: ", workspaceAccessData);
  // console.log("Error: ", workspaceAccessError);

  return json(
    { workspaces: workspaces, userId: userId, error: null },
    { headers },
  );
};

//************ACTION************/
export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
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
    const { data: refreshData, error: refreshError } = await forceTokenRefresh({
      supabaseClient,
      serverSession,
    });
    return redirect(`/workspaces/${newWorkspaceId}`, { headers });
  }

  return json({ ok: true, error: null }, { headers });
};

//************COMPONENT************/
export default function Workspaces() {
  const { workspaces, userId, error } = useLoaderData<typeof loader>();
  // console.log(workspaces);

  const actionData = useActionData<typeof action>();
  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData?.error);
    }
  }, [actionData]);

  const dialogRef = useRef<HTMLDialogElement>(null);

  // if (workspaces != null) {
  //   for (let i = 0; i < workspaceAccessData.length; i++) {
  //     if (workspaceAccessData[i].workspace_id === workspaces[i].id) {
  //       continue;
  //     }

  //     const temp = workspaces[i];
  //     const oldIndex = workspaces.findIndex(
  //       (workspace) => workspace.id === workspaceAccessData[i].workspace_id,
  //     );
  //     workspaces[i] = workspaces[oldIndex];
  //     workspaces[oldIndex] = temp;
  //   }
  // }

  return (
    <main className="mx-auto flex h-full w-full flex-col items-center gap-16 py-16">
      <h1 className="text-center font-Zilla-Slab text-6xl font-bold text-brand-primary dark:text-white">
        Your Workspaces
      </h1>
      <div
        id="workspaces-grid"
        className="auto-rows-[minmax(fit-content, auto)] grid grid-cols-[repeat(5,_minmax(50px,_200px))] items-start gap-4"
      >
        <Dialog>
          <DialogTrigger className="h-full">
            <Button
              variant="outline"
              className="h-full w-full border-2 border-black px-4 py-8 dark:border-white"
            >
              <div className="hidden dark:block">
                <FaPlus size="72px" color="white" />
              </div>
              <div className="block dark:hidden">
                <FaPlus size="72px" color="black" />
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

              <input type="hidden" name="userId" value={userId} />
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
          workspaces.map((workspaceUser) => {
            const workspace = workspaceUser.workspace;
            return (
              <Link
                to={`/workspaces/${workspace.id}`}
                key={workspace.id}
                className="flex h-full flex-col items-center justify-center  rounded-md border-2 border-black bg-brand-secondary px-4 py-8 text-center text-black 
        transition-colors duration-150 hover:bg-white dark:border-white dark:bg-transparent dark:text-white dark:hover:bg-zinc-800"
              >
                <h5 className="max-h-[100px] overflow-hidden overflow-ellipsis font-Zilla-Slab text-2xl font-semibold">
                  {formatTableText(workspace.name)}
                </h5>
                <p
                  className={`${handleRoleTextStyles(workspaceUser.role)} text-xl capitalize`}
                >
                  {workspaceUser.role}
                </p>
              </Link>
            );
          })}
      </div>
      <Toaster richColors />
    </main>
  );
}
