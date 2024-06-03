import { FaSearch } from "react-icons/fa";
import { IoPersonAdd } from "react-icons/io5";

import TeamMember, { MemberRole } from "~/components/Workspace/TeamMember";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";

import { Form, json, useActionData, useLoaderData } from "@remix-run/react";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "next-themes";
import { Button } from "~/components/ui/button";
import { getWorkspaceUsers, testAuthorize } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { ActionFunctionArgs } from "@remix-run/node";

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
    console.log("\nJWT: ", jwt);
    console.log("USER ROLE: ", userRole);

    // const { data: authorizeData, error: authorizeError } = await testAuthorize({
    //   supabaseClient,
    //   workspaceId,
    // });

    const hasAccess = userRole === "member";

    return json({ hasAccess: hasAccess, userRole, users: users }, { headers });
  }

  return json({ hasAccess: false, userRole: null, users: null }, { headers });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const workspaceId = params.id;
  const { supabaseClient, headers, session } =
    await getSupabaseServerClientWithSession(request);
  const formData = await request.formData();

  const userName = formData.get("username") as string;
  if (!userName) {
    console.log("HERE no username");
    return json({ error: "No username provided" }, { status: 400, headers });
  }

  const { data: user, error: getUserError } = await supabaseClient
    .from("user")
    .select()
    .eq("username", userName)
    .single();

  if (user == null) {
    // console.log(`User ${userName} not found - `, getUserError);
    return json({ error: `User ${userName} not found` }, { headers });
  }
  // console.log("Selected user: ", user);

  const { data: newUser, error: errorAddingUser } = await supabaseClient
    .from("workspace_users")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: "member",
    })
    .select()
    .single();

  if (newUser == null) {
    if (errorAddingUser != null && errorAddingUser.code === "23505") {
      return json(
        { error: `User ${userName} is already in this workspace!` },
        { headers },
      );
    }
    console.log("Insert error on workspace_users: ", errorAddingUser);
    return json(
      { error: `Could not add ${userName} to workspace!` },
      { headers },
    );
  }

  return json({ newUser, error: errorAddingUser }, { headers });
};

export default function WorkspaceSettings() {
  const { hasAccess, userRole, users } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { theme } = useTheme();
  console.log("Theme", theme);
  // console.log("Users: ", users);

  const settings = (
    <main className="mx-auto mt-8 flex h-full w-fit flex-col gap-4 rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white">
      <h3 className="text-center font-Zilla-Slab text-4xl font-bold">
        Manage Team Members
      </h3>
      <div className="flex flex-col">
        <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
          Owner
        </p>
        <div
          id="team-owner"
          className=" flex w-full gap-2 rounded-md border-2 border-black p-2 text-xl dark:border-white"
        >
          <div className="aspect-square w-8 rounded-full bg-brand-primary" />
          <p className="font-semibold">Some Owner</p>
        </div>
      </div>
      <div className="flex flex-col">
        <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
          Members
        </p>
        <ul className=" flex w-full flex-col items-center gap-2">
          {users?.map((user) => (
            <li key={Math.floor(Math.random() * 1000)} className="w-full">
              <TeamMember
                memberName={user.first_name + " " + user.last_name}
                memberRole={user.user_workspace_role}
              />
            </li>
          ))}
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
        <Sheet>
          <SheetTrigger asChild>
            <Button className="h-fit w-full border-2 border-black bg-transparent dark:border-white">
              {theme === "dark" ? (
                <IoPersonAdd size="32px" className="" color="white" />
              ) : (
                <IoPersonAdd size="32px" className="" color="black" />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="z-[100] bg-white dark:bg-inherit">
            <SheetHeader>
              <SheetTitle>Invite a Team Member</SheetTitle>
              <SheetDescription>
                Enter a username or use the search function to add a new member
                to your workspace team.
              </SheetDescription>
            </SheetHeader>
            <Form method="POST" className="mt-4 flex w-full flex-col gap-4">
              {actionData?.error && (
                <p className="text-center text-2xl font-bold text-brand-primary">
                  {actionData.error}
                </p>
              )}
              <label
                htmlFor="username"
                className="flex w-full flex-col font-Zilla-Slab text-lg font-semibold dark:text-white"
              >
                User Name
                <input
                  type="text"
                  name="username"
                  id="username"
                  className="rounded-md border border-white bg-transparent px-4 py-2"
                />
              </label>

              <label
                htmlFor="username"
                className="flex w-full flex-col font-Zilla-Slab text-lg font-semibold dark:text-white"
              >
                <div className="flex items-center gap-2">
                  <FaSearch size="16px" />
                  Search
                </div>
                <input
                  type="text"
                  name="username"
                  id="username"
                  className="rounded-md border border-black bg-transparent px-4 py-2 dark:border-white"
                />
              </label>
              <Button className="">Invite New User</Button>
            </Form>
          </SheetContent>
        </Sheet>
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
