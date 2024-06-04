import { FaSearch } from "react-icons/fa";
import { IoPersonAdd } from "react-icons/io5";

import TeamMember from "~/components/Workspace/TeamMember";

import { ActionFunctionArgs } from "@remix-run/node";
import { Form, json, useActionData, useLoaderData } from "@remix-run/react";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { getWorkspaceUsers } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { capitalize } from "~/lib/utils";
import {
  handleAddUser,
  handleDeleteUser,
  handleUpdateUser,
} from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const { data: users, error } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });

  if (serverSession) {
    // console.log("here", users);
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

    const hasAccess = userRole === "owner";

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
    default: {
      break;
    }
  }

  return json({ data: null, error: "Unrecognized action called" }, { headers });
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

  const [showForm, setShowForm] = useState<boolean>(false);

  const settings = (
    <main className="mx-auto mt-8 flex h-full w-fit flex-col gap-4 rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white">
      <h3 className="text-center font-Zilla-Slab text-4xl font-bold">
        Manage Team Members
      </h3>
      <div className="flex flex-col">
        <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
          Owner
        </p>
        <TeamMember member={workspaceOwner} />
      </div>
      <div className="flex flex-col">
        <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
          Members
        </p>
        <ul className=" flex w-full flex-col items-center gap-2">
          {users?.map((user) => {
            if (user.user_workspace_role === "owner") {
              return <></>;
            }
            return (
              <li key={Math.floor(Math.random() * 1000)} className="w-full">
                <TeamMember member={user} />
              </li>
            );
          })}
          {/* <li className="w-full">
            <TeamMember memberName="Some Admin" memberRole={MemberRole.Admin} />
          </li>

          <li className="w-full">
            <TeamMember
              memberName="Some Member"
              memberRole={MemberRole.Member}
            />
          </li>

          <li className="w-full">
            <TeamMember
              memberName="Some Caller"
              memberRole={MemberRole.Caller}
            />
          </li> */}
        </ul>
      </div>

      <div className="flex flex-col">
        <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
          Add New Member
        </p>
        {!showForm && (
          <Button
            onClick={() => setShowForm(true)}
            className="h-fit w-full border-2 border-black bg-transparent dark:border-white"
          >
            {theme === "dark" ? (
              <IoPersonAdd size="32px" className="" color="white" />
            ) : (
              <IoPersonAdd size="32px" className="" color="black" />
            )}
          </Button>
        )}
        {showForm && (
          <Form method="POST" className="flex w-full flex-col gap-4">
            {actionData?.error && (
              <p className="text-center text-2xl font-bold text-brand-primary">
                {actionData.error}
              </p>
            )}
            <input type="hidden" name="formName" value="addUser" />
            <label
              htmlFor="username"
              className="flex w-full flex-col font-Zilla-Slab text-lg font-semibold dark:text-white"
            >
              User Name
              <input
                type="text"
                name="username"
                id="username"
                className="rounded-md border border-black bg-transparent px-4 py-2 dark:border-white"
              />
            </label>

            <label
              htmlFor="username_search"
              className="flex w-full flex-col font-Zilla-Slab text-lg font-semibold dark:text-white"
            >
              <div className="flex items-center gap-2">
                <FaSearch size="16px" />
                Search
              </div>
              <input
                type="search"
                name="username_search"
                id="username_search"
                className="rounded-md border border-black bg-transparent px-4 py-2 dark:border-white"
              />
            </label>
            <Button className="">Invite New User</Button>
          </Form>
        )}
      </div>
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
