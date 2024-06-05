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

export enum MemberRole {
  Owner = "owner",
  Member = "member",
  Caller = "caller",
  Admin = "admin",
}

type TeamMemberProps = {
  memberName: string;
  memberRole: MemberRole;
};

export default function TeamMember({ member }) {
  const memberRole = member.user_workspace_role;
  const firstName =
    member.first_name === null ? "No" : capitalize(member.first_name);
  const lastName =
    member.last_name === null ? "Name" : capitalize(member.last_name);
  const memberName = `${firstName} ${lastName}`;

  const iconStyles = clsx(
    "aspect-square w-8 rounded-full",
    memberRole === MemberRole.Owner && "bg-green-500",
    memberRole === MemberRole.Member && "bg-cyan-500",
    memberRole === MemberRole.Caller && "bg-rose-500",
    memberRole === MemberRole.Admin && "bg-purple-500",
  );
  const roleTextStyles = clsx(
    "font-Zilla-Slab font-semibold italic",
    memberRole === MemberRole.Owner && "text-green-500",
    memberRole === MemberRole.Member && "text-cyan-500",
    memberRole === MemberRole.Caller && "text-rose-500",
    memberRole === MemberRole.Admin && "text-purple-500",
  );

  const { theme } = useTheme();
  const isOwner = memberRole === MemberRole.Owner;
  return (
    <div className="flex w-full justify-between rounded-md border-2 border-black bg-transparent p-2 text-xl shadow-sm dark:border-white">
      <div className="flex items-center gap-2">
        <div className={iconStyles} />
        <p className="font-semibold">{memberName}</p>
      </div>
      <div className="flex items-center gap-2">
        <p className={roleTextStyles}>{capitalize(memberRole)}</p>
        {!isOwner && (
          <Sheet>
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
              <Form method="POST" className="flex w-full flex-col gap-4">
                <input type="hidden" name="formName" value="updateUser" />
                <input type="hidden" name="username" value={member.username} />
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
                      // console.log(role.valueOf());
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
                  {/* <Select name="workspace_role">
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={capitalize(memberRole)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="caller">Caller</SelectItem>
                  </SelectContent>
                </Select> */}
                </label>
                <Button
                  className="border-2 border-black dark:border-white"
                  variant="outline"
                >
                  Update Team Member
                </Button>
              </Form>
              <Form method="POST" className="w-full">
                <input type="hidden" name="formName" value="deleteUser" />
                <input type="hidden" name="username" value={member.username} />
                <Button className="w-full" variant="destructive">
                  Remove Team Member
                </Button>
              </Form>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}
