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
      <nav className="flex w-full justify-between px-8 py-4" id="global-nav">
        <Link
          to="/"
          className="font-Tabac-Slab text-4xl font-black text-brand-primary"
        >
          CallCaster
        </Link>
        {workspaces != null && (
          <WorkspaceSelectorCombobox workspaces={workspaces} />
        )}
        <div className="flex items-center gap-4">
          <NavLink
            to="/workspaces"
            className="rounded-sm bg-secondary px-4 py-2 font-bold text-brand-primary 
                      transition-colors duration-150 ease-in-out hover:bg-accent dark:hover:bg-accent-foreground"
          >
            Workspaces
          </NavLink>
          {isSignedIn ? (
            <Button
              variant="destructive"
              className="px-4 py-2 text-center font-Zilla-Slab text-xl font-bold"
              type="button"
              onClick={() => handleSignOut()}
            >
              Log Out
            </Button>
          ) : (
            <div className="flex items-center gap-4">
              <Button
                asChild
                className="rounded-md bg-brand-primary px-4 py-1 text-center font-Zilla-Slab text-xl font-bold text-white transition-colors 
              ease-in-out hover:bg-white hover:text-brand-primary"
              >
                <Link to="/signin">Sign In</Link>
              </Button>
              <Button
                asChild
                className="rounded-md bg-brand-primary bg-zinc-700 px-4 py-1 text-center font-Zilla-Slab text-xl font-bold text-white 
              transition-colors ease-in-out hover:bg-zinc-400"
              >
                <Link to="/signup">Sign Up</Link>
              </Button>
            </div>
          )}
          <ModeToggle />
        </div>
      </nav>
    </header>
  );
}
