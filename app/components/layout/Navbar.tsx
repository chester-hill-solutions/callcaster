import { Link, NavLink, Params, useLocation, useNavigate } from "react-router";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Check,
  ChevronDown,
  Menu,
  User as UserIcon,
  LogOut,
  MailOpen,
} from "lucide-react";
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
      `inline-flex h-10 items-center rounded-lg border px-2.5 font-Zilla-Slab text-sm font-bold transition-colors duration-150 ease-in-out ${
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

const WorkspacePicker = ({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: RootWorkspaceSummary[];
  activeWorkspaceId: string | undefined;
}) => {
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="navbar-workspace-picker"
          role="combobox"
          aria-expanded={open}
          aria-controls="navbar-workspace-picker-list"
          aria-label={active ? `Switch workspace, current: ${active.name}` : "Workspaces"}
          className="flex h-10 max-w-[200px] items-center gap-1 rounded-lg border border-transparent bg-white/70 px-2.5 font-Zilla-Slab text-sm font-bold text-brand-primary transition-colors duration-150 hover:border-brand-primary/30 hover:bg-white"
        >
          <span className="truncate">{active ? active.name : "Workspaces"}</span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {/* PopoverContent already draws the border/shadow; flatten Command's. */}
        <Command className="border-0 shadow-none">
          <CommandInput placeholder="Search workspaces…" />
          <CommandList
            id="navbar-workspace-picker-list"
            aria-label="Workspaces"
            className="max-h-64 overflow-y-auto"
            renderEmptyState={() => <CommandEmpty>No workspaces found.</CommandEmpty>}
          >
            <CommandGroup heading="Workspaces">
              {workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.id}
                  id={workspace.id}
                  textValue={workspace.name}
                  onAction={() => go(`/workspaces/${workspace.id}`)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 truncate">{workspace.name}</span>
                  {workspace.id === activeWorkspaceId ? (
                    <Check className="h-4 w-4 shrink-0" aria-hidden />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div role="separator" className="my-1 h-px bg-border/50" />
          <button
            type="button"
            id="all-workspaces"
            onClick={() => go("/workspaces")}
            className="flex min-h-7 w-full items-center rounded-md border-t border-border/60 px-2 py-1.5 text-left text-sm outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
          >
            All workspaces
          </button>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const UserDropdownMenu = ({
  user,
  handleSignOut,
}: {
  user: RootNavbarUser | null;
  handleSignOut: () => Promise<
    { success: string | null; error: string | null }
  >;
}) =>
  user && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-testid="navbar-user-menu"
          variant="outline"
          aria-label={
            user.workspace_invite.length > 0
              ? `Account menu, ${user.workspace_invite.length} pending invitation${
                  user.workspace_invite.length === 1 ? "" : "s"
                }`
              : "Account menu"
          }
          // The navbar surface stays pale brand-blue in both themes, so this
          // control cannot follow bg-background/foreground the way the rest of
          // the app does — dark:text-secondary-foreground put near-black text
          // on a near-black button. Mirror ModeToggle, its neighbour.
          className="relative border border-transparent bg-white/70 text-brand-primary transition-colors duration-150 hover:border-brand-primary/30 hover:bg-white dark:bg-black/70 dark:text-brand-secondary dark:hover:bg-black"
        >
          <UserIcon className="h-5 w-5" aria-hidden />
          {user.workspace_invite.length > 0 && (
            <div
              aria-hidden
              className="absolute -right-1 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary font-Zilla-Slab text-xs text-primary-foreground"
            >
              {user.workspace_invite.length}
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
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
            <MailOpen className="mr-2 h-4 w-4" />
            {`Invitations: ${user.workspace_invite.length}`}
          </NavLink>
        </DropdownMenuItem>
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
  workspaces,
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
      <nav className="relative mx-auto flex w-full items-center justify-between px-4 py-3 sm:px-6">
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
        <div className="hidden items-center gap-2 sm:flex">
          <NavButton to="/docs">Docs</NavButton>
          {!isSignedIn && (
            <>
              <NavButton to="/signin">Sign In</NavButton>
              <NavButton to="/signup">Get started</NavButton>
            </>
          )}
          {isSignedIn &&
            (workspaces && workspaces.length > 0 ? (
              <WorkspacePicker
                workspaces={workspaces}
                activeWorkspaceId={workspaceId}
              />
            ) : (
              <NavButton to={"/workspaces"}>Workspaces</NavButton>
            ))}
          {user && (
            <UserDropdownMenu user={user} handleSignOut={handleSignOut} />
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
          workspaces={workspaces}
          activeWorkspaceId={workspaceId}
        />
      </div>
    </header>
  );
}
