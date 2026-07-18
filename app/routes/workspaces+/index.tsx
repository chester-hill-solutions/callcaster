export { loader } from "./index.loader.server";
export { action } from "./index.action.server";

import {
  Form,
  NavLink,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import type { MetaFunction } from "react-router";
import React, { useEffect, useMemo, useState } from "react";

export const meta: MetaFunction = () => [{ title: "Workspaces — CallCaster" }];
import { QueryParamBanner } from "@/components/shared/QueryParamBanner";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

import { FaPlus } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { handleRoleTextStyles } from "@/components/workspace/TeamMember";
import { Section, SectionHeader } from "@/components/shared/Section";
import { MemberRole } from "@/lib/member-role";
import { getWorkspaceRoleDisplayName } from "@/lib/workspace-role-display";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import type {
  WorkspaceListItem,
  WorkspacesIndexLoaderData,
} from "./index.loader.server";

type WorkspaceActionData = {
  error?: string;
};

const WorkspaceCard = React.memo(
  ({
    workspace,
    role,
  }: {
    workspace: WorkspaceListItem["workspace"];
    role: MemberRole;
  }) => {
    return (
      <NavLink
        prefetch="intent"
        to={`/workspaces/${workspace.id}`}
        className="flex h-full flex-col items-center justify-center rounded-lg border border-border bg-card p-4 text-center text-card-foreground shadow-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground dark:hover:bg-zinc-800"
      >
        <h5 className="mb-2 max-h-[100px] overflow-hidden overflow-ellipsis font-Zilla-Slab text-2xl font-semibold text-brand-primary dark:text-white">
          {workspace.name}
        </h5>
        <p className={`text-xl ${handleRoleTextStyles(role)}`}>
          {getWorkspaceRoleDisplayName(role)}
        </p>
      </NavLink>
    );
  },
);
WorkspaceCard.displayName = "WorkspaceCard";

const NewWorkspaceDialog = ({
  isBusy,
  error,
  open,
  onOpenChange,
  trigger,
}: {
  isBusy: boolean;
  error?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>
      {trigger ?? (
        <Button
          variant="outline"
          className="h-full w-full border border-border px-4 py-8"
          aria-label="Add new workspace"
          disabled={isBusy}
        >
          <FaPlus size="72px" className="text-black dark:text-white" />
        </Button>
      )}
    </DialogTrigger>
    <DialogContent className="bg-card">
      <DialogHeader>
        <DialogTitle asChild>
          <h3 className="text-center font-Zilla-Slab text-4xl font-black text-brand-primary dark:text-white">
            Add a New Workspace
          </h3>
        </DialogTitle>
        <DialogDescription className="text-center">
          Name your workspace to create a hub for campaigns, contacts, and
          billing.
        </DialogDescription>
      </DialogHeader>
      <Form
        className="flex w-full flex-col gap-4"
        method="POST"
        name="newWorkspace"
      >
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Could not create workspace</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <FormField
          htmlFor="newWorkspaceName"
          label="Enter your Workspace Name"
          required
        >
          <Input
            type="text"
            name="newWorkspaceName"
            id="newWorkspaceName"
            className="text-xl"
            maxLength={200}
            required
            aria-invalid={Boolean(error) || undefined}
          />
        </FormField>
        <div className="flex gap-4">
          <Button
            variant="default"
            className="w-full text-xl"
            type="submit"
            disabled={isBusy}
          >
            {isBusy ? "Creating…" : "Create New Workspace"}
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

const ZeroWorkspaceIntro = ({
  isBusy,
  error,
  open,
  onOpenChange,
}: {
  isBusy: boolean;
  error?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Card className="w-full max-w-3xl border-2 border-brand-primary/40 dark:border-white/40">
    <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
      <Heading level={3} branded>
        Create your first workspace
      </Heading>
      <Text variant="muted" className="max-w-xl">
        A workspace is your team&apos;s hub — it holds your contacts, campaigns,
        phone numbers, and billing. Create one to start calling and texting.
      </Text>
      <NewWorkspaceDialog
        isBusy={isBusy}
        error={error}
        open={open}
        onOpenChange={onOpenChange}
        trigger={
          <Button
            variant="default"
            className="px-8 py-6 text-xl"
            disabled={isBusy}
          >
            <FaPlus className="mr-2" />
            Create your first workspace
          </Button>
        }
      />
      <Text variant="small">
        Need help?{" "}
        <a
          href="mailto:info@callcaster.ca"
          className="font-medium text-brand-primary underline-offset-4 hover:underline"
        >
          Contact support
        </a>
      </Text>
    </CardContent>
  </Card>
);

export default function Workspaces() {
  const { workspaces, error } = useLoaderData<WorkspacesIndexLoaderData>();
  const actionData = useActionData<WorkspaceActionData>();
  const { state } = useNavigation();
  const [searchParams] = useSearchParams();
  const isBusy = state !== "idle";
  const paymentStatus = searchParams.get("payment_status");
  const paymentMessage = searchParams.get("payment_message");
  const actionError = actionData?.error ?? null;
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * @effect Reopen the create-workspace dialog when the action comes back with an
   *   error, so the failure is shown against the form the user filled in.
   * @effect-deps actionError (the action's error, per submission)
   * @effect-side-effects none (local setState)
   * @effect-why-not-loader The error is already action data — this only drives
   *   local dialog visibility. It is not derived state (`open={dialogOpen ||
   *   !!actionError}`) because that would pin the dialog open for as long as the
   *   error stays in actionData, leaving the user unable to dismiss it.
   */
  useEffect(() => {
    if (actionError) {
      setDialogOpen(true);
    }
  }, [actionError]);

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

  const hasWorkspaces = Boolean(workspaces && workspaces.length > 0);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-7xl flex-col items-center gap-6 px-4 py-8">
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
      <Heading level={1} className="text-center" branded>
        Your Workspaces
      </Heading>
      {hasWorkspaces ? (
        <Section className="w-full">
          <SectionHeader
            branded
            title="Workspace Directory"
            description="Choose an existing workspace or create a new one."
          />
          <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
            <div className="w-full sm:w-48">
              <NewWorkspaceDialog
                isBusy={isBusy}
                error={actionError}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
              />
            </div>
            {workspaceCards}
          </div>
        </Section>
      ) : (
        <ZeroWorkspaceIntro
          isBusy={isBusy}
          error={actionError}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </main>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
