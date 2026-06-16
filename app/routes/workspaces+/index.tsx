export { loader } from "./index.loader.server";
export { action } from "./index.action.server";

import { ActionFunctionArgs, LoaderFunctionArgs, redirect, Form, Link, NavLink, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import React, { useMemo } from "react";
import { QueryParamBanner } from "@/components/shared/QueryParamBanner";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

import { FaPlus } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";



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
  const actionData = useActionData();
  const { state } = useNavigation();
  const [searchParams] = useSearchParams();
  const isBusy = state !== "idle";
  const paymentStatus = searchParams.get("payment_status");
  const paymentMessage = searchParams.get("payment_message");

  useActionFeedback(actionData, {
    getError: (data) => data?.error,
    getSuccess: () => false,
  });
  useActionFeedback(error ? { error } : undefined, {
    getError: (data) => (data as { error?: string }).error,
    getSuccess: () => false,
  });
  useActionFeedback(
    paymentStatus === "error" && paymentMessage
      ? { error: paymentMessage }
      : undefined,
    {
      getError: (data) => (data as { error?: string }).error,
      getSuccess: () => false,
    },
  );

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
      <div className="w-full max-w-3xl">
        <QueryParamBanner
          param="invite"
          variants={{
            accepted: {
              title: "Invitation accepted",
              description: "You can open your workspace from the list below.",
            },
          }}
        />
      </div>
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
