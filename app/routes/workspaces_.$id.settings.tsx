import TeamMember, { MemberRole } from "~/components/Workspace/TeamMember";

import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  json,
  Link,
  NavLink,
  useActionData,
  useLoaderData,
  useOutletContext,
} from "@remix-run/react";
import { useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
import {
  getUserRole,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
} from "~/lib/database.server";
import { verifyAuth } from "~/lib/supabase.server";
import {
  handleAddUser,
  handleDeleteSelf,
  handleDeleteUser,
  handleDeleteWorkspace,
  handleTransferWorkspace,
  handleUpdateUser,
  handleUpdateWebhook,
  removeInvite,
  testWebhook,
} from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";

import { toast, Toaster } from "sonner";
import { capitalize } from "~/lib/utils";
import { MdCached, MdCheckCircle, MdError } from "react-icons/md";
import { Card } from "~/components/CustomCard";
import WebhookEditor from "~/components/Workspace/WebhookEditor";
import Workspace from "./workspaces_.$id";
import { User, WorkspaceData, WorkspaceInvite, WorkspaceWebhook  } from "~/lib/types";

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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (!workspaceId) throw new Error("No workspace id found!");
  const userId = user?.id;
  const {data: workspace, error: workspaceError} = await supabaseClient
    .from("workspace")
    .select("name, id, workspace_users(role, user(username, id)), workspace_number(*), audience(*), workspace_invite(*, user(username, id, first_name, last_name)), webhook(*)")
    .eq("id", workspaceId)
    .single();
    
  if (workspaceError) throw workspaceError;
  const userRole = workspace.workspace_users.find((user) => user.user?.id === userId)?.role;
  const users = [] as UserWithRole[];
  const hasAccess = userRole !== MemberRole.Caller; 
  const {workspace_users, workspace_number, audience, workspace_invite, webhook, ...rest} = workspace;
  workspace_users.forEach((user) => {
    users.push({role: user.role, id: user.user?.id, username: user.user?.username} as UserWithRole);
  });
  return json(
      {
        workspace: rest,
        userRole,
        users,
        activeUserId: userId,
        phoneNumbers: workspace_number,
        pendingInvites: workspace_invite,
        webhook: webhook[0] as WorkspaceWebhook,
        hasAccess,
      },
      { headers },
    );
  }

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const workspaceId = params.id;
  const { supabaseClient, headers, user } = await verifyAuth(request);

  if (workspaceId == null) {
    return json({ error: "No workspace_id found!" }, { headers });
  }

  const formData = await request.formData();
  const formName = formData.get("formName");

  switch (formName) {
    case "addUser": {
      return handleAddUser(formData, workspaceId, supabaseClient, headers);
    }
    case "updateUser": {
      return handleUpdateUser(formData, workspaceId, supabaseClient, headers);
    }
    case "deleteUser": {
      return handleDeleteUser(formData, workspaceId, supabaseClient, headers);
    }
    case "deleteSelf": {
      return handleDeleteSelf(formData, workspaceId, supabaseClient, headers);
    }
    case "transferWorkspaceOwnership": {
      return handleTransferWorkspace(
        formData,
        workspaceId,
        supabaseClient,
        headers,
      );
    }
    case "deleteWorkspace": {
      return handleDeleteWorkspace({ workspaceId, supabaseClient, headers });
    }
    case "cancelInvite": {
      return removeInvite({ workspaceId, supabaseClient, formData, headers });
    }
    case "updateWebhook": {
      return handleUpdateWebhook(
        formData,
        workspaceId,
        supabaseClient,
        headers,
      );
    }
    default: {
      break;
    }
  }

  return json(
    { data: null, error: "Error: Unrecognized action called" },
    { headers },
  );
};

function compareMembersByRole(a: UserWithRole, b: UserWithRole  ) {
  const memberRoleArray = Object.values(MemberRole);

  if (
    memberRoleArray.indexOf(a.role) <
    memberRoleArray.indexOf(b.role)
  )
    return -1;
  if (
    memberRoleArray.indexOf(a.role) >
    memberRoleArray.indexOf(b.role)
  )
    return 1;
  return 0;
}

