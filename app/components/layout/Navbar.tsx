import { useEffect, useState } from "react";
import { TypedResponse } from "@remix-run/node";
import { Link, NavLink, Params, useLocation } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { User, WorkspaceData, WorkspaceInvite } from "~/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { FaBars, FaUserAlt } from "react-icons/fa";
import { MdOutlineLogout } from "react-icons/md";
import { capitalize } from "~/lib/utils";
import { MobileMenu } from "./Navbar.MobileMenu";

type NavbarProps = {
  className?: string;
  handleSignOut: () => Promise<
    TypedResponse<{ success: string | null; error: string | null }>
  >;
  workspaces: WorkspaceData[] | null;
  isSignedIn: boolean;
  user: User & { workspace_invite: WorkspaceInvite[] } | null;
  params: Params<string>;
};

export const NavButton = ({ to, children, className = "" }: { to: string, children: React.ReactNode, className?: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `rounded-md px-3 py-2 font-Zilla-Slab text-lg font-bold transition-colors duration-150 ease-in-out ${
        isActive
          ? "bg-brand-primary text-white"
          : "bg-secondary text-brand-primary hover:bg-white"
      } ${className}`
    }
  >
    {children}
  </NavLink>
);

const UserDropdownMenu = ({ user, handleSignOut, workspaceId }: { user: User & { workspace_invite: WorkspaceInvite[] } | null, handleSignOut: () => Promise<TypedResponse<{ success: string | null; error: string | null }>>, workspaceId: string | undefined }) => user && (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="outline"
        className="relative border-2 border-zinc-700/30 transition-colors duration-150 hover:border-black hover:bg-inherit dark:bg-inherit dark:text-black"
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

export default function Navbar({
  className,
  handleSignOut,
  workspaces,
  isSignedIn,
  user,
  params,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const workspaceId = params.id;
  const location = useLocation();
  const [loc, setLoc] = useState(location);

  useEffect(() => {
    if (location.pathname !== loc.pathname) {
      setMobileMenuOpen(false);
      setLoc(location);
    }
  }, [loc, location]);  
  return loc.pathname.endsWith("call") || loc.pathname.includes("survey") && !loc.pathname.includes("workspaces") ? (
    <div></div>
  ) : (
    <header className={`w-full ${className}`}>
      <nav className="relative flex w-full items-center justify-between px-4 py-4 sm:h-[80px] sm:px-8">
        <Link
          to="/"
          className="hidden font-Tabac-Slab text-4xl font-black text-brand-primary sm:block"
        >
          CallCaster
        </Link>
        <Link
          to="/"
          className="font-Tabac-Slab text-4xl font-black text-brand-primary sm:hidden"
        >
          CC
        </Link>
        <div className="hidden items-center space-x-4 sm:flex">
          <NavButton to="/pricing">Pricing</NavButton>
          {/* <NavButton to="/">Home</NavButton> */}
          {/*           <NavButton to="/services">Services</NavButton>
           */}{" "}
          {!isSignedIn && (
            <>
              <NavButton to="/signin">Sign In</NavButton>
              <NavButton to="/signup">Sign Up</NavButton>
            </>
          )}
          {workspaces && <NavButton to={"/workspaces"}>Workspaces</NavButton>}
          {user && (
            <UserDropdownMenu
              user={user}
              handleSignOut={handleSignOut}
              workspaceId={workspaceId}
            />
          )}
          {/* <ModeToggle /> */}
        </div>
        <button
          className="text-2xl sm:hidden"
          onClick={() => setMobileMenuOpen(true)}
        >
          <FaBars />
        </button>
      </nav>
      {mobileMenuOpen && (
        <MobileMenu
          isSignedIn={isSignedIn}
          user={user ?? null}
          handleSignOut={handleSignOut}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}
    </header>
  );
}
