export { loader } from "./settings.loader.server";
export { action } from "./settings.action.server";

import TeamMember, { MemberRole } from "@/components/workspace/TeamMember";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  NavLink,
  Outlet,
  useActionData,
  useLoaderData,
  useOutlet,
  useOutletContext,
} from "react-router";
import { useRef } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";



import { capitalize } from "@/lib/utils";
import { MdCached, MdCheckCircle, MdError } from "react-icons/md";
import { Section, SectionHeader } from "@/components/shared/Section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import WebhookEditor from "@/components/workspace/WebhookEditor";
import ApiKeysSection from "@/components/workspace/ApiKeysSection";
import { compareMembersByRole } from "@/lib/workspace-members";
import { User, WorkspaceData, WorkspaceInvite, WorkspaceWebhook  } from "@/lib/types";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

type UserWithRole = Partial<User> & { role: string };

type LoaderData = {
  workspace: WorkspaceData;
  userRole: MemberRole;
  users: UserWithRole[];
  activeUserId: string;
  phoneNumbers: WorkspaceNumbers[];
  pendingInvites: (WorkspaceInvite & {user: Partial<User>})[];
  webhook: WorkspaceWebhook;
  hasAccess: boolean;
}   

type WorkspaceNumbers = {
  id: string;
  phone_number: string;
  capabilities: {
    verification_status: 'success' | 'failed' | 'pending';
  };
};