export default function WorkspaceSettings() {
  const {
    hasAccess,
    userRole,
    users,
    activeUserId,
    phoneNumbers,
    pendingInvites,
    webhook,
  } = useLoaderData<LoaderData>();
  const {workspace} = useOutletContext<{workspace: WorkspaceData}>();
    const actionData = useActionData<typeof action>();
  const workspaceOwner = users?.find(
    (user) => user?.role === "owner"
  ) as UserWithRole | undefined;
  users?.sort((a, b) => compareMembersByRole(a, b));
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (actionData && actionData?.error) {
      toast.error(JSON.stringify(actionData.error));
    }
    if (actionData && (actionData?.data || actionData?.success)) {
      toast.success("Action completed succesfully!");
      formRef?.current?.reset();
    }
  }, [actionData]);

  const addUserTabs = (
    <Form method="POST" className="flex w-full flex-col gap-2" ref={formRef}>
      {actionData?.error && (
        <p className="text-center text-2xl font-bold text-brand-primary">
          {actionData.error}
        </p>
      )}
      <div className="flex gap-2">
        <input type="hidden" name="formName" value="addUser" />
        <label
          htmlFor="username"
          className="flex w-full flex-col text-xl font-semibold dark:text-white"
        >
          Email
          <input
            type="text"
            name="username"
            id="username"
            className="rounded-md border border-black bg-transparent px-4 py-2 dark:border-white"
          />
        </label>
        <label
          htmlFor="new_user_workspace_role"
          className="flex w-full flex-col text-xl font-semibold dark:text-white"
        >
          Role
          <select
            className="rounded-md border-2 border-black px-2 py-2 dark:border-white dark:font-normal"
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
        </label>
      </div>
      <Button
        type="submit"
        className="h-full w-full font-Zilla-Slab text-xl font-semibold"
      >
        Invite
      </Button>
    </Form>
  );

  const callerSelfDeleteForm = (
    <Form method="POST" className="w-full">
      <input type="hidden" name="formName" value="deleteSelf" />
      <input type="hidden" name="user_id" value={activeUserId} />
      <div className="flex w-full gap-2">
        <Button
          className="h-full w-full font-Zilla-Slab text-2xl font-semibold"
          variant="destructive"
        >
          Quit This Workspace
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-full w-1/3 border-0 border-black bg-zinc-600 font-Zilla-Slab text-2xl font-semibold text-white dark:border-white"
        >
          <Link to=".." relative="path">
            Back
          </Link>
        </Button>
      </div>
    </Form>
  );

  return (
    <main className="mt-8 flex h-fit flex-col">
      <div className="flex justify-center">
        <h1 className="mb-4 font-Zilla-Slab text-4xl font-bold text-brand-primary dark:text-white">
          Workspace Settings
        </h1>
      </div>
      <div className="flex flex-wrap items-stretch gap-4">
        <Card bgColor="bg-brand-secondary dark:bg-zinc-900 flex-[40%] flex-col flex justify-between">
          <div className="flex-1">
            <h3 className="text-center font-Zilla-Slab text-2xl font-bold">
              Manage Team Members
            </h3>
            <div className="flex flex-col py-4">
              <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
                Owner
              </p>
              {workspaceOwner && <TeamMember
                member={workspaceOwner}
                userRole={userRole}
                memberIsUser={workspaceOwner?.id === activeUserId}
                workspaceOwner={workspaceOwner!}
              />}
            </div>
            <div className="flex flex-col py-4">
              <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
                Members
              </p>
              <ul className=" flex w-full flex-col items-center gap-2">
                {users?.map((member) => {
                  if (!member || !member.role) {
                    return <></>;
                  }
                  if (member.role === "owner") {
                    return <></>;
                  }
                  return (
                    <li key={member.id} className="w-full">
                      <TeamMember
                        member={member}
                        userRole={userRole}
                        memberIsUser={member.id === activeUserId}
                        workspaceOwner={workspaceOwner!}
                      />
                    </li>
                  );
                })}
                {pendingInvites?.map((invite: WorkspaceInvite) => {
                  if (!invite) {
                    return <></>;
                  }
                  return (
                    <li key={invite.id} className="w-full">
                      <TeamMember
                        member={{
                          ...invite.user,
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
          </div>
          <div className="flex flex-col pt-4">
            <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
              {hasAccess && "Invite User"}
            </p>
            {hasAccess ? addUserTabs : callerSelfDeleteForm}
          </div>
        </Card>
        <Card bgColor="bg-brand-secondary dark:bg-zinc-900 flex-[40%] flex-col flex">
          <div className="flex-1">
            <h3 className="text-center font-Zilla-Slab text-2xl font-bold">
              Manage Phone Numbers
            </h3>
            <div className="flex flex-col py-4">
              <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
                Phone Numbers
              </p>
              <ul className="flex w-full flex-col items-center gap-2">
                {phoneNumbers?.map((number) => {
                  if (!number) {
                    return <></>;
                  } 
                  return (
                    <li key={number.id} className="w-full">
                      <div className="flex w-full items-center justify-between bg-transparent p-2 text-xl shadow-sm dark:border-white">
                        <p className="font-semibold">{number.phone_number}</p>
                        <div>
                          {number.capabilities?.verification_status ===
                          "success" ? (
                            <div className="flex items-center gap-2">
                              <p className="text-xs uppercase">
                                {number.capabilities?.verification_status}
                              </p>
                              <MdCheckCircle fill="#008800" size={24} />
                            </div>
                          ) : number.capabilities?.verification_status ===
                            "failed" ? (
                            <div className="flex items-center gap-2">
                              <p className="text-xs uppercase">
                                {number.capabilities?.verification_status}
                              </p>
                              <MdError fill="#880000" size={24} />
                            </div>
                          ) : number.capabilities?.verification_status ===
                            "pending" ? (
                            <div className="i gap-2tems-center flex">
                              <p className="text-xs uppercase">
                                {number.capabilities?.verification_status}
                              </p>
                              <MdCached size={24} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          {hasAccess && (
            <div className="">
              <Button
                asChild
                className="h-full w-full font-Zilla-Slab text-xl font-semibold"
              >
                <NavLink to={"./numbers"} relative="path">
                  Manage Numbers
                </NavLink>
              </Button>
            </div>
          )}
        </Card>
        {hasAccess && <Card bgColor="bg-brand-secondary dark:bg-zinc-900 flex-[40%] flex-col flex">
          <div className="flex-1">
            <h3 className="text-center font-Zilla-Slab text-2xl font-bold">
              Manage Webhook
            </h3>
            <div className="flex flex-col py-4">
              {hasAccess && workspace?.id ? (
                <WebhookEditor initialWebhook={webhook || null} userId={activeUserId} workspaceId={workspace.id} />
              ) : (
                <p className="text-center text-gray-600">
                  You don't have permission to manage webhooks.
                </p>
              )}
            </div>
          </div>
        </Card>}
      </div>
      <Toaster richColors />
    </main>
  );
}
