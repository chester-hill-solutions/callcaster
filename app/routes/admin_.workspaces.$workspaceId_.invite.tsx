import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, json, useActionData, useLoaderData } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/CustomCard";
import TeamMember, { MemberRole } from "~/components/Workspace/TeamMember";
import { verifyAuth } from "~/lib/supabase.server";
import { capitalize } from "~/lib/utils";
import {
  handleAddUser,
  handleDeleteSelf,
  handleDeleteUser,
  handleUpdateUser,
  removeInvite,
} from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";
import { User, WorkspaceData, WorkspaceInvite } from "~/lib/types";

type UserWithRole = Partial<User> & { role: string };

type LoaderData = {
  workspace: WorkspaceData;
  userRole: MemberRole;
  users: UserWithRole[];
  activeUserId: string;
  pendingInvites: (WorkspaceInvite & {user: Partial<User>})[];
  hasAccess: boolean;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.workspaceId;
  if (!workspaceId) throw new Error("No workspace id found!");
  const userId = user?.id;
  
  // Check if user is admin
  const { data: userRoleData } = await supabaseClient
    .from("workspace_users")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (!userRoleData || userRoleData.role !== "admin") {
    return json({ error: "Unauthorized" }, { status: 403, headers });
  }

  const {data: workspace, error: workspaceError} = await supabaseClient
    .from("workspace")
    .select("name, id, workspace_users(role, user(username, id, first_name, last_name)), workspace_invite(*, user(username, id, first_name, last_name))")
    .eq("id", workspaceId)
    .single();
    
  if (workspaceError) throw workspaceError;
  
  const userRole = workspace.workspace_users.find((user) => user.user?.id === userId)?.role;
  const users = [] as UserWithRole[];
  const hasAccess = userRole === MemberRole.Admin || userRole === MemberRole.Owner;
  
  const {workspace_users, workspace_invite, ...rest} = workspace;
  workspace_users.forEach((user) => {
    users.push({
      role: user.role, 
      id: user.user?.id, 
      username: user.user?.username,
      first_name: user.user?.first_name,
      last_name: user.user?.last_name
    } as UserWithRole);
  });
  
  return json(
    {
      workspace: rest,
      userRole,
      users,
      activeUserId: userId,
      pendingInvites: workspace_invite,
      hasAccess,
    },
    { headers },
  );
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const workspaceId = params.workspaceId;
  const { supabaseClient, headers, user } = await verifyAuth(request);

  if (workspaceId == null) {
    return json({ error: "No workspace_id found!" }, { headers });
  }

  // Check if user is admin
  const { data: userRoleData } = await supabaseClient
    .from("workspace_users")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user?.id)
    .single();

  if (!userRoleData || userRoleData.role !== "admin") {
    return json({ error: "Unauthorized" }, { status: 403, headers });
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
    case "cancelInvite": {
      return removeInvite({ workspaceId, supabaseClient, formData, headers });
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

function compareMembersByRole(a: UserWithRole, b: UserWithRole) {
  const memberRoleArray = Object.values(MemberRole);

  if (
    memberRoleArray.indexOf(a.role as MemberRole) <
    memberRoleArray.indexOf(b.role as MemberRole)
  )
    return -1;
  if (
    memberRoleArray.indexOf(a.role as MemberRole) >
    memberRoleArray.indexOf(b.role as MemberRole)
  )
    return 1;
  return 0;
}

export default function WorkspaceUsers() {
  const {
    workspace,
    hasAccess,
    userRole,
    users,
    activeUserId,
    pendingInvites,
  } = useLoaderData<LoaderData>();
  
  const actionData = useActionData<typeof action>();
  const workspaceOwner = users?.find(
    (user) => user?.role === "owner"
  ) as UserWithRole | undefined;
  
  users?.sort((a, b) => compareMembersByRole(a, b));
  const formRef = useRef<HTMLFormElement | null>(null);
  
  useEffect(() => {
    if (actionData && 'error' in actionData && actionData.error) {
      toast.error(actionData.error as string);
    }
    if (actionData) {
      if ('success' in actionData && actionData.success) {
        toast.success("Action completed successfully!");
        formRef?.current?.reset();
      } else if ('data' in actionData && actionData.data) {
        toast.success("Action completed successfully!");
        formRef?.current?.reset();
      }
    }
  }, [actionData]);

  if (!hasAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <h1 className="text-2xl font-bold">You do not have access to this page</h1>
      </div>
    );
  }

  return (
    <main className="mt-8 flex h-fit flex-col">
      <Toaster position="top-right" />
      <div className="flex justify-center">
        <h1 className="mb-4 font-Zilla-Slab text-4xl font-bold text-brand-primary dark:text-white">
          Manage Workspace Users
          {workspace && typeof workspace === 'object' && 'name' in workspace ? ` - ${workspace.name}` : ""}
        </h1>
      </div>
      
      <div className="flex flex-wrap items-stretch gap-4">
        <Card bgColor="bg-brand-secondary dark:bg-zinc-900 flex-[40%] flex-col flex justify-between">
          <div className="flex-1">
            <h3 className="text-center font-Zilla-Slab text-2xl font-bold">
              Invite New User
            </h3>
            <div className="p-4">
              <Form method="POST" className="flex w-full flex-col gap-2" ref={formRef}>
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
                          return null;
                        }
                        if (
                          role.valueOf() === "admin" &&
                          userRole === MemberRole.Member
                        ) {
                          return null;
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
            </div>
          </div>
        </Card>
        
        <Card bgColor="bg-brand-secondary dark:bg-zinc-900 flex-[55%] flex-col flex justify-between">
          <div className="flex-1">
            <h3 className="text-center font-Zilla-Slab text-2xl font-bold">
              Current Members
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
              <ul className="flex w-full flex-col items-center gap-2">
                {users?.map((member) => {
                  if (!member || !member.role) {
                    return null;
                  }
                  if (member.role === "owner") {
                    return null;
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
              </ul>
            </div>
            
            {pendingInvites && pendingInvites.length > 0 && (
              <div className="flex flex-col py-4">
                <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
                  Pending Invitations
                </p>
                <ul className="flex w-full flex-col items-center gap-2">
                  {pendingInvites?.map((invite: WorkspaceInvite & {user: Partial<User>}) => {
                    if (!invite) {
                      return null;
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
            )}
          </div>
        </Card>
      </div>
    </main>
  );
} 