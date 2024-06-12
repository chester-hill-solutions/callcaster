import TeamMember, { MemberRole } from "~/components/Workspace/TeamMember";

import { ActionFunctionArgs } from "@remix-run/node";
import {
  Form,
  json,
  Link,
  useActionData,
  useLoaderData,
} from "@remix-run/react";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { getWorkspaceUsers } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import {
  handleAddUser,
  handleDeleteUser,
  handleInviteCaller,
  handleTransferWorkspace,
  handleUpdateUser,
} from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";

import { toast, Toaster } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { capitalize } from "~/lib/utils";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const { data: users, error } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });

  if (serverSession) {
    const jwt = jwtDecode(serverSession.access_token);
    const userRole = jwt["user_workspace_roles"]?.find(
      (workspaceRoleObj) => workspaceRoleObj.workspace_id === workspaceId,
    )?.role;
    // const userRole = null;
    // console.log("\nJWT: ", jwt);
    console.log("USER ROLE: ", userRole);

    // const { data: authorizeData, error: authorizeError } = await testAuthorize({
    //   supabaseClient,
    //   workspaceId,
    // });

    const hasAccess = userRole === "owner" || userRole === "admin";

    return json({ hasAccess: hasAccess, userRole, users: users }, { headers });
  }

  return json({ hasAccess: false, userRole: null, users: null }, { headers });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const workspaceId = params.id;
  const { supabaseClient, headers, session } =
    await getSupabaseServerClientWithSession(request);

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
    case "inviteCaller": {
      return handleInviteCaller(formData, workspaceId, supabaseClient, headers);
    }
    case "transferWorkspaceOwnership": {
      return handleTransferWorkspace(
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

export default function WorkspaceSettings() {
  const { hasAccess, userRole, users } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { theme } = useTheme();
  // console.log("Theme", theme);
  // console.log("Users: ", users);

  const workspaceOwner = users?.find(
    (user) => user.user_workspace_role === "owner",
  );
  // console.log(workspaceOwner);

  const [showForm, setShowForm] = useState<boolean>(false);
  const userIsOwner = userRole === "owner";

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (actionData?.data) {
      toast.success("Action completed succesfully!");
    }
  }, [actionData]);

  const settings = (
    <main className="mx-auto mt-8 flex h-full w-fit flex-col gap-4 rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white">
      <h3 className="text-center font-Zilla-Slab text-4xl font-bold">
        Manage Team Members
      </h3>
      <div className="flex flex-col">
        <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
          Owner
        </p>
        <TeamMember
          member={workspaceOwner}
          userIsOwner={userIsOwner}
          workspaceOwner={workspaceOwner}
        />
      </div>
      <div className="flex flex-col">
        <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
          Members
        </p>
        <ul className=" flex w-full flex-col items-center gap-2">
          {users?.map((member) => {
            if (member.user_workspace_role === "owner") {
              return <></>;
            }
            return (
              <li key={member.id} className="w-full">
                <TeamMember
                  member={member}
                  userIsOwner={userIsOwner}
                  workspaceOwner={workspaceOwner}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col">
        {/* <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
          Add New Member
        </p> */}
        <Tabs defaultValue="addUser" className="w-full">
          <TabsList className="flex w-full gap-2 bg-brand-secondary font-bold dark:bg-inherit">
            <TabsTrigger
              className="w-full bg-zinc-300 text-xl font-bold uppercase data-[state=active]:bg-white dark:data-[state=active]:border-white dark:data-[state=active]:bg-inherit"
              value="addUser"
            >
              Add Existing User To Workspace
            </TabsTrigger>
            {/* <TabsTrigger
              className="w-full bg-zinc-300 font-bold data-[state=active]:bg-white dark:data-[state=active]:border-2 dark:data-[state=active]:border-white dark:data-[state=active]:bg-inherit"
              value="inviteCaller"
            >
              Invite Caller
            </TabsTrigger> */}
          </TabsList>
          <TabsContent value="addUser">
            <Form method="POST" className="flex w-full flex-col gap-4">
              {actionData?.error && (
                <p className="text-center text-2xl font-bold text-brand-primary">
                  {actionData.error}
                </p>
              )}
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
                htmlFor="newUserWorkspaceRole"
                className="flex w-full flex-col gap-2 text-xl font-semibold dark:text-white"
              >
                Workspace Role
                <select
                  className="rounded-md border-2 border-black px-2 py-1 dark:border-white dark:font-normal"
                  name="newUserWorkspaceRole"
                  id="newUserWorkspaceRole"
                  defaultValue={MemberRole.Caller}
                  required
                >
                  {Object.values(MemberRole).map((role) => {
                    // console.log(role.valueOf());
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
              <div className="flex w-full gap-2">
                <Button className="h-full w-2/3 font-Zilla-Slab text-2xl font-semibold">
                  Add New User
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
          </TabsContent>
          {/* <TabsContent value="inviteCaller" className="">
            <Form method="POST" className="flex w-full flex-col gap-4">
              {actionData?.error && (
                <p className="text-center text-2xl font-bold text-brand-primary">
                  {actionData.error}
                </p>
              )}
              <input type="hidden" name="formName" value="inviteCaller" />
              <label
                htmlFor="callerEmail"
                className="flex w-full flex-col font-Zilla-Slab text-lg font-semibold dark:text-white"
              >
                Email
                <input
                  type="email"
                  name="callerEmail"
                  id="callerEmail"
                  className="rounded-md border border-black bg-transparent px-4 py-2 dark:border-white"
                />
              </label>
              <Button className="">Invite Caller</Button>
            </Form>
          </TabsContent> */}
        </Tabs>
      </div>
      <Toaster richColors />
    </main>
  );

  return (
    <>
      {hasAccess ? (
        settings
      ) : (
        <main className="mx-auto mt-32 flex h-full w-fit flex-col items-center justify-center gap-4 rounded-sm px-8 pb-10 pt-6 text-4xl font-bold text-white dark:bg-transparent dark:text-white">
          You do not have access to this page
          <p className="text-brand-primary">
            You have {`'${userRole.toUpperCase()}'`} permission but require{" "}
            {"'OWNER' "}
            permission
          </p>
        </main>
      )}
    </>
  );
}
