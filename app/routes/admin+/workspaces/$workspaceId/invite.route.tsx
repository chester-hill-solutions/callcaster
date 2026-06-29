export { loader } from "./invite.loader.server";
export { action } from "./invite.action.server";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, Form, useActionData, useLoaderData } from "react-router";
import { useRef } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { Button } from "@/components/ui/button";
import { BrandedCard as Card } from "@/components/shared/BrandedCard";
import TeamMember, { MemberRole } from "@/components/workspace/TeamMember";

import { compareMembersByRole } from "@/lib/workspace-members";
import { capitalize } from "@/lib/utils";
import type { Database, Tables } from "@/lib/database.types";

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

export default function WorkspaceUsers() {
  const {
    workspace,
    hasAccess,
    userRole,
    users,
    activeUserId,
    pendingInvites,
  } = useLoaderData<LoaderData>();
  
  const actionData = useActionData();
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
  
  useActionFeedback(actionData, {
    getError: (data) =>
      data && "error" in data && data.error ? data.error : undefined,
    getSuccess: (data) =>
      Boolean(
        data &&
          (("success" in data && data.success) ||
            ("data" in data && data.data)),
      ),
    successMessage: "Action completed successfully!",
    onSuccess: () => formRef.current?.reset(),
  });

  if (!hasAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <h1 className="text-2xl font-bold">You do not have access to this page</h1>
      </div>
    );
  }

  return (
    <main className="mt-8 flex h-fit flex-col">
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
