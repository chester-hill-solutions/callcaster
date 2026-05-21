import React, { useEffect, useMemo } from "react";
import { ActionFunctionArgs, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  NavLink,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
import { FaPlus } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { createNewWorkspace } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";
import { toast } from "sonner";
import { handleRoleTextStyles, MemberRole } from "@/components/workspace/TeamMember";
import { Section, SectionHeader } from "@/components/shared/Section";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Heading } from "@/components/ui/typography";
export { ErrorBoundary } from "@/components/shared/ErrorBoundary";

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
  const { supabaseClient, headers, user } = await verifyAuth(request);

  if (!user) {
    return redirect("/signin", { headers });
  }

  const userId = user.id;
  if (!userId) {
    return redirect("/signin", { headers });
  }

  const { data: workspaces, error: workspacesError } = await supabaseClient
    .from("workspace_users")
    .select("last_accessed, role, workspace(id, name)")
    .eq("user_id", userId)
    .order("last_accessed", { ascending: false });

  if (workspacesError) {
    return { workspaces: null, userId: userId, error: workspacesError }
  }
  return { workspaces: workspaces, userId: userId, error: null };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const formData = await request.formData();

  const newWorkspaceName = formData.get("newWorkspaceName") as string;
  const userId = formData.get("userId") as string;

  if (!newWorkspaceName || !userId) {
    return { error: "Workspace name or User Id missing!" };
  }

  const { data: newWorkspaceId, error } = await createNewWorkspace({
    supabaseClient,
    workspaceName: newWorkspaceName,
    user_id: userId,
  });
  if (error) {
    logger.error("Error creating workspace:", error);
    return { error: "Failed to create Workspace" };
  }

  if (newWorkspaceId) {
    return redirect(`/workspaces/${newWorkspaceId}`, { headers });
  }

  return { ok: true, error: null };
};

const WorkspaceCard = React.memo(
  ({ workspace, role }: { workspace: Workspace; role: MemberRole }) => {
    return (
      <NavLink
        prefetch="intent"
        to={`/workspaces/${workspace.id}`}
        className="flex h-full flex-col items-center justify-center rounded-lg border border-border bg-card p-4 text-center text-card-foreground shadow-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground dark:border-white/20 dark:hover:bg-zinc-800"
      >
        <h5 className="mb-2 max-h-[100px] overflow-hidden overflow-ellipsis font-Zilla-Slab text-2xl font-semibold text-brand-primary dark:text-white">
          {workspace.name}
        </h5>
        <p className={`text-xl capitalize ${handleRoleTextStyles(role)}`}>
          {role}
        </p>
      </NavLink>
    );
  },
);
WorkspaceCard.displayName = "WorkspaceCard";

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
          <h3 className="text-center font-Zilla-Slab text-4xl font-black text-brand-primary dark:text-white">
            Add a New Workspace
          </h3>
        </DialogTitle>
      </DialogHeader>
      <Form
        className="flex w-full flex-col gap-4"
        method="POST"
        name="newWorkspace"
      >
        <FormField htmlFor="newWorkspaceName" label="Enter your Workspace Name">
          <Input
            type="text"
            name="newWorkspaceName"
            id="newWorkspaceName"
            className="text-xl"
            required
          />
        </FormField>
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
  const [searchParams] = useSearchParams();
  const isBusy = state !== "idle";
  const paymentStatus = searchParams.get("payment_status");
  const paymentMessage = searchParams.get("payment_message");

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (error) {
      toast.error(error);
    }
    if (paymentStatus === "error" && paymentMessage) {
      toast.error(paymentMessage);
    }
  }, [actionData, error, paymentMessage, paymentStatus]);

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
      <Heading className="text-center" branded>
        Your Workspaces
      </Heading>
      <Section className="w-full">
        <SectionHeader
          branded
          title="Workspace Directory"
          description="Choose an existing workspace or create a new one."
        />
        <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
          <div className="w-full sm:w-48">
            <NewWorkspaceDialog userId={userId} isBusy={isBusy} />
          </div>
          {workspaceCards}
        </div>
      </Section>
    </main>
  );
}
