import { TypedResponse } from "@remix-run/node";
import { Link, NavLink } from "@remix-run/react";
import { AuthError } from "@supabase/supabase-js";
import { ModeToggle } from "./mode-toggle";
import { Button } from "./ui/button";
import WorkspaceSelectorCombobox from "./WorkspaceSelectorCombobox";
import { WorkspaceData } from "~/lib/types";

export default function Navbar({
  className,
  handleSignOut,
  workspaces,
  isSignedIn,
}: {
  className?: string;
  handleSignOut: () => Promise<
    TypedResponse<{
      error: AuthError | null;
    }>
  >;
  workspaces: WorkspaceData;
  isSignedIn: boolean;
}) {
  console.log(workspaces);
  return (
    <header className={`w-full ${className}`}>
      <nav
        className="flex w-full items-center gap-1 px-4 py-4 sm:justify-between sm:gap-0 sm:px-8"
        id="global-nav"
      >
        <Link
          to="/"
          className="hidden font-Tabac-Slab text-4xl font-black text-brand-primary sm:block"
        >
          CallCaster
        </Link>
        <Link
          to="/"
          className="block font-Tabac-Slab text-4xl font-black text-brand-primary sm:hidden"
        >
          CC
        </Link>
        {workspaces != null && (
          <WorkspaceSelectorCombobox workspaces={workspaces} />
        )}
        <div className="flex items-center sm:gap-4">
          <NavLink
            to="/workspaces"
            className="rounded-sm bg-secondary px-2 py-2 font-bold text-brand-primary transition-colors 
                      duration-150 ease-in-out hover:bg-accent dark:hover:bg-accent-foreground sm:px-4"
          >
            Workspaces
          </NavLink>
          <NavLink
            to="/other-services"
            className="rounded-sm bg-secondary px-2 py-2 font-bold text-brand-primary transition-colors 
                      duration-150 ease-in-out hover:bg-accent dark:hover:bg-accent-foreground sm:px-4"
          >
            Services
          </NavLink>
          {isSignedIn ? (
            <Button
              variant="destructive"
              className="px-4 py-2 text-center font-Zilla-Slab text-base font-bold sm:text-xl"
              type="button"
              onClick={() => handleSignOut()}
            >
              Log Out
            </Button>
          ) : (
            <Link
              to="/signin"
              className="rounded-md bg-brand-primary px-2 py-1 text-center font-Zilla-Slab text-xl font-bold text-white shadow-md transition-colors ease-in-out hover:bg-white 
          hover:text-brand-primary sm:px-4 sm:text-2xl"
            >
              <p className="block sm:hidden">Login</p>
              <p className="hidden sm:block">Sign In</p>
            </Link>
          )}
          <ModeToggle />
        </div>
      </nav>
    </header>
  );
}
