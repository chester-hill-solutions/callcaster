import TeamMember, { MemberRole } from "~/components/Workspace/TeamMember";

import { ActionFunctionArgs } from "@remix-run/node";
import {
  Form,
  json,
  Link,
  NavLink,
  useActionData,
  useLoaderData,
} from "@remix-run/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  getUserRole,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import {
  handleAddUser,
  handleDeleteSelf,
  handleDeleteUser,
  handleDeleteWorkspace,
  handleInviteCaller,
  handleTransferWorkspace,
  handleUpdateUser,
} from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";

import { toast, Toaster } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { capitalize } from "~/lib/utils";
import {
  MdCached,
  MdCheckCircle,
  MdError,
  MdErrorOutline,
} from "react-icons/md";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const { data: users, error } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });
  const { data: phoneNumbers, error: numbersError } =
    await getWorkspacePhoneNumbers({ supabaseClient, workspaceId });

  if (serverSession) {
    const userRole = getUserRole({ serverSession, workspaceId });
    const hasAccess = userRole !== MemberRole.Caller;

    return json(
      {
        hasAccess: hasAccess,
        userRole,
        users: users,
        activeUserId: serverSession.user.id,
        phoneNumbers,
      },
      { headers },
    );
  }

  return json(
    {
      hasAccess: false,
      userRole: null,
      users: null,
      activeUserId: serverSession.user.id,
      phoneNumbers,
    },
    { headers },
  );
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
    case "deleteSelf": {
      return handleDeleteSelf(formData, workspaceId, supabaseClient, headers);
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
    case "deleteWorkspace": {
      return handleDeleteWorkspace({ workspaceId, supabaseClient, headers });
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

function compareMembersByRole(a, b) {
  const memberRoleArray = Object.values(MemberRole);

  if (
    memberRoleArray.indexOf(a.user_workspace_role) <
    memberRoleArray.indexOf(b.user_workspace_role)
  )
    return -1;
  if (
    memberRoleArray.indexOf(a.user_workspace_role) >
    memberRoleArray.indexOf(b.user_workspace_role)
  )
    return 1;
  return 0;
}

export default function WorkspaceSettings() {
  const { hasAccess, userRole, users, activeUserId, phoneNumbers } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { theme } = useTheme();
  // console.log("Theme", theme);
  // console.log("Users: ", users);
  const workspaceOwner = users?.find(
    (user) => user.user_workspace_role === "owner",
  );
  // console.log(workspaceOwner);
  users?.sort((a, b) => compareMembersByRole(a, b));

  const [showForm, setShowForm] = useState<boolean>(false);

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (actionData?.data) {
      toast.success("Action completed succesfully!");
    }
  }, [actionData]);

  const addUserTabs = (
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
            htmlFor="new_user_workspace_role"
            className="flex w-full flex-col gap-2 text-xl font-semibold dark:text-white"
          >
            Workspace Role
            <select
              className="rounded-md border-2 border-black px-2 py-1 dark:border-white dark:font-normal"
              name="new_user_workspace_role"
              id="new_user_workspace_role"
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
            <Button className="h-full w-full font-Zilla-Slab text-2xl font-semibold">
              Add New User
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
    <div className="flex flex-col">
      <div className="flex justify-end pr-4 pt-4">
        <Button
          asChild
          variant="outline"
          className="h-full w-fit border-0 border-black bg-zinc-600 font-Zilla-Slab text-2xl font-semibold text-white dark:border-white"
        >
          <Link to=".." relative="path">
            Back
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap justify-center">
        <div className="m-8 flex w-fit flex-col gap-4 rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white">
          <h3 className="text-center font-Zilla-Slab text-4xl font-bold">
            Manage Team Members
          </h3>
          <div className="flex flex-col">
            <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
              Owner
            </p>
            <TeamMember
              member={workspaceOwner}
              userRole={userRole}
              memberIsUser={workspaceOwner.id === activeUserId}
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
                      userRole={userRole}
                      memberIsUser={member.id === activeUserId}
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
            {hasAccess ? addUserTabs : callerSelfDeleteForm}
          </div>
          {/* {userRole === MemberRole.Owner && (
        <Form method="POST" className="w-full">
          <input type="hidden" name="formName" value="deleteWorkspace" />
          <Button variant={"destructive"} className="w-full">
            Delete This Workspace
          </Button>
        </Form>
      )} */}
          <Toaster richColors />
        </div>
        <div className="m-8 flex w-fit flex-col justify-between gap-4 rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white">
          <div>
            <h3 className="text-center font-Zilla-Slab text-4xl font-bold">
              Manage Phone Numbers
            </h3>
            <div className="flex flex-col py-4">
              <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
                Phone Numbers
              </p>
              <ul className=" flex w-full flex-col items-center gap-2">
                {phoneNumbers?.map((number) => {
                  return (
                    <li key={number.id} className="w-full">
                      <div className="flex w-full items-center justify-between bg-transparent p-2 text-xl shadow-sm dark:border-white">
                        <p className="font-semibold">{number.phone_number}</p>
                        <div>
                          {number.capabilities.verification_status ===
                          "success" ? (
                            <div className="flex items-center gap-2">
                              <p className="text-xs uppercase">
                                {number.capabilities.verification_status}
                              </p>
                              <MdCheckCircle fill="#008800" size={24} />
                            </div>
                          ) : number.capabilities.verification_status ===
                            "failed" ? (
                            <div className="flex items-center gap-2">
                              <p className="text-xs uppercase">
                                {number.capabilities.verification_status}
                              </p>
                              <MdError fill="#880000" size={24} />
                            </div>
                          ) : number.capabilities.verification_status ===
                            "pending" ? (
                            <div className="i gap-2tems-center flex">
                              <p className="text-xs uppercase">
                                {number.capabilities.verification_status}
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
                className="h-full w-full font-Zilla-Slab text-2xl font-semibold"
              >
                <NavLink to={"./numbers"} relative="path">
                  Manage Numbers
                </NavLink>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
