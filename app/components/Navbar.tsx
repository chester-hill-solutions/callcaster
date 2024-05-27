import { AuthError } from "@supabase/supabase-js";
import { ModeToggle } from "./mode-toggle";
import { Button } from "./ui/button";
import { TypedResponse } from "@remix-run/node";
import { Link, NavLink } from "@remix-run/react";

export default function Navbar({
  className,
  handleSignOut,
}: {
  className?: string;
  handleSignOut?: () => Promise<
    TypedResponse<{
      error: AuthError | null;
    }>
  >;
}) {
  return (
    <header className={`w-full ${className}`}>
      <nav className="flex w-full justify-between px-8 py-4" id="global-nav">
        <Link
          to="/"
          className="font-Tabac-Slab text-4xl font-black text-brand-primary"
        >
          CallCaster
        </Link>
         <div className="flex items-center gap-4">
           <NavLink
            to="/workspaces"
            className="rounded-sm bg-secondary px-4 py-2 font-bold text-brand-primary 
                      transition-colors duration-150 ease-in-out"
          >
            Log in
          </NavLink>
          {/* <Button
            variant="destructive"
            className="px-4 py-2 text-center"
            type="button"
            onClick={() => handleSignOut()}
          >
            Log Out
          </Button> */}
          <ModeToggle />
        </div> 
      </nav>
    </header>
  );
}
