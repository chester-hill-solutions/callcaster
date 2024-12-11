import React, { useEffect, useMemo } from "react";
import { ActionFunctionArgs, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { FaPlus } from "react-icons/fa";
import { Button } from "~/components/ui/button";
import { createNewWorkspace, forceTokenRefresh } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Toaster, toast } from "sonner";
import { handleRoleTextStyles, MemberRole } from "~/components/Workspace/TeamMember";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

export { ErrorBoundary } from "~/components/ErrorBoundary";

interface Workspace {
  id: string;
  name: string;
}

interface WorkspaceUser {
  last_accessed: string;
  role: string;
  workspace: Workspace;
}

interface LoaderData {
  workspaces: WorkspaceUser[] | null;
  userId: string;
  error: string | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (!serverSession) {
    return redirect("/signin", { headers });
  }

  const userId = serverSession.user.id;
  if (!userId) {
    return redirect("/signin", { headers });
  }

  const { data: workspaces, error: workspacesError } = await supabaseClient
    .from("workspace_users")
    .select("last_accessed, role, workspace(id, name)")
    .eq("user_id", userId)
    .order("last_accessed", { ascending: false });

  if (workspacesError) {
    return json(
      { workspaces: null, userId: userId, error: workspacesError },
      { headers },
    );
  }
  return json(
    { workspaces: workspaces, userId: userId, error: null },
    { headers },
  );
};

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
    user_id: serverSession?.user.id,
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

const WorkspaceCard = React.memo(
  ({ workspace, role }: { workspace: Workspace; role: MemberRole }) => {
    return (
      <Link
        to={`/workspaces/${workspace.id}`}
        className="flex h-full flex-col items-center justify-center rounded-md border-2 border-black bg-brand-secondary p-4 text-center text-black transition-colors duration-150 hover:bg-white dark:border-white dark:bg-transparent dark:text-white dark:hover:bg-zinc-800"
      >
        <h5 className="mb-2 max-h-[100px] overflow-hidden overflow-ellipsis font-Zilla-Slab text-2xl font-semibold">
          {workspace.name}
        </h5>
        <p className={`text-xl capitalize ${handleRoleTextStyles(role)}`}>
          {role}
        </p>
      </Link>
    );
  },
);

const NewWorkspaceDialog = ({
  userId,
  isBusy,
}: {
  userId: string;
  isBusy: boolean;
}) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button
        variant="outline"
        className="h-full w-full border-2 border-black px-4 py-8 dark:border-white"
        aria-label="Add new workspace"
        disabled={isBusy}
      >
        <FaPlus size="72px" className="text-black dark:text-white" />
      </Button>
    </DialogTrigger>
    <DialogContent className="bg-brand-secondary dark:bg-inherit">
      <DialogHeader>
        <DialogTitle>
          <h3 className="text-center font-Zilla-Slab text-4xl font-black">
            Add a New Workspace
          </h3>
        </DialogTitle>
      </DialogHeader>
      <Form
        className="flex w-full flex-col gap-4"
        method="POST"
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
        <div className="flex gap-4">
          <Button
            variant="default"
            className="w-full text-xl"
            type="submit"
            disabled={isBusy}
          >
            Create New Workspace
          </Button>
          <DialogClose asChild>
            <Button
              variant="ghost"
              className="w-full text-xl"
              type="button"
              disabled={isBusy}
            >
              Close
            </Button>
          </DialogClose>
        </div>
      </Form>
    </DialogContent>
  </Dialog>
);


export default function Workspaces() {
  const { workspaces, userId, error } = useLoaderData<LoaderData>();
  const actionData = useActionData<typeof action>();
  const { state } = useNavigation();
  const isBusy = state !== "idle";

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (error) {
      toast.error(error);
    }
  }, [actionData, error]);

  const workspaceCards = useMemo(
    () =>
      workspaces?.map((workspaceUser) => (
        <div key={workspaceUser.workspace.id} className="w-full sm:w-48">
          <WorkspaceCard
            workspace={workspaceUser.workspace}
            role={workspaceUser.role as MemberRole}
          />
        </div>
      )),
    [workspaces],
  );

  return (
    <main className="mx-auto flex h-full w-full max-w-7xl flex-col items-center gap-8 px-4 py-8">
      <h1 className="text-center font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
        Your Workspaces
      </h1>
      <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
        <div className="w-full sm:w-48">
          <NewWorkspaceDialog userId={userId} isBusy={isBusy} />
        </div>
        {workspaceCards}
      </div>
      <Toaster richColors />
    </main>
  );
}
