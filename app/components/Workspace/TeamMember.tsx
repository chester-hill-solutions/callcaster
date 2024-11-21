import { clsx } from "clsx";
import { useTheme } from "next-themes";
import { GrUserSettings } from "react-icons/gr";
import { Button } from "~/components/ui/button";
import { capitalize } from "~/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";

import { Form } from "@remix-run/react";
import { MdCancel } from "react-icons/md";
import { User } from "~/lib/types";

export enum MemberRole {
  Owner = "owner",
  Admin = "admin",
  Member = "member",
  Caller = "caller",
}

export const handleIconStyles = (memberRole: MemberRole): string =>
  clsx(
    "aspect-square w-8 rounded-full",
    memberRole === MemberRole.Owner && "bg-green-500",
    memberRole === MemberRole.Member && "bg-cyan-500",
    memberRole === MemberRole.Caller && "bg-rose-500",
    memberRole === MemberRole.Admin && "bg-purple-500",
  );
export const handleRoleTextStyles = (memberRole: MemberRole): string =>
  clsx(
    "font-Zilla-Slab font-semibold italic",
    memberRole === MemberRole.Owner && "text-green-500",
    memberRole === MemberRole.Member && "text-cyan-500",
    memberRole === MemberRole.Caller && "text-rose-500",
    memberRole === MemberRole.Admin && "text-purple-500",
  );

  type UserWithRole = Partial<User> & { role: string };


export default function TeamMember({
  member,
  userRole,
  memberIsUser,
  workspaceOwner,
}: {
  member: UserWithRole;
  userRole: MemberRole;
  memberIsUser: boolean;
  workspaceOwner: UserWithRole;
}) {  
  const memberRole = member.role;
  const firstName = member.first_name ? capitalize(member.first_name) : "Unnamed";  
  const lastName = member.last_name ? capitalize(member.last_name) : "";
  const memberName = `${firstName} ${lastName}`;

  const iconStyles = handleIconStyles(memberRole as MemberRole);
  const roleTextStyles = handleRoleTextStyles(memberRole as MemberRole);

  const { theme } = useTheme();
  const memberIsOwner = memberRole === MemberRole.Owner;
  // console.log("User role :", userRole);
  return (
    <div className="flex w-full justify-between rounded-md border-2 border-black bg-transparent p-2 text-xl shadow-sm dark:border-white">
      <div className="flex items-center gap-2">
        <div className={iconStyles} />
        <p className="pr-4 font-semibold">{member.username}</p>
      </div>
      <div className="flex items-center gap-2">
        <p className={roleTextStyles}>{capitalize(memberRole)}</p>
        {!memberIsOwner && (
          <Sheet>
            {userRole !== MemberRole.Caller && memberRole !== "invited" && (
              <SheetTrigger asChild>
                <Button className="h-fit rounded-full bg-transparent p-2">
                  {theme === "dark" ? (
                    <GrUserSettings
                      size="16px"
                      className="mx-auto aspect-square w-fit"
                      color="white"
                    />
                  ) : (
                    <GrUserSettings
                      size="16px"
                      className="mx-auto aspect-square w-fit"
                      color="black"
                    />
                  )}
                </Button>
              </SheetTrigger>
            )}
            {userRole !== MemberRole.Caller && memberRole === "invited" && (
              <Form method="POST">
                <input type="hidden" value="cancelInvite" name="formName" id="formName"/>
                <input type="hidden" value={member.id} name="userId" id="userId"/>
              <Button className="h-fit rounded-full bg-transparent p-2" type="submit">
                {theme === "dark" ? (
                  <MdCancel
                    size="16px"
                    className="mx-auto aspect-square w-fit"
                    color="white"
                  />
                ) : (
                  <MdCancel
                    size="16px"
                    className="mx-auto aspect-square w-fit"
                    color="black"
                  />
                )}
              </Button>
              </Form>
            )}

            <SheetContent className="z-[100] flex flex-col gap-4 bg-white dark:bg-inherit">
              <SheetHeader>
                <SheetTitle>Manage Team Member</SheetTitle>
                <SheetDescription>
                  Change the Team Member's permissions or remove them from the
                  workspace.
                </SheetDescription>
              </SheetHeader>
              <h4 className="text-center text-2xl font-bold text-black dark:text-white">
                {memberName}
              </h4>
              {userRole === MemberRole.Owner ||
              (userRole === MemberRole.Admin &&
                memberRole !== MemberRole.Admin) ? (
                <>
                  <Form method="POST" className="flex w-full flex-col gap-4">
                    <input type="hidden" name="formName" value="updateUser" />
                    <input type="hidden" name="user_id" value={member.id} />
                    <label
                      htmlFor="updated_workspace_role"
                      className="flex w-full flex-col gap-2 font-Zilla-Slab text-lg font-semibold dark:text-white"
                    >
                      Workspace Role
                      <select
                        className="rounded-md border-2 border-black px-2 py-1 dark:border-white dark:font-normal"
                        name="updated_workspace_role"
                        id="updated_workspace_role"
                        defaultValue={memberRole}
                        required
                      >
                        {Object.values(MemberRole).map((role) => {
                          if (role.valueOf() === "owner") {
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
                    <Button
                      className="border-2 border-black dark:border-white"
                      variant="outline"
                    >
                      Update Team Member
                    </Button>
                  </Form>

                  {userRole === MemberRole.Owner && (
                    <Form
                      method="POST"
                      name="transferWorkspaceOwnership"
                      className="w-full"
                    >
                      <input
                        type="hidden"
                        name="formName"
                        value="transferWorkspaceOwnership"
                      />
                      <input
                        type="hidden"
                        name="workspace_owner_id"
                        value={workspaceOwner.id}
                      />
                      <input type="hidden" name="user_id" value={member.id} />
                      <Button className="w-full bg-orange-400 hover:bg-orange-700">
                        Transfer Workspace Ownership
                      </Button>
                    </Form>
                  )}

                  <Form method="POST" className="w-full">
                    <input type="hidden" name="formName" value="deleteUser" />
                    <input type="hidden" name="user_id" value={member.id} />
                    <Button className="w-full" variant="destructive">
                      Remove Team Member
                    </Button>
                  </Form>
                </>
              ) : memberIsUser ? (
                <></>
              ) : (
                <p className="text-center">
                  You do not have permission to edit this user
                </p>
              )}
              {memberIsUser && (
                <Form method="POST" className="w-full">
                  <input type="hidden" name="formName" value="deleteSelf" />
                  <input type="hidden" name="user_id" value={member.id} />
                  <Button className="w-full" variant="destructive">
                    Quit This Workspace
                  </Button>
                </Form>
              )}
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}