export default function WorkspaceSettings() {
  const outlet = useOutlet();
  const {
    hasAccess,
    userRole,
    users,
    activeUserId,
    phoneNumbers,
    pendingInvites,
    webhook,
    workspace,
  } = useLoaderData<LoaderData>();
  const workspaceRecord = Array.isArray(workspace) ? workspace[0] : workspace;
  const outletContext = useOutletContext<{
    workspace: WorkspaceData;
  }>();
  const { workspace: outletWorkspace } = outletContext;
  const actionData = useActionData();
  const canManageWebhook =
    hasAccess &&
    outletWorkspace != null &&
    "id" in outletWorkspace &&
    typeof outletWorkspace.id === "string";
  const webhookWorkspaceId = canManageWebhook ? String(outletWorkspace.id) : "";
  const webhookUserId = String(activeUserId);
  const workspaceOwner = users?.find(
    (user) => user?.role === "owner"
  ) as UserWithRole | undefined;
  users?.sort((a, b) => compareMembersByRole(a, b));
  const formRef = useRef<HTMLFormElement | null>(null);
  useActionFeedback(actionData, {
    getError: (data) => data?.error,
    getSuccess: (data) =>
      Boolean(
        data &&
          (("data" in data && data.data) ||
            ("success" in data && data.success)),
      ),
    successMessage: "Action completed successfully!",
    onSuccess: () => formRef.current?.reset(),
  });

  const addUserTabs = (
    <Form method="POST" className="flex w-full flex-col gap-2" ref={formRef}>
      {actionData?.error && (
        <p className="text-center text-2xl font-bold text-brand-primary">
          {actionData.error}
        </p>
      )}
      <div className="flex gap-2">
        <input type="hidden" name="formName" value="addUser" />
        <FormField htmlFor="username" label="Email" className="w-full">
          <Input
            type="text"
            name="username"
            id="username"
            className="bg-transparent"
          />
        </FormField>
        <FormField
          htmlFor="new_user_workspace_role"
          label="Role"
          className="w-full"
        >
          <select
            className="rounded-md border-2 border-border px-2 py-2 bg-background text-foreground"
            name="new_user_workspace_role"
            id="new_user_workspace_role"
            defaultValue={MemberRole.Caller}
            required
          >
            {Object.values(MemberRole).map((role) => {
              if (role.valueOf() === "owner") {
                return <></>;
              }
              if (
                role.valueOf() === "admin" &&
                userRole === MemberRole.Member
              ) {
                return <></>;
              }

              return (
                <option
                  key={role.valueOf()}
                  value={role.valueOf()}
                  className=""
                >
                  {capitalize(role.valueOf())}
                </option>
              );
            })}
          </select>
        </FormField>
      </div>
      <Button type="submit" className="w-full sm:w-auto">
        Invite
      </Button>
    </Form>
  );

  const callerSelfDeleteForm = (
    <Form method="POST" className="w-full">
      <input type="hidden" name="formName" value="deleteSelf" />
      <input type="hidden" name="user_id" value={activeUserId} />
      <div className="flex w-full gap-2">
        <Button className="flex-1" variant="destructive">
          Quit This Workspace
        </Button>
        <Button asChild variant="outline" className="shrink-0">
          <Link to=".." relative="path">
            Back
          </Link>
        </Button>
      </div>
    </Form>
  );

  if (outlet) {
    return <Outlet context={outletContext} />;
  }

  return (
    <div className="space-y-8">
      <div>
        <Heading as="h1" level={2} branded={false}>
          Workspace Settings
        </Heading>
        <Text variant="muted" className="mt-1">
          Manage team, numbers, queues, and integrations
        </Text>
      </div>

      <Section variant="flat">
        <SectionHeader branded={false} compact title="Team members" />
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Owner
            </p>
            {workspaceOwner ? (
              <TeamMember
                member={workspaceOwner}
                userRole={userRole}
                memberIsUser={workspaceOwner?.id === activeUserId}
                workspaceOwner={workspaceOwner}
              />
            ) : null}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Members
            </p>
            <ul className="divide-y divide-border">
              {users?.map((member) => {
                if (!member?.role || member.role === "owner") return null;
                return (
                  <li key={member.id} className="py-2">
                    <TeamMember
                      member={member}
                      userRole={userRole}
                      memberIsUser={member.id === activeUserId}
                      workspaceOwner={workspaceOwner!}
                    />
                  </li>
                );
              })}
              {pendingInvites?.map((invite) => {
                if (!invite) return null;
                const inviteWithUser = invite as WorkspaceInvite & {
                  user?: Partial<User>;
                };
                return (
                  <li key={invite.id} className="py-2">
                    <TeamMember
                      member={{
                        ...(inviteWithUser.user || {}),
                        role: "invited",
                      } as UserWithRole}
                      userRole={userRole}
                      memberIsUser={false}
                      workspaceOwner={workspaceOwner!}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            {hasAccess ? (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Invite user
                </p>
                {addUserTabs}
              </>
            ) : (
              callerSelfDeleteForm
            )}
          </div>
        </div>
      </Section>

      <Section variant="flat">
        <SectionHeader
          branded={false}
          compact
          title="Phone numbers"
          actions={
            hasAccess ? (
              <Button asChild size="sm" variant="outline">
                <NavLink to="./numbers" relative="path">
                  Manage numbers
                </NavLink>
              </Button>
            ) : undefined
          }
        />
        {phoneNumbers?.length ? (
          <ul className="divide-y divide-border">
            {phoneNumbers.map((number) => {
              if (!number) return null;
              return (
                <li
                  key={number.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <p className="font-medium">{number.phone_number}</p>
                  <div>
                    {number.capabilities?.verification_status === "success" ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="text-xs uppercase">Verified</span>
                        <MdCheckCircle className="text-emerald-600" size={20} />
                      </div>
                    ) : number.capabilities?.verification_status === "failed" ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="text-xs uppercase">Failed</span>
                        <MdError className="text-destructive" size={20} />
                      </div>
                    ) : number.capabilities?.verification_status === "pending" ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="text-xs uppercase">Pending</span>
                        <MdCached size={20} />
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Text variant="muted">No phone numbers configured yet.</Text>
        )}
      </Section>

      {hasAccess ? (
        <Section variant="flat">
          <SectionHeader
            branded={false}
            compact
            title="Agent queues"
            description="Configure inbound call routing queues for your agents."
            actions={
              <Button asChild size="sm">
                <NavLink to="./queues" relative="path">
                  Manage queues
                </NavLink>
              </Button>
            }
          />
        </Section>
      ) : null}

      {hasAccess ? (
        <ApiKeysSection
          workspaceId={workspaceRecord?.id ?? ""}
          hasAccess={hasAccess}
          variant="flat"
        />
      ) : null}

      {hasAccess ? (
        <Accordion type="single" collapsible className="border-b border-border/60 pb-8">
          <AccordionItem value="webhook" className="border-border/60">
            <AccordionTrigger className="py-0 text-base font-semibold hover:no-underline">
              Webhook
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <Text variant="muted" className="mb-4">
                Send inbound call events to an external URL.
              </Text>
              {canManageWebhook ? (
                <WebhookEditor
                  initialWebhook={
                    webhook
                      ? {
                          id: String(webhook.id || ""),
                          destination_url: webhook.destination_url || "",
                          events: Array.isArray(webhook.event)
                            ? webhook.event.map((e: string) => ({
                                category: "inbound_call" as const,
                                type: e as "INSERT" | "UPDATE",
                              }))
                            : [],
                          custom_headers:
                            typeof webhook.custom_headers === "object" &&
                            webhook.custom_headers !== null
                              ? (webhook.custom_headers as Record<string, string>)
                              : undefined,
                        }
                      : undefined
                  }
                  userId={webhookUserId}
                  workspaceId={webhookWorkspaceId}
                />
              ) : (
                <Text variant="muted">
                  You don&apos;t have permission to manage webhooks.
                </Text>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}
