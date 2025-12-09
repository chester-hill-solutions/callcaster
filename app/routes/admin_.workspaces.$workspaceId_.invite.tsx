import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, json, useActionData, useLoaderData } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/shared/CustomCard";
import TeamMember, { MemberRole } from "~/components/Workspace/TeamMember";
import { verifyAuth } from "~/lib/supabase.server";
import { capitalize } from "~/lib/utils";
import type { Database, Tables } from "~/lib/database.types";
import {
  handleAddUser,
  handleDeleteSelf,
  handleDeleteUser,
  handleUpdateUser,
  removeInvite,
} from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";

type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

type MemberUser = Pick<
  Tables<"user">,
  "id" | "username" | "first_name" | "last_name"
> & {
  role: MemberRole;
};

type PendingInvite = Tables<"workspace_invite"> & {
  user: Pick<
    Tables<"user">,
    "id" | "username" | "first_name" | "last_name"
  > | null;
};

type WorkspaceMemberRecord = {
  role: WorkspaceRole;
  user: Pick<
    Tables<"user">,
    "id" | "username" | "first_name" | "last_name"
  > | null;
};

type WorkspaceMemberWithUser = WorkspaceMemberRecord & {
  user: Pick<
    Tables<"user">,
    "id" | "username" | "first_name" | "last_name"
  >;
};

type WorkspaceWithMembers = Pick<Tables<"workspace">, "id" | "name"> & {
  workspace_users: Array<WorkspaceMemberRecord | null> | null;
  workspace_invite: Array<PendingInvite | null> | null;
};

type LoaderData = {
  workspace: Pick<Tables<"workspace">, "id" | "name">;
  userRole: MemberRole | null;
  users: MemberUser[];
  activeUserId: string;
  pendingInvites: PendingInvite[];
  hasAccess: boolean;
};

type DisplayUser = Pick<
  Tables<"user">,
  "id" | "username" | "first_name" | "last_name"
> & {
  role: MemberRole | "invited";
};

const memberRoles = new Set(Object.values(MemberRole));

const isMemberRole = (role: string | null | undefined): role is MemberRole =>
  !!role && memberRoles.has(role as MemberRole);

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.workspaceId;
  if (!workspaceId) throw new Error("No workspace id found!");
  const userId = user.id;
  
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

  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select(
      `
        id,
        name,
        workspace_users (
          role,
          user: user_id (
            id,
            username,
            first_name,
            last_name
          )
        ),
        workspace_invite (
          id,
          created_at,
          isNew,
          role,
          user_id,
          workspace,
          user: user_id (
            id,
            username,
            first_name,
            last_name
          )
        )
      `,
    )
    .eq("id", workspaceId)
    .single<WorkspaceWithMembers>();
    
  if (workspaceError) throw workspaceError;
  
  const workspaceUsers =
    workspace.workspace_users?.filter(
      (member: WorkspaceMemberRecord | null): member is WorkspaceMemberWithUser =>
        member !== null && member.user !== null,
    ) ?? [];

  const users: MemberUser[] = workspaceUsers.map(({ role, user }: WorkspaceMemberWithUser) => ({
    id: user.id,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    role: role as MemberRole,
  }));
  
  const userRole =
    workspaceUsers.find((member: WorkspaceMemberWithUser) => member.user.id === userId)?.role ?? null;
  const normalizedUserRole = isMemberRole(userRole) ? userRole : null;
  const hasAccess =
    normalizedUserRole === MemberRole.Admin ||
    normalizedUserRole === MemberRole.Owner;

  const pendingInvites =
    workspace.workspace_invite?.filter(
      (invite: PendingInvite | null): invite is PendingInvite => invite !== null,
    ) ?? [];
  
  return json(
    {
      workspace: { id: workspace.id, name: workspace.name },
      userRole: normalizedUserRole,
      users,
      activeUserId: userId,
      pendingInvites,
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

function compareMembersByRole(a: MemberUser, b: MemberUser) {
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
  const workspaceOwner = users.find(
    (member) => member.role === MemberRole.Owner,
  );
  const sortedUsers = [...users].sort(compareMembersByRole);
  const membersExcludingOwner = sortedUsers.filter(
    (member) => member.role !== MemberRole.Owner,
  );
  const currentUserRole = userRole ?? MemberRole.Member;
  const fallbackWorkspaceOwner: DisplayUser = workspaceOwner ?? {
    id: activeUserId,
    username: "Unknown Owner",
    first_name: null,
    last_name: null,
    role: MemberRole.Owner,
  };
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
          {workspace?.name ? ` - ${workspace.name}` : ""}
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
                        if (role === MemberRole.Owner) {
                          return null;
                        }
                        if (
                          role === MemberRole.Admin &&
                          userRole === MemberRole.Member
                        ) {
                          return null;
                        }

                        return (
                          <option
                            key={role}
                            value={role}
                            className=""
                          >
                            {capitalize(role)}
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
              {workspaceOwner && (
                <TeamMember
                  member={{ ...workspaceOwner }}
                  userRole={currentUserRole}
                  memberIsUser={workspaceOwner.id === activeUserId}
                  workspaceOwner={{ ...workspaceOwner }}
                />
              )}
            </div>
            <div className="flex flex-col py-4">
              <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
                Members
              </p>
              <ul className="flex w-full flex-col items-center gap-2">
                {membersExcludingOwner.map((member) => (
                    <li key={member.id} className="w-full">
                      <TeamMember
                      member={{ ...member }}
                      userRole={currentUserRole}
                        memberIsUser={member.id === activeUserId}
                      workspaceOwner={fallbackWorkspaceOwner}
                      />
                    </li>
                ))}
              </ul>
            </div>
            
            {pendingInvites && pendingInvites.length > 0 && (
              <div className="flex flex-col py-4">
                <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
                  Pending Invitations
                </p>
                <ul className="flex w-full flex-col items-center gap-2">
                  {pendingInvites.map((invite) => {
                    const inviteMember: DisplayUser = {
                      id: invite.user_id,
                      username: invite.user?.username ?? invite.user_id,
                      first_name: invite.user?.first_name ?? null,
                      last_name: invite.user?.last_name ?? null,
                      role: "invited",
                    };
                    return (
                      <li key={invite.id} className="w-full">
                        <TeamMember
                          member={inviteMember}
                          userRole={currentUserRole}
                          memberIsUser={false}
                          workspaceOwner={fallbackWorkspaceOwner}
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