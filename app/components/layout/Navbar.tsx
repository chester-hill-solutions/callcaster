import { Link, NavLink, Params, useLocation } from "react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, User as UserIcon, LogOut } from "lucide-react";
import { capitalize } from "@/lib/utils";
import { ModeToggle } from "@/components/shared/mode-toggle";
import { MobileMenu } from "./Navbar.MobileMenu";
import type {
  RootNavbarUser,
  RootWorkspaceSummary,
} from "@/root.loader.server";

type NavbarProps = {
  className?: string;
  handleSignOut: () => Promise<
    { success: string | null; error: string | null }
  >;
  workspaces: RootWorkspaceSummary[] | null;
  isSignedIn: boolean;
  user: RootNavbarUser | null;
  params: Params<string>;
};

export const NavButton = ({
  to,
  children,
  className = "",
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `rounded-lg border px-3 py-2 font-Zilla-Slab text-base font-bold transition-colors duration-150 ease-in-out ${
        isActive
          ? "border-brand-primary bg-brand-primary text-primary-foreground"
          : // The navbar keeps its pale brand-blue in both themes, so the pills
            // stay light regardless of theme rather than following bg-background.
            "border-transparent bg-white/70 text-brand-primary hover:border-brand-primary/30 hover:bg-white"
      } ${className}`
    }
  >
    {children}
  </NavLink>
);

const UserDropdownMenu = ({
  user,
  handleSignOut,
  workspaceId,
}: {
  user: RootNavbarUser | null;
  handleSignOut: () => Promise<
    { success: string | null; error: string | null }
  >;
  workspaceId: string | undefined;
}) =>
  user && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-testid="navbar-user-menu"
          variant="outline"
          className="relative border border-border bg-background/90 transition-colors duration-150 hover:border-foreground hover:bg-accent dark:text-secondary-foreground dark:hover:bg-accent"
        >
          <UserIcon className="h-5 w-5" />
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
          <Link to="/account">
            <UserIcon className="mr-2 h-4 w-4" />
            Account
          </Link>
        </DropdownMenuItem>
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
        {workspaceId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/workspaces/${workspaceId}/settings`}>
                Workspace settings
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          id="logoutButton"
          data-testid="logout-button"
          onSelect={() => {
            void handleSignOut();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

export default function Navbar({
  className,
  handleSignOut,
  workspaces: _workspaces,
  isSignedIn,
  user,
  params,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const workspaceId = params.id;
  const location = useLocation();
  const [prevPathname, setPrevPathname] = useState(location.pathname);

  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setMobileMenuOpen(false);
  }
  return location.pathname.endsWith("call") ||
    (location.pathname.includes("survey") &&
      !location.pathname.includes("workspaces")) ? (
    <div></div>
  ) : (
    <header className={`w-full border-b border-border/70 ${className}`}>
      <nav className="relative mx-auto flex w-full items-center justify-between px-4 py-3 sm:h-[80px] sm:px-6">
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
        <div className="hidden items-center space-x-3 sm:flex">
          <NavButton to="/pricing">Pricing</NavButton>
          <NavButton to="/docs">Docs</NavButton>
          <a
            href="mailto:info@callcaster.ca"
            className="rounded-lg border border-transparent bg-white/70 px-3 py-2 font-Zilla-Slab text-base font-bold text-brand-primary transition-colors duration-150 ease-in-out hover:border-brand-primary/30 hover:bg-white"
          >
            Support
          </a>{" "}
          {!isSignedIn && (
            <>
              <NavButton to="/signin">Sign In</NavButton>
              <NavButton to="/signup">Sign Up</NavButton>
            </>
          )}
          {isSignedIn && <NavButton to={"/workspaces"}>Workspaces</NavButton>}
          {user && (
            <UserDropdownMenu
              user={user}
              handleSignOut={handleSignOut}
              workspaceId={workspaceId}
            />
          )}
          <ModeToggle />
        </div>
        <div className="flex items-center gap-2 sm:hidden">
          <ModeToggle />
          <button
            type="button"
            className="rounded-md border border-border bg-background/80 p-2 text-2xl"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </nav>
      <div id="mobile-navigation-menu">
        <MobileMenu
          open={mobileMenuOpen}
          onOpenChange={setMobileMenuOpen}
          isSignedIn={isSignedIn}
          user={user ?? null}
          handleSignOut={handleSignOut}
        />
      </div>
    </header>
  );
}
