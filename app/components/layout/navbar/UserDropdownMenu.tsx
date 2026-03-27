import { TypedResponse } from "@remix-run/node";
import { Link, NavLink } from "@remix-run/react";
import { FaUserAlt } from "react-icons/fa";
import { MdOutlineLogout } from "react-icons/md";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, WorkspaceInvite } from "@/lib/types";
import { capitalize } from "@/lib/utils";

type UserDropdownMenuProps = {
  user: (User & { workspace_invite: WorkspaceInvite[] }) | null;
  handleSignOut: () => Promise<
    TypedResponse<{ success: string | null; error: string | null }>
  >;
  workspaceId: string | undefined;
};

export function UserDropdownMenu({
  user,
  handleSignOut,
  workspaceId,
}: UserDropdownMenuProps) {
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="relative border border-border bg-background/90 transition-colors duration-150 hover:border-foreground hover:bg-accent dark:text-secondary-foreground dark:hover:bg-accent"
        >
          <FaUserAlt size="20px" />
          {user.workspace_invite.length > 0 && (
            <div className="text-dd absolute -right-1 -top-2 h-5 w-5 items-center rounded-full bg-primary font-Zilla-Slab text-white">
              {user.workspace_invite.length}
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Profile Info:</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal">
          {capitalize(user.first_name ?? "")}
        </DropdownMenuLabel>
        <DropdownMenuLabel className="font-normal">
          {user.username}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <NavLink
            to={"/accept-invite"}
            className={
              user.workspace_invite.length > 0 ? "bg-primary text-white" : ""
            }
          >
            {user.workspace_invite.length} Pending Invitation
            {user.workspace_invite.length !== 1 ? "s" : ""}
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Button
            id="logoutButton"
            variant="ghost"
            className="w-full justify-start font-Zilla-Slab"
            onClick={handleSignOut}
          >
            <MdOutlineLogout className="mr-2 h-4 w-4" />
            <span>Log Out</span>
          </Button>
        </DropdownMenuItem>
        {workspaceId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Workspace Settings</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to={`/workspaces/${workspaceId}/settings`}>Users</Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
